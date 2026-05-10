-- Rabih Ops — Telegram reminder delivery
-- =====================================================================
-- Phase B's task-reminder trigger only enqueued channel='in_app' rows.
-- Phase C's queue accepts channel='telegram' but nothing was creating
-- those rows. This migration closes the gap:
--
--   1. The dedup partial unique index now includes `channel`, so the
--      same task/kind/recipient/fire_at can have one in_app + one
--      telegram pending row.
--   2. _sync_task_reminder_kind now also emits a channel='telegram' row
--      when the recipient has an active telegram_chats binding.
--   3. _enqueue_followup_due_today does the same for daily follow-up
--      reminders.
--   4. rpc_telegram_unlink_self / rpc_telegram_unlink cancel the user's
--      pending telegram-channel queue rows so they don't accumulate.

begin;

-- =========================================================
-- 1. Dedup index now includes channel
-- =========================================================

drop index if exists public.uq_notifications_queue_pending_dedup;
create unique index uq_notifications_queue_pending_dedup
  on public.notifications_queue (entity_type, entity_id, kind, recipient_id, channel, fire_at)
  where status = 'pending';

-- =========================================================
-- 2. _sync_task_reminder_kind — dual emit when recipient is linked
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
  v_cancelled    int;
  v_new_id       bigint;
  v_has_telegram boolean;
begin
  -- Cancel any pending row of this kind for this task (any channel).
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

  -- Always emit the in_app copy.
  insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, payload)
  values (p_kind, 'task', p_task_id, p_recipient, 'in_app', p_fire_at, p_payload)
  on conflict (entity_type, entity_id, kind, recipient_id, channel, fire_at)
    where status = 'pending'
    do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    perform public._audit('reminder_enqueued','task', p_task_id, null,
      jsonb_build_object('kind', p_kind, 'channel', 'in_app', 'fire_at', p_fire_at, 'queue_id', v_new_id),
      'trigger');
  end if;

  -- If the recipient has an active Telegram chat, also emit a telegram copy.
  select exists (
    select 1 from telegram_chats where user_id = p_recipient and is_active = true
  ) into v_has_telegram;

  if v_has_telegram then
    insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, payload)
    values (p_kind, 'task', p_task_id, p_recipient, 'telegram', p_fire_at, p_payload)
    on conflict (entity_type, entity_id, kind, recipient_id, channel, fire_at)
      where status = 'pending'
      do nothing
    returning id into v_new_id;

    if v_new_id is not null then
      perform public._audit('reminder_enqueued','task', p_task_id, null,
        jsonb_build_object('kind', p_kind, 'channel', 'telegram', 'fire_at', p_fire_at, 'queue_id', v_new_id),
        'trigger');
    end if;
  end if;
end;
$$;

-- =========================================================
-- 3. _enqueue_followup_due_today — dual emit (and ON CONFLICT updated)
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
  v_has_telegram boolean;
begin
  for v_row in
    select f.id, f.title, f.branch,
           coalesce(f.assigned_to, f.created_by) as recipient_id
      from follow_ups f
     where f.deleted_at is null
       and f.status not in ('done','cancelled')
       and coalesce(f.snoozed_until, f.due_date) = v_today_local
  loop
    -- in_app copy
    insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, payload)
    values ('followup_due', 'follow_up', v_row.id, v_row.recipient_id, 'in_app',
            v_fire_at,
            jsonb_build_object('title', v_row.title, 'branch', v_row.branch))
    on conflict (entity_type, entity_id, kind, recipient_id, channel, fire_at)
      where status = 'pending'
      do nothing
    returning id into v_new_id;

    if v_new_id is not null then
      perform public._audit('reminder_enqueued','follow_up', v_row.id, null,
        jsonb_build_object('kind','followup_due','channel','in_app','fire_at', v_fire_at, 'queue_id', v_new_id),
        'cron');
      v_count := v_count + 1;
    end if;

    -- telegram copy if recipient is linked
    select exists (select 1 from telegram_chats where user_id = v_row.recipient_id and is_active = true)
      into v_has_telegram;

    if v_has_telegram then
      insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, payload)
      values ('followup_due', 'follow_up', v_row.id, v_row.recipient_id, 'telegram',
              v_fire_at,
              jsonb_build_object('title', v_row.title, 'branch', v_row.branch))
      on conflict (entity_type, entity_id, kind, recipient_id, channel, fire_at)
        where status = 'pending'
        do nothing
      returning id into v_new_id;

      if v_new_id is not null then
        perform public._audit('reminder_enqueued','follow_up', v_row.id, null,
          jsonb_build_object('kind','followup_due','channel','telegram','fire_at', v_fire_at, 'queue_id', v_new_id),
          'cron');
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

-- =========================================================
-- 4. Cancel pending telegram rows on unlink
-- =========================================================

create or replace function public.rpc_telegram_unlink_self()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before telegram_chats;
  v_n_cancelled int;
begin
  select * into v_before
    from telegram_chats
   where user_id = v_uid and is_active = true;
  if v_before is null then
    return jsonb_build_object('success', false, 'message', 'no active link');
  end if;

  update telegram_chats set is_active = false where id = v_before.id;

  with cancelled as (
    update notifications_queue
       set status        = 'cancelled',
           cancelled_at  = now(),
           cancel_reason = 'telegram_unlinked'
     where recipient_id = v_uid
       and channel      = 'telegram'
       and status       = 'pending'
    returning id
  )
  select count(*) into v_n_cancelled from cancelled;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'telegram_unlink', 'telegram_chat', null,
          jsonb_build_object('chat_id', v_before.tg_chat_id, 'cancelled_pending', v_n_cancelled),
          'web');

  return jsonb_build_object(
    'success', true,
    'chat_id', v_before.tg_chat_id,
    'cancelled_pending_telegram', v_n_cancelled
  );
end;
$$;


create or replace function public.rpc_telegram_unlink(p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before telegram_chats;
  v_n_cancelled int;
begin
  select * into v_before
    from telegram_chats
   where tg_chat_id = p_chat_id and is_active = true;
  if v_before is null then
    return jsonb_build_object('success', false, 'message', 'no active link');
  end if;

  update telegram_chats set is_active = false where id = v_before.id;

  with cancelled as (
    update notifications_queue
       set status        = 'cancelled',
           cancelled_at  = now(),
           cancel_reason = 'telegram_unlinked'
     where recipient_id = v_before.user_id
       and channel      = 'telegram'
       and status       = 'pending'
    returning id
  )
  select count(*) into v_n_cancelled from cancelled;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_before.user_id, 'telegram_unlink', 'telegram_chat', null,
          jsonb_build_object('chat_id', p_chat_id, 'cancelled_pending', v_n_cancelled),
          'telegram');

  return jsonb_build_object('success', true, 'cancelled_pending_telegram', v_n_cancelled);
end;
$$;

commit;
