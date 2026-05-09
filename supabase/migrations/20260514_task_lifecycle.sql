-- Rabih Ops — Phase A: Task lifecycle upgrade
-- =====================================================================
-- Schema:
--   * Status enum widens to 8 (todo→not_started, in_progress→working,
--     blocked→waiting_for_someone, done→finished, cancelled→archived).
--   * New columns: waiting_on_user_id / waiting_on_label, delay_reason,
--     repeat_reason, outcome, three *_reminder_at fields, recurrence
--     template fields, template_id, next_spawn_at.
--   * Cadence-specific shape constraint (weekly needs dow, monthly needs
--     dom, yearly needs dom+month, all need recurrence_time).
--   * Africa/Maputo helper _next_spawn_at(...) for recurrence math.
-- RPCs:
--   * rpc_set_task_status      simple transitions only
--   * rpc_mark_waiting         requires user_id OR label
--   * rpc_resume_waiting
--   * rpc_mark_delayed         delay_reason required
--   * rpc_request_repeat       repeat_reason required, clears outcome
--   * rpc_archive_task
--   * rpc_set_task_reminders
--   * rpc_create_recurring_task
--   * rpc_spawn_recurring_instance
-- RPCs (modified):
--   * rpc_create_task          extra optional reminder/status args
--   * rpc_complete_task        sets status='finished', accepts outcome
--   * rpc_list_tasks           p_include_archived + p_include_templates;
--                              templates excluded by default
--   * rpc_get_user_dashboard   updated status checks
-- No reminder firing, no cron — Phase B handles that.

begin;

-- =========================================================
-- 1. Status enum migration (data first, then constraint)
-- =========================================================

alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks
   set status = case status
     when 'todo'        then 'not_started'
     when 'in_progress' then 'working'
     when 'blocked'     then 'waiting_for_someone'
     when 'done'        then 'finished'
     when 'cancelled'   then 'archived'
     else status
   end
 where status in ('todo','in_progress','blocked','done','cancelled');

alter table public.tasks add constraint tasks_status_check
  check (status in (
    'not_started','started','working','waiting_for_someone',
    'delayed','finished','needs_repeat','archived'
  ));

-- The original default was 'todo'; switch to 'not_started' so future inserts
-- bypassing the RPC (there shouldn't be any) still satisfy the check.
alter table public.tasks alter column status set default 'not_started';

-- =========================================================
-- 2. Partial index using legacy status — recreate
-- =========================================================

drop index if exists public.idx_tasks_due_date;
create index if not exists idx_tasks_due_date
  on public.tasks (due_date)
  where deleted_at is null and status not in ('finished','archived');

-- =========================================================
-- 3. New columns
-- =========================================================

alter table public.tasks add column if not exists waiting_on_user_id    uuid references public.users(id);
alter table public.tasks add column if not exists waiting_on_label      text;
alter table public.tasks add column if not exists delay_reason          text;
alter table public.tasks add column if not exists repeat_reason         text;
alter table public.tasks add column if not exists outcome               text;
alter table public.tasks add column if not exists start_reminder_at     timestamptz;
alter table public.tasks add column if not exists follow_up_reminder_at timestamptz;
alter table public.tasks add column if not exists deadline_reminder_at  timestamptz;
alter table public.tasks add column if not exists is_template           boolean not null default false;
alter table public.tasks add column if not exists recurrence            text;
alter table public.tasks add column if not exists recurrence_dow        int[];
alter table public.tasks add column if not exists recurrence_dom        int;
alter table public.tasks add column if not exists recurrence_month      int;
alter table public.tasks add column if not exists recurrence_time       time;
alter table public.tasks add column if not exists template_id           uuid references public.tasks(id);
alter table public.tasks add column if not exists next_spawn_at         timestamptz;

comment on column public.tasks.waiting_on_user_id is
  'When status=waiting_for_someone, the user we''re waiting on (if a known account).';
comment on column public.tasks.waiting_on_label is
  'Free-text fallback for waiting target when not a known user (vendor name, kitchen line, etc.).';
comment on column public.tasks.delay_reason is
  'Required reason when status=delayed. Captured by rpc_mark_delayed.';
comment on column public.tasks.repeat_reason is
  'Required reason when status=needs_repeat. Captured by rpc_request_repeat.';
comment on column public.tasks.outcome is
  'Final result of the task (separate from completion_note process notes). Set when status=finished.';
comment on column public.tasks.start_reminder_at is
  'Reminder engine (Phase B) nudge for "should be started by now". Stored as UTC timestamptz; Africa/Maputo aware on input/display.';
comment on column public.tasks.follow_up_reminder_at is
  'Mid-task check-in reminder timestamp. Phase B reminder engine consumes this.';
comment on column public.tasks.deadline_reminder_at is
  'Pre-deadline nudge reminder timestamp. Phase B reminder engine consumes this.';
comment on column public.tasks.is_template is
  'True when this row defines a recurring template; instances point back via template_id.';
comment on column public.tasks.recurrence is
  'Cadence for templates: daily/weekly/monthly/yearly. Null on standalone tasks and on instances.';
comment on column public.tasks.recurrence_dow is
  'Weekly templates: int[] of day-of-week (0=Sunday … 6=Saturday). Validated by tasks_recurrence_shape.';
comment on column public.tasks.recurrence_dom is
  'Monthly/yearly templates: day-of-month 1..31. Months without that day are skipped (see _next_spawn_at).';
comment on column public.tasks.recurrence_month is
  'Yearly templates: month 1..12.';
comment on column public.tasks.recurrence_time is
  'Time-of-day in Africa/Maputo at which an instance is spawned. Required when recurrence is non-null.';
comment on column public.tasks.template_id is
  'Instance->template back-reference. Null on standalone tasks and on templates themselves.';
comment on column public.tasks.next_spawn_at is
  'Cached next-instance spawn timestamp on a template; the Phase B cron consumes this.';

-- =========================================================
-- 4. Constraints
-- =========================================================

alter table public.tasks drop constraint if exists tasks_template_has_recurrence;
alter table public.tasks add constraint tasks_template_has_recurrence
  check ((is_template = false) or (recurrence is not null));

alter table public.tasks drop constraint if exists tasks_no_self_template;
alter table public.tasks add constraint tasks_no_self_template
  check ((is_template = false) or (template_id is null));

alter table public.tasks drop constraint if exists tasks_recurrence_dow_range;
alter table public.tasks add constraint tasks_recurrence_dow_range
  check (
    recurrence_dow is null
    or (
      array_length(recurrence_dow, 1) between 1 and 7
      and recurrence_dow <@ array[0,1,2,3,4,5,6]
    )
  );

alter table public.tasks drop constraint if exists tasks_recurrence_dom_range;
alter table public.tasks add constraint tasks_recurrence_dom_range
  check (recurrence_dom is null or recurrence_dom between 1 and 31);

alter table public.tasks drop constraint if exists tasks_recurrence_month_range;
alter table public.tasks add constraint tasks_recurrence_month_range
  check (recurrence_month is null or recurrence_month between 1 and 12);

-- Stronger cadence-specific shape: required fields per cadence + time always required.
alter table public.tasks drop constraint if exists tasks_recurrence_shape;
alter table public.tasks add constraint tasks_recurrence_shape
  check (
    recurrence is null
    or (
      recurrence_time is not null
      and (
        (recurrence = 'daily')
        or (recurrence = 'weekly'
            and recurrence_dow is not null
            and array_length(recurrence_dow, 1) >= 1)
        or (recurrence = 'monthly'
            and recurrence_dom is not null)
        or (recurrence = 'yearly'
            and recurrence_dom is not null
            and recurrence_month is not null)
      )
    )
  );

-- =========================================================
-- 5. Indexes
-- =========================================================

create index if not exists idx_tasks_template_id
  on public.tasks (template_id) where deleted_at is null and template_id is not null;

create index if not exists idx_tasks_template_next_spawn
  on public.tasks (next_spawn_at) where deleted_at is null and is_template = true;

create index if not exists idx_tasks_status_due
  on public.tasks (status, due_date) where deleted_at is null;

-- =========================================================
-- 6. _next_spawn_at — Africa/Maputo recurrence math
-- =========================================================

create or replace function public._next_spawn_at(
  p_recurrence       text,
  p_recurrence_dow   int[],
  p_recurrence_dom   int,
  p_recurrence_month int,
  p_recurrence_time  time,
  p_from             timestamptz default now()
) returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tz       constant text := 'Africa/Maputo';
  v_local    timestamp;
  v_today    date;
  v_target   int;
  v_pick     int;
  v_min_off  int;
  v_off      int;
  v_attempt  timestamp;
  v_cursor   date;
  v_loops    int;
  v_year     int;
begin
  if p_recurrence is null or p_recurrence_time is null then
    return null;
  end if;

  v_local := (p_from at time zone v_tz);
  v_today := v_local::date;

  if p_recurrence = 'daily' then
    v_attempt := (v_today + p_recurrence_time);
    if v_attempt <= v_local then
      v_attempt := ((v_today + 1) + p_recurrence_time);
    end if;
    return v_attempt at time zone v_tz;

  elsif p_recurrence = 'weekly' then
    if p_recurrence_dow is null or array_length(p_recurrence_dow, 1) is null then
      return null;
    end if;
    v_target := extract(dow from v_today)::int;  -- 0..6, Sunday=0
    v_min_off := null;
    foreach v_pick in array p_recurrence_dow loop
      v_off := ((v_pick - v_target) % 7 + 7) % 7;
      if v_off = 0 and (v_today + p_recurrence_time) <= v_local then
        v_off := 7;
      end if;
      if v_min_off is null or v_off < v_min_off then
        v_min_off := v_off;
      end if;
    end loop;
    if v_min_off is null then return null; end if;
    v_attempt := ((v_today + v_min_off) + p_recurrence_time);
    return v_attempt at time zone v_tz;

  elsif p_recurrence = 'monthly' then
    if p_recurrence_dom is null then return null; end if;
    v_cursor := date_trunc('month', v_today)::date;
    for v_loops in 0..23 loop
      -- Month-end day for the cursor month
      if extract(day from (v_cursor + interval '1 month - 1 day'))::int >= p_recurrence_dom then
        v_attempt := (v_cursor + (p_recurrence_dom - 1)) + p_recurrence_time;
        if v_attempt > v_local then
          return v_attempt at time zone v_tz;
        end if;
      end if;
      v_cursor := (v_cursor + interval '1 month')::date;
    end loop;
    return null;

  elsif p_recurrence = 'yearly' then
    if p_recurrence_dom is null or p_recurrence_month is null then return null; end if;
    v_year := extract(year from v_today)::int;
    for v_loops in 0..3 loop
      begin
        v_attempt := make_date(v_year + v_loops, p_recurrence_month, p_recurrence_dom)
                   + p_recurrence_time;
        if v_attempt > v_local then
          return v_attempt at time zone v_tz;
        end if;
      exception when others then
        -- skip invalid dates (e.g. Feb 29 on non-leap years)
        null;
      end;
    end loop;
    return null;

  else
    return null;
  end if;
end;
$$;

comment on function public._next_spawn_at(text, int[], int, int, time, timestamptz) is
  'Returns next firing timestamp for a recurring task in Africa/Maputo. Used by rpc_create_recurring_task and the Phase B cron.';

grant execute on function public._next_spawn_at(text, int[], int, int, time, timestamptz) to authenticated;

-- =========================================================
-- 7. rpc_create_task — extended args
-- =========================================================

drop function if exists public.rpc_create_task(text,text,text,text,date,uuid,text);

create or replace function public.rpc_create_task(
  p_branch                text,
  p_category              text,
  p_title                 text,
  p_priority              text default 'normal',
  p_due_date              date default null,
  p_assigned_to           uuid default null,
  p_description           text default null,
  p_status                text default 'not_started',
  p_start_reminder_at     timestamptz default null,
  p_follow_up_reminder_at timestamptz default null,
  p_deadline_reminder_at  timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row tasks;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create tasks' using errcode = '42501';
  end if;
  perform public._require_branch_access(p_branch);

  if coalesce(p_status, 'not_started') not in ('not_started','started','working') then
    raise exception 'tasks must be created in not_started/started/working; use the lifecycle RPCs for other states'
      using errcode = '22023';
  end if;

  insert into tasks(
    title, description, branch, category, priority, due_date, assigned_to, created_by,
    status, start_reminder_at, follow_up_reminder_at, deadline_reminder_at
  ) values (
    p_title, p_description, p_branch, p_category, coalesce(p_priority,'normal'),
    p_due_date, p_assigned_to, v_uid,
    coalesce(p_status, 'not_started'),
    p_start_reminder_at, p_follow_up_reminder_at, p_deadline_reminder_at
  )
  returning * into v_row;

  perform public._audit('create','task', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_create_task(text,text,text,text,date,uuid,text,text,timestamptz,timestamptz,timestamptz) is
  'Creates a task. Status must be not_started/started/working. Returns the inserted row.';

grant execute on function public.rpc_create_task(text,text,text,text,date,uuid,text,text,timestamptz,timestamptz,timestamptz) to authenticated;

-- =========================================================
-- 8. rpc_complete_task — finished + outcome
-- =========================================================

drop function if exists public.rpc_complete_task(uuid, text);

create or replace function public.rpc_complete_task(
  p_task_id         uuid,
  p_completion_note text default null,
  p_outcome         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot complete tasks' using errcode = '42501';
  end if;
  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status          = 'finished',
         completed_at    = coalesce(completed_at, now()),
         completion_note = coalesce(nullif(btrim(p_completion_note), ''), completion_note),
         outcome         = coalesce(nullif(btrim(p_outcome), ''),         outcome)
   where id = p_task_id
  returning * into v_after;

  perform public._audit('complete','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_complete_task(uuid, text, text) is
  'Marks a task finished. Optional process notes (completion_note) and final result (outcome).';

grant execute on function public.rpc_complete_task(uuid, text, text) to authenticated;

-- =========================================================
-- 9. rpc_set_task_status — simple transitions only
-- =========================================================

create or replace function public.rpc_set_task_status(
  p_task_id uuid,
  p_status  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot change task status' using errcode = '42501';
  end if;

  if p_status not in ('not_started','started','working','finished','archived') then
    raise exception 'rpc_set_task_status only handles simple transitions; use rpc_mark_waiting / rpc_mark_delayed / rpc_request_repeat for special states'
      using errcode = '22023';
  end if;

  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status = p_status,
         completed_at = case
           when p_status = 'finished' then coalesce(completed_at, now())
           when p_status in ('not_started','started','working') then null
           else completed_at
         end
   where id = p_task_id
  returning * into v_after;

  perform public._audit('status_change','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_set_task_status(uuid, text) is
  'Simple status transitions only: not_started/started/working/finished/archived. Other states have dedicated RPCs.';

grant execute on function public.rpc_set_task_status(uuid, text) to authenticated;

-- =========================================================
-- 10. rpc_mark_waiting / rpc_resume_waiting
-- =========================================================

create or replace function public.rpc_mark_waiting(
  p_task_id uuid,
  p_user_id uuid default null,
  p_label   text default null,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot change task status' using errcode = '42501';
  end if;
  if p_user_id is null and (p_label is null or btrim(p_label) = '') then
    raise exception 'either p_user_id or p_label is required when marking waiting'
      using errcode = '22023';
  end if;

  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status             = 'waiting_for_someone',
         waiting_on_user_id = p_user_id,
         waiting_on_label   = case when p_label is null then null else nullif(btrim(p_label), '') end
   where id = p_task_id
  returning * into v_after;

  perform public._audit('wait','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.comments(entity_type, entity_id, author_id, body)
    values ('task', p_task_id, auth.uid(), btrim(p_note));
  end if;

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_mark_waiting(uuid, uuid, text, text) is
  'Sets a task to waiting_for_someone. Requires p_user_id OR p_label. Optional note becomes a comment.';

grant execute on function public.rpc_mark_waiting(uuid, uuid, text, text) to authenticated;

create or replace function public.rpc_resume_waiting(
  p_task_id uuid,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot change task status' using errcode = '42501';
  end if;
  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);
  if v_before.status <> 'waiting_for_someone' then
    raise exception 'task % is not waiting (status=%)', p_task_id, v_before.status
      using errcode = '22023';
  end if;

  update tasks
     set status             = 'working',
         waiting_on_user_id = null,
         waiting_on_label   = null
   where id = p_task_id
  returning * into v_after;

  perform public._audit('resume','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.comments(entity_type, entity_id, author_id, body)
    values ('task', p_task_id, auth.uid(), btrim(p_note));
  end if;

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_resume_waiting(uuid, text) is
  'Resumes a waiting task back to working. Optional note becomes a comment.';

grant execute on function public.rpc_resume_waiting(uuid, text) to authenticated;

-- =========================================================
-- 11. rpc_mark_delayed — reason required
-- =========================================================

create or replace function public.rpc_mark_delayed(
  p_task_id uuid,
  p_reason  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot change task status' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'delay reason is required' using errcode = '22023';
  end if;

  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status       = 'delayed',
         delay_reason = btrim(p_reason)
   where id = p_task_id
  returning * into v_after;

  perform public._audit('delay','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_mark_delayed(uuid, text) is
  'Marks a task delayed with a required reason. Stored in tasks.delay_reason.';

grant execute on function public.rpc_mark_delayed(uuid, text) to authenticated;

-- =========================================================
-- 12. rpc_request_repeat — reason required, clears outcome
-- =========================================================

create or replace function public.rpc_request_repeat(
  p_task_id uuid,
  p_reason  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot change task status' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'repeat reason is required' using errcode = '22023';
  end if;

  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status        = 'needs_repeat',
         repeat_reason = btrim(p_reason),
         completed_at  = null,
         outcome       = null
   where id = p_task_id
  returning * into v_after;

  perform public._audit('request_repeat','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_request_repeat(uuid, text) is
  'Marks a finished/working task as needs_repeat with a required reason. Clears completion timestamp and outcome.';

grant execute on function public.rpc_request_repeat(uuid, text) to authenticated;

-- =========================================================
-- 13. rpc_archive_task
-- =========================================================

create or replace function public.rpc_archive_task(
  p_task_id uuid,
  p_reason  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot archive tasks' using errcode = '42501';
  end if;
  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks set status = 'archived' where id = p_task_id
  returning * into v_after;

  perform public._audit('archive','task', p_task_id, to_jsonb(v_before),
    to_jsonb(v_after) || coalesce(jsonb_build_object('reason', nullif(btrim(p_reason), '')), '{}'::jsonb));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_archive_task(uuid, text) is
  'Archives a task (status=archived). Distinct from soft-delete. Optional reason captured in audit_log only.';

grant execute on function public.rpc_archive_task(uuid, text) to authenticated;

-- =========================================================
-- 14. rpc_set_task_reminders
-- =========================================================

create or replace function public.rpc_set_task_reminders(
  p_task_id               uuid,
  p_start_reminder_at     timestamptz default null,
  p_follow_up_reminder_at timestamptz default null,
  p_deadline_reminder_at  timestamptz default null,
  p_clear                 boolean     default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot change task reminders' using errcode = '42501';
  end if;
  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  if p_clear then
    update tasks
       set start_reminder_at     = null,
           follow_up_reminder_at = null,
           deadline_reminder_at  = null
     where id = p_task_id
    returning * into v_after;
  else
    update tasks
       set start_reminder_at     = p_start_reminder_at,
           follow_up_reminder_at = p_follow_up_reminder_at,
           deadline_reminder_at  = p_deadline_reminder_at
     where id = p_task_id
    returning * into v_after;
  end if;

  perform public._audit('reminders_set','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_set_task_reminders(uuid, timestamptz, timestamptz, timestamptz, boolean) is
  'Sets the three reminder fields. p_clear=true wipes all three. Reminder firing is Phase B.';

grant execute on function public.rpc_set_task_reminders(uuid, timestamptz, timestamptz, timestamptz, boolean) to authenticated;

-- =========================================================
-- 15. rpc_create_recurring_task
-- =========================================================

create or replace function public.rpc_create_recurring_task(
  p_branch           text,
  p_category         text,
  p_title            text,
  p_recurrence       text,                 -- daily/weekly/monthly/yearly
  p_recurrence_time  time,
  p_priority         text  default 'normal',
  p_assigned_to      uuid  default null,
  p_description      text  default null,
  p_recurrence_dow   int[] default null,
  p_recurrence_dom   int   default null,
  p_recurrence_month int   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public._require_auth();
  v_row  tasks;
  v_next timestamptz;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create tasks' using errcode = '42501';
  end if;
  perform public._require_branch_access(p_branch);

  if p_recurrence not in ('daily','weekly','monthly','yearly') then
    raise exception 'invalid recurrence cadence: %', p_recurrence using errcode = '22023';
  end if;

  v_next := public._next_spawn_at(
    p_recurrence, p_recurrence_dow, p_recurrence_dom, p_recurrence_month, p_recurrence_time
  );

  insert into tasks(
    title, description, branch, category, priority, assigned_to, created_by,
    status, is_template, recurrence, recurrence_dow, recurrence_dom, recurrence_month,
    recurrence_time, next_spawn_at
  ) values (
    p_title, p_description, p_branch, p_category, coalesce(p_priority,'normal'),
    p_assigned_to, v_uid,
    'not_started', true,
    p_recurrence, p_recurrence_dow, p_recurrence_dom, p_recurrence_month,
    p_recurrence_time, v_next
  )
  returning * into v_row;

  perform public._audit('recurring_create','task', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_create_recurring_task(text,text,text,text,time,text,uuid,text,int[],int,int) is
  'Creates a recurring task template. Cadence shape validated by tasks_recurrence_shape. Phase B cron will spawn instances.';

grant execute on function public.rpc_create_recurring_task(text,text,text,text,time,text,uuid,text,int[],int,int) to authenticated;

-- =========================================================
-- 16. rpc_spawn_recurring_instance
-- =========================================================

create or replace function public.rpc_spawn_recurring_instance(
  p_template_id uuid,
  p_target_date date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public._require_auth();
  v_template  tasks;
  v_row       tasks;
  v_next      timestamptz;
  v_target    date := coalesce(p_target_date, current_date);
begin
  if not public._can_mutate() then
    raise exception 'role cannot spawn task instances' using errcode = '42501';
  end if;
  select * into v_template
    from tasks
   where id = p_template_id and is_template = true and deleted_at is null;
  if v_template is null then
    raise exception 'recurring template % not found', p_template_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_template.branch);

  insert into tasks(
    title, description, branch, category, priority, assigned_to, created_by,
    status, due_date, template_id
  ) values (
    v_template.title, v_template.description, v_template.branch, v_template.category,
    v_template.priority, v_template.assigned_to, v_uid,
    'not_started', v_target, v_template.id
  )
  returning * into v_row;

  v_next := public._next_spawn_at(
    v_template.recurrence, v_template.recurrence_dow, v_template.recurrence_dom,
    v_template.recurrence_month, v_template.recurrence_time,
    ((v_target + 1)::timestamp) at time zone 'Africa/Maputo'
  );
  update tasks set next_spawn_at = v_next where id = v_template.id;

  perform public._audit('recurring_spawn','task', v_row.id, null,
    to_jsonb(v_row) || jsonb_build_object('template_id', v_template.id));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_spawn_recurring_instance(uuid, date) is
  'Spawns a single instance from a recurring template (manual or cron). Advances the template''s next_spawn_at.';

grant execute on function public.rpc_spawn_recurring_instance(uuid, date) to authenticated;

-- =========================================================
-- 17. rpc_list_tasks — adds p_include_archived + p_include_templates
-- =========================================================

drop function if exists public.rpc_list_tasks(text,text,uuid,date,date,text,boolean,int);

create or replace function public.rpc_list_tasks(
  p_branch             text    default null,
  p_status             text    default null,
  p_assigned_to        uuid    default null,
  p_due_before         date    default null,
  p_due_after          date    default null,
  p_search             text    default null,
  p_include_done       boolean default false,
  p_include_archived   boolean default false,
  p_include_templates  boolean default false,
  p_limit              int     default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date := current_date;
  v_result jsonb;
begin
  perform public._require_auth();
  if p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  select coalesce(jsonb_agg(t order by
            (case when t.due_date is not null
                       and t.due_date < v_today
                       and t.status not in ('finished','archived')
                  then 0 else 1 end),
            t.due_date nulls last,
            (case t.priority when 'urgent' then 0 when 'normal' then 1 else 2 end),
            t.created_at desc
          ), '[]'::jsonb)
    into v_result
  from (
    select tt.*
      from tasks tt
     where tt.deleted_at is null
       and public.current_user_can_access_branch(tt.branch)
       and (p_branch       is null or tt.branch       = p_branch)
       and (p_status       is null or tt.status       = p_status)
       and (p_assigned_to  is null or tt.assigned_to  = p_assigned_to)
       and (p_due_before   is null or tt.due_date    <= p_due_before)
       and (p_due_after    is null or tt.due_date    >= p_due_after)
       and (p_include_done       or tt.status <> 'finished')
       and (p_include_archived   or tt.status <> 'archived')
       and (p_include_templates  or tt.is_template = false)
       and (p_search is null
            or tt.title ilike '%' || p_search || '%'
            or coalesce(tt.description,'') ilike '%' || p_search || '%')
     limit greatest(coalesce(p_limit, 100), 1)
  ) t;

  return v_result;
end;
$$;

comment on function public.rpc_list_tasks(text,text,uuid,date,date,text,boolean,boolean,boolean,int) is
  'Filtered tasks. Defaults exclude finished, archived, and templates. Sort: overdue first, due_date asc, priority.';

grant execute on function public.rpc_list_tasks(text,text,uuid,date,date,text,boolean,boolean,boolean,int) to authenticated;

-- =========================================================
-- 18. rpc_get_user_dashboard — update legacy status checks
-- =========================================================

create or replace function public.rpc_get_user_dashboard(
  p_user_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, public._require_auth());
  v_today date := current_date;
  v_priorities jsonb;
  v_overdue    jsonb;
  v_assigned   jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.due_date, t.priority), '[]'::jsonb)
    into v_priorities
  from (
    select *
      from tasks
     where deleted_at is null
       and is_template = false
       and status not in ('finished','archived')
       and (priority = 'urgent' or due_date = v_today)
       and public.current_user_can_access_branch(branch)
     limit 50
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.due_date), '[]'::jsonb)
    into v_overdue
  from (
    select *
      from tasks
     where deleted_at is null
       and is_template = false
       and status not in ('finished','archived')
       and due_date < v_today
       and public.current_user_can_access_branch(branch)
     limit 50
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.priority, t.due_date), '[]'::jsonb)
    into v_assigned
  from (
    select *
      from tasks
     where deleted_at is null
       and is_template = false
       and status not in ('finished','archived')
       and assigned_to = v_uid
     limit 100
  ) t;

  return jsonb_build_object(
    'user_id', v_uid,
    'date', v_today,
    'priorities', v_priorities,
    'overdue', v_overdue,
    'assigned', v_assigned
  );
end;
$$;

commit;
