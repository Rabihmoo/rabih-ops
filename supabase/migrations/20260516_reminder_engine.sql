-- Rabih Ops — Phase B: Reminder engine
-- =====================================================================
-- Tables:
--   * notifications_queue — pending/sent/dismissed/cancelled rows for each
--                          reminder; the cron drain promotes pending→sent.
--   * notification_log    — one row per delivery attempt (in_app today;
--                          extends to telegram/email when senders ship).
--
-- Behaviour:
--   * Trigger on tasks syncs the three *_reminder_at fields into queue rows.
--     Status flip to finished/archived cancels all pending rows for the task.
--   * Recipient = coalesce(assigned_to, created_by).
--   * Phase B only ever enqueues channel='in_app'. Telegram/email/calendar
--     are accepted as enum values for future phases but never created here.
--   * Partial unique index dedupes pending (entity, kind, recipient, fire_at).
--
-- Cron jobs (pg_cron, falls back to Edge Functions if unavailable):
--   * reminders-drain   * * * * *  → _drain_reminders()
--   * recurring-spawn   0 * * * *  → _spawn_due_recurring()
--   * followup-daily    0 6 * * *  → _enqueue_followup_due_today()  (06:00 UTC = 08:00 Maputo)
--
-- Audit verbs added: reminder_enqueued, reminder_sent, reminder_dismissed,
--                    reminder_cancelled.

begin;

-- =========================================================
-- 0. Widen audit_log.source CHECK to admit trigger/cron emitters
-- =========================================================
-- The original constraint only allowed web/whatsapp/api. Phase B emits
-- audit rows from triggers and pg_cron jobs; reserving 'telegram' here too
-- so the Phase C Edge Function doesn't need a fresh migration just for that.

alter table public.audit_log drop constraint if exists audit_log_source_check;
alter table public.audit_log add constraint audit_log_source_check
  check (source in ('web','whatsapp','api','trigger','cron','telegram','email'));

-- =========================================================
-- 1. notifications_queue
-- =========================================================

create table if not exists public.notifications_queue (
  id            bigserial primary key,
  kind          text not null check (kind in (
                  'start_reminder','follow_up_reminder','deadline_reminder',
                  'recurring_spawn','followup_due'
                )),
  entity_type   text not null check (entity_type in ('task','follow_up')),
  entity_id     uuid not null,
  recipient_id  uuid not null references public.users(id),
  channel       text not null default 'in_app'
                  check (channel in ('in_app','telegram','email','calendar')),
  fire_at       timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending','sent','dismissed','cancelled','failed')),
  payload       jsonb,
  attempts      int  not null default 0,
  last_error    text,
  fired_at      timestamptz,
  dismissed_at  timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz not null default now()
);

comment on table  public.notifications_queue is
  'Per-reminder rows; cron drain transitions pending→sent for in_app, others stay pending until their sender ships.';
comment on column public.notifications_queue.kind         is 'Source/category of the reminder.';
comment on column public.notifications_queue.entity_type  is 'task | follow_up — which row the reminder is about.';
comment on column public.notifications_queue.entity_id    is 'Task or follow-up uuid.';
comment on column public.notifications_queue.recipient_id is 'Single recipient (assignee-or-creator). V1 has no watchers list.';
comment on column public.notifications_queue.channel      is 'V1 only enqueues in_app. Other values accepted for forward compat.';
comment on column public.notifications_queue.fire_at      is 'When the cron drain should pick this row up.';
comment on column public.notifications_queue.status       is 'pending → sent → dismissed; cancelled is a terminal escape.';
comment on column public.notifications_queue.payload      is 'Snapshot of title/branch/etc at enqueue time, for rendering.';

create index if not exists idx_notifications_queue_pending_fire
  on public.notifications_queue (fire_at)
  where status = 'pending';

create index if not exists idx_notifications_queue_recipient_inbox
  on public.notifications_queue (recipient_id, status, fired_at desc);

create index if not exists idx_notifications_queue_entity_pending
  on public.notifications_queue (entity_type, entity_id)
  where status = 'pending';

-- Dedup: at most one pending row per (entity, kind, recipient, fire_at).
-- Prevents trigger re-syncs from creating duplicates on idempotent updates,
-- and prevents the daily follow-up cron from doubling up on the same date.
drop index if exists public.uq_notifications_queue_pending_dedup;
create unique index uq_notifications_queue_pending_dedup
  on public.notifications_queue (entity_type, entity_id, kind, recipient_id, fire_at)
  where status = 'pending';

-- =========================================================
-- 2. notification_log
-- =========================================================

create table if not exists public.notification_log (
  id              bigserial primary key,
  queue_id        bigint references public.notifications_queue(id) on delete set null,
  recipient_id    uuid not null references public.users(id),
  channel         text not null,
  status          text not null check (status in ('sent','failed')),
  provider_msg_id text,
  error           text,
  fired_at        timestamptz not null default now()
);

comment on table public.notification_log is
  'One row per send attempt. V1 only writes in_app; provider_msg_id earns its keep when external channels ship.';

create index if not exists idx_notification_log_recipient_fired
  on public.notification_log (recipient_id, fired_at desc);

-- =========================================================
-- 3. RLS — SELECT only; all writes go through SECURITY DEFINER paths
-- =========================================================

alter table public.notifications_queue enable row level security;
alter table public.notification_log    enable row level security;

drop policy if exists notifications_queue_select_visible on public.notifications_queue;
create policy notifications_queue_select_visible on public.notifications_queue
  for select to authenticated
  using (
    recipient_id = auth.uid()
    or public.current_user_role() in ('admin','ceo')
  );

drop policy if exists notification_log_select_visible on public.notification_log;
create policy notification_log_select_visible on public.notification_log
  for select to authenticated
  using (
    recipient_id = auth.uid()
    or public.current_user_role() in ('admin','ceo')
  );

-- =========================================================
-- 4. _sync_task_reminder_kind helper (cancel-then-insert per kind)
-- =========================================================

create or replace function public._sync_task_reminder_kind(
  p_task_id   uuid,
  p_kind      text,
  p_fire_at   timestamptz,
  p_recipient uuid,
  p_payload   jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled int;
  v_new_id    bigint;
begin
  with cancelled as (
    update notifications_queue
       set status        = 'cancelled',
           cancelled_at  = now(),
           cancel_reason = 'replaced'
     where kind         = p_kind
       and entity_type  = 'task'
       and entity_id    = p_task_id
       and status       = 'pending'
    returning id
  )
  select count(*) into v_cancelled from cancelled;

  if v_cancelled > 0 then
    perform public._audit('reminder_cancelled','task', p_task_id, null,
      jsonb_build_object('kind', p_kind, 'count', v_cancelled, 'reason','replaced'),
      'trigger');
  end if;

  if p_fire_at is null or p_recipient is null then
    return;
  end if;

  insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, payload)
  values (p_kind, 'task', p_task_id, p_recipient, 'in_app', p_fire_at, p_payload)
  on conflict (entity_type, entity_id, kind, recipient_id, fire_at)
    where status = 'pending'
    do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    perform public._audit('reminder_enqueued','task', p_task_id, null,
      jsonb_build_object('kind', p_kind, 'fire_at', p_fire_at, 'queue_id', v_new_id),
      'trigger');
  end if;
end;
$$;

-- =========================================================
-- 5. _sync_task_reminders trigger function
-- =========================================================

create or replace function public._sync_task_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient     uuid := coalesce(NEW.assigned_to, NEW.created_by);
  v_old_recipient uuid;
  v_payload       jsonb := jsonb_build_object('title', NEW.title, 'branch', NEW.branch);
  v_cancelled     int;
begin
  -- Templates don't get reminders themselves; instances do.
  if NEW.is_template then
    return NEW;
  end if;

  -- Closed states: cancel everything pending for this task.
  if NEW.status in ('finished','archived') then
    with cancelled as (
      update notifications_queue
         set status        = 'cancelled',
             cancelled_at  = now(),
             cancel_reason = 'task_closed'
       where entity_type = 'task'
         and entity_id   = NEW.id
         and status      = 'pending'
      returning id
    )
    select count(*) into v_cancelled from cancelled;

    if v_cancelled > 0 then
      perform public._audit('reminder_cancelled','task', NEW.id, null,
        jsonb_build_object('count', v_cancelled, 'reason','task_closed'),
        'trigger');
    end if;
    return NEW;
  end if;

  v_old_recipient := case
    when TG_OP = 'INSERT' then null
    else coalesce(OLD.assigned_to, OLD.created_by)
  end;

  -- start_reminder
  if TG_OP = 'INSERT'
     or OLD.start_reminder_at is distinct from NEW.start_reminder_at
     or v_old_recipient is distinct from v_recipient
  then
    perform public._sync_task_reminder_kind(
      NEW.id, 'start_reminder', NEW.start_reminder_at, v_recipient, v_payload
    );
  end if;

  -- follow_up_reminder
  if TG_OP = 'INSERT'
     or OLD.follow_up_reminder_at is distinct from NEW.follow_up_reminder_at
     or v_old_recipient is distinct from v_recipient
  then
    perform public._sync_task_reminder_kind(
      NEW.id, 'follow_up_reminder', NEW.follow_up_reminder_at, v_recipient, v_payload
    );
  end if;

  -- deadline_reminder
  if TG_OP = 'INSERT'
     or OLD.deadline_reminder_at is distinct from NEW.deadline_reminder_at
     or v_old_recipient is distinct from v_recipient
  then
    perform public._sync_task_reminder_kind(
      NEW.id, 'deadline_reminder', NEW.deadline_reminder_at, v_recipient, v_payload
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_tasks_sync_reminders on public.tasks;
create trigger trg_tasks_sync_reminders
  after insert or update of status, assigned_to, created_by,
                            start_reminder_at, follow_up_reminder_at, deadline_reminder_at,
                            is_template, deleted_at, title, branch
  on public.tasks
  for each row
  execute function public._sync_task_reminders();

-- =========================================================
-- 6. _drain_reminders (cron, in_app only)
-- =========================================================

create or replace function public._drain_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint;
  v_row   notifications_queue;
  v_count int := 0;
begin
  for v_id in
    select id from notifications_queue
     where status   = 'pending'
       and channel  = 'in_app'
       and fire_at <= now()
     order by fire_at asc
     limit 200
  loop
    update notifications_queue
       set status   = 'sent',
           fired_at = now(),
           attempts = attempts + 1
     where id = v_id and status = 'pending'
    returning * into v_row;

    if found then
      insert into notification_log(queue_id, recipient_id, channel, status)
      values (v_row.id, v_row.recipient_id, 'in_app', 'sent');

      perform public._audit('reminder_sent', v_row.entity_type, v_row.entity_id, null,
        jsonb_build_object('queue_id', v_row.id, 'kind', v_row.kind),
        'cron');

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public._drain_reminders() is
  'Drains pending in_app reminders whose fire_at has passed. Returns number of rows fired. Cron entry point.';

-- =========================================================
-- 7. _spawn_due_recurring (cron)
-- =========================================================

create or replace function public._spawn_due_recurring()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template tasks;
  v_instance tasks;
  v_target   date;
  v_count    int := 0;
begin
  for v_template in
    select * from tasks
     where is_template   = true
       and deleted_at    is null
       and next_spawn_at is not null
       and next_spawn_at <= now()
     order by next_spawn_at asc
     limit 50
  loop
    v_target := (v_template.next_spawn_at at time zone 'Africa/Maputo')::date;

    insert into tasks(
      title, description, branch, category, priority, assigned_to, created_by,
      status, due_date, template_id
    ) values (
      v_template.title, v_template.description, v_template.branch, v_template.category,
      v_template.priority, v_template.assigned_to,
      coalesce(v_template.assigned_to, v_template.created_by),
      'not_started', v_target, v_template.id
    )
    returning * into v_instance;

    update tasks
       set next_spawn_at = public._next_spawn_at(
             v_template.recurrence, v_template.recurrence_dow, v_template.recurrence_dom,
             v_template.recurrence_month, v_template.recurrence_time,
             ((v_target + 1)::timestamp) at time zone 'Africa/Maputo'
           )
     where id = v_template.id;

    perform public._audit('recurring_spawn','task', v_instance.id, null,
      jsonb_build_object('template_id', v_template.id, 'target_date', v_target),
      'cron');

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public._spawn_due_recurring() is
  'Hourly cron entry point. Creates instances for any template whose next_spawn_at has passed.';

-- =========================================================
-- 8. _enqueue_followup_due_today (daily 08:00 Africa/Maputo)
-- =========================================================

create or replace function public._enqueue_followup_due_today()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_local date := (now() at time zone 'Africa/Maputo')::date;
  v_fire_at     timestamptz := (v_today_local + time '08:00') at time zone 'Africa/Maputo';
  v_count       int := 0;
  v_row         record;
  v_new_id      bigint;
begin
  for v_row in
    select f.id, f.title, f.branch,
           coalesce(f.assigned_to, f.created_by) as recipient_id
      from follow_ups f
     where f.deleted_at is null
       and f.status not in ('done','cancelled')
       and coalesce(f.snoozed_until, f.due_date) = v_today_local
  loop
    insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, payload)
    values ('followup_due', 'follow_up', v_row.id, v_row.recipient_id, 'in_app',
            v_fire_at,
            jsonb_build_object('title', v_row.title, 'branch', v_row.branch))
    on conflict (entity_type, entity_id, kind, recipient_id, fire_at)
      where status = 'pending'
      do nothing
    returning id into v_new_id;

    if v_new_id is not null then
      perform public._audit('reminder_enqueued','follow_up', v_row.id, null,
        jsonb_build_object('kind','followup_due','fire_at', v_fire_at, 'queue_id', v_new_id),
        'cron');
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public._enqueue_followup_due_today() is
  'Daily 06:00 UTC (08:00 Africa/Maputo) cron. Enqueues a followup_due reminder for each follow-up due today; dedup partial unique index prevents repeats.';

-- =========================================================
-- 9. rpc_list_my_reminders — dashboard read
-- =========================================================

create or replace function public.rpc_list_my_reminders(
  p_unread_only boolean default true,
  p_limit       int     default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(r order by r.fired_at desc nulls last, r.fire_at desc), '[]'::jsonb)
    into v_result
  from (
    select n.id, n.kind, n.entity_type, n.entity_id, n.channel, n.status,
           n.fire_at, n.fired_at, n.dismissed_at, n.payload,
           case n.entity_type
             when 'task' then (
               select to_jsonb(s)
                 from (
                   select t.title, t.branch, t.priority, t.due_date, t.status
                     from tasks t where t.id = n.entity_id and t.deleted_at is null
                 ) s
             )
             when 'follow_up' then (
               select to_jsonb(s)
                 from (
                   select f.title, f.branch, f.priority, f.due_date, f.status
                     from follow_ups f where f.id = n.entity_id and f.deleted_at is null
                 ) s
             )
           end as entity
      from notifications_queue n
     where n.recipient_id = v_uid
       and (
         (p_unread_only and n.status = 'sent')
         or (not p_unread_only and n.status in ('sent','dismissed'))
       )
     order by n.fired_at desc nulls last, n.fire_at desc
     limit greatest(coalesce(p_limit, 50), 1)
  ) r;
  return v_result;
end;
$$;

comment on function public.rpc_list_my_reminders(boolean, int) is
  'Returns the calling user''s reminders (sent, optionally including dismissed) with the linked task/follow-up snapshot.';

grant execute on function public.rpc_list_my_reminders(boolean, int) to authenticated;

-- =========================================================
-- 10. rpc_dismiss_reminder
-- =========================================================

create or replace function public.rpc_dismiss_reminder(
  p_queue_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before notifications_queue;
  v_after  notifications_queue;
begin
  select * into v_before from notifications_queue where id = p_queue_id;
  if v_before is null then
    raise exception 'reminder % not found', p_queue_id using errcode = 'P0002';
  end if;
  if v_before.recipient_id <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'cannot dismiss someone else''s reminder' using errcode = '42501';
  end if;
  if v_before.status <> 'sent' then
    raise exception 'reminder % is not in sent state (status=%)', p_queue_id, v_before.status
      using errcode = '22023';
  end if;

  update notifications_queue
     set status       = 'dismissed',
         dismissed_at = now()
   where id = p_queue_id
  returning * into v_after;

  perform public._audit('reminder_dismissed', v_before.entity_type, v_before.entity_id,
    to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_dismiss_reminder(bigint) is
  'Recipient (or admin/ceo) dismisses a sent reminder. Audited as reminder_dismissed on the originating entity.';

grant execute on function public.rpc_dismiss_reminder(bigint) to authenticated;

-- =========================================================
-- 11. rpc_cancel_reminder (admin/ceo only)
-- =========================================================

create or replace function public.rpc_cancel_reminder(
  p_queue_id bigint,
  p_reason   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.current_user_role();
  v_before notifications_queue;
  v_after  notifications_queue;
begin
  perform public._require_auth();
  if v_role not in ('admin','ceo') then
    raise exception 'role cannot cancel reminders' using errcode = '42501';
  end if;
  select * into v_before from notifications_queue where id = p_queue_id;
  if v_before is null then
    raise exception 'reminder % not found', p_queue_id using errcode = 'P0002';
  end if;
  if v_before.status not in ('pending','sent') then
    raise exception 'reminder % cannot be cancelled (status=%)', p_queue_id, v_before.status
      using errcode = '22023';
  end if;

  update notifications_queue
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_queue_id
  returning * into v_after;

  perform public._audit('reminder_cancelled', v_before.entity_type, v_before.entity_id,
    to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_cancel_reminder(bigint, text) is
  'Admin/CEO escape hatch — cancels a pending or sent reminder with an optional reason. User-driven cancellation happens via the trigger when tasks close.';

grant execute on function public.rpc_cancel_reminder(bigint, text) to authenticated;

-- =========================================================
-- 12. pg_cron — extension + schedules (idempotent)
-- =========================================================

create extension if not exists pg_cron with schema extensions;

-- Reschedule helper to keep the migration idempotent.
do $$
declare
  v_id bigint;
begin
  -- reminders-drain — every minute
  select jobid into v_id from cron.job where jobname = 'reminders-drain';
  if v_id is not null then perform cron.unschedule(v_id); end if;
  perform cron.schedule('reminders-drain', '* * * * *',
    $cmd$select public._drain_reminders()$cmd$);

  -- recurring-spawn — top of the hour
  select jobid into v_id from cron.job where jobname = 'recurring-spawn';
  if v_id is not null then perform cron.unschedule(v_id); end if;
  perform cron.schedule('recurring-spawn', '0 * * * *',
    $cmd$select public._spawn_due_recurring()$cmd$);

  -- followup-daily — 06:00 UTC = 08:00 Africa/Maputo (no DST in Mozambique)
  select jobid into v_id from cron.job where jobname = 'followup-daily';
  if v_id is not null then perform cron.unschedule(v_id); end if;
  perform cron.schedule('followup-daily', '0 6 * * *',
    $cmd$select public._enqueue_followup_due_today()$cmd$);
end $$;

-- =========================================================
-- 13. Backfill — sync reminders for existing tasks; seed today's follow-ups
-- =========================================================

do $$
declare
  t           tasks;
  v_recipient uuid;
  v_payload   jsonb;
begin
  for t in
    select * from tasks
     where deleted_at is null
       and is_template = false
       and status not in ('finished','archived')
       and (start_reminder_at is not null
         or follow_up_reminder_at is not null
         or deadline_reminder_at is not null)
  loop
    v_recipient := coalesce(t.assigned_to, t.created_by);
    v_payload := jsonb_build_object('title', t.title, 'branch', t.branch);
    if t.start_reminder_at is not null then
      perform public._sync_task_reminder_kind(
        t.id, 'start_reminder', t.start_reminder_at, v_recipient, v_payload);
    end if;
    if t.follow_up_reminder_at is not null then
      perform public._sync_task_reminder_kind(
        t.id, 'follow_up_reminder', t.follow_up_reminder_at, v_recipient, v_payload);
    end if;
    if t.deadline_reminder_at is not null then
      perform public._sync_task_reminder_kind(
        t.id, 'deadline_reminder', t.deadline_reminder_at, v_recipient, v_payload);
    end if;
  end loop;
end $$;

-- Seed today's follow-up reminders so the dashboard has data immediately.
select public._enqueue_followup_due_today();

commit;
