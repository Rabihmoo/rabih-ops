-- 20260613_notification_read_state.sql
-- Phase 7 chunk 7.1 — Reminder / Notification Center read surface.
--
-- Net-new state and read RPCs only. Re-uses the existing reminder
-- pipeline end-to-end:
--   * notifications_queue            (20260516)
--   * notification_log               (20260516)
--   * in_app channel + CHECK enum    (20260516)
--   * rpc_list_my_reminders          (20260516)  — kept; queue-side read
--   * rpc_dismiss_reminder           (20260516)  — kept; queue-side write
--   * rpc_cancel_reminder            (20260516)  — kept; admin/ceo write
--   * _drain_reminders, _enqueue_*, _sync_*       — kept; producers
--   * rpc_claim/sent/failed_telegram* (20260518)  — kept; dispatcher
--
-- What this migration adds:
--   1. notification_log.read_at column + partial unread index.
--   2. rpc_list_notifications        — unified read with state discriminator.
--   3. rpc_count_unread_notifications — backs the topbar badge.
--   4. rpc_mark_notification_read    — recipient-only write.
--   5. rpc_mark_all_notifications_read.
--
-- All RPCs are SECURITY DEFINER with set search_path = public and
-- gated to authenticated. Read-state is personal — no admin override.
-- No new audit verbs (read is operator-private behavior).

begin;

-- =========================================================
-- 1. Schema delta — read_at on notification_log
-- =========================================================

alter table public.notification_log
  add column if not exists read_at timestamptz;

comment on column public.notification_log.read_at is
  'When the recipient marked this notification read in the in-app surface. Null means unread. Personal state — only the recipient sets it. No admin override.';

create index if not exists idx_notification_log_recipient_unread
  on public.notification_log (recipient_id)
  where read_at is null;

-- =========================================================
-- 2. rpc_list_notifications — unified read surface
-- =========================================================
--
-- Returns one jsonb array, newest activity first. Each row carries a
-- "state" discriminator:
--   * 'fired'   — a notification_log row. Has a real log_id; can be
--                 marked read; carries status ('sent' | 'failed') so
--                 the UI can render a failed-delivery chip.
--   * 'pending' — a notifications_queue row that hasn't fired yet.
--                 Has no log_id and is never counted as unread; the UI
--                 wires dismiss/cancel actions to the existing
--                 rpc_dismiss_reminder / rpc_cancel_reminder RPCs.
--
-- Sort: effective_at desc, where effective_at = fired_at for fired
-- rows and fire_at for pending rows. Result is capped to 200 to keep
-- the topbar/page snappy regardless of caller-supplied p_limit.

create or replace function public.rpc_list_notifications(
  p_limit       int     default 50,
  p_unread_only boolean default false,
  p_channel     text    default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid        uuid := public._require_auth();
  v_lim_capped int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result     jsonb;
begin
  with fired as (
    select 'fired'::text         as state,
           l.id                  as log_id,
           l.queue_id            as queue_id,
           coalesce(q.kind, '(unknown)') as kind,
           q.entity_type         as entity_type,
           q.entity_id           as entity_id,
           l.channel             as channel,
           l.status              as status,         -- 'sent' | 'failed'
           l.error               as error,
           l.fired_at            as effective_at,
           l.fired_at            as fired_at,
           null::timestamptz     as fire_at,
           l.read_at             as read_at,
           q.payload             as payload,
           case q.entity_type
             when 'task' then (
               select to_jsonb(s) from (
                 select t.title, t.branch, t.priority, t.due_date, t.status
                   from tasks t
                  where t.id = q.entity_id and t.deleted_at is null
               ) s
             )
             when 'follow_up' then (
               select to_jsonb(s) from (
                 select f.title, f.branch, f.priority, f.due_date, f.status
                   from follow_ups f
                  where f.id = q.entity_id and f.deleted_at is null
               ) s
             )
             else null
           end as entity
      from notification_log l
      left join notifications_queue q on q.id = l.queue_id
     where l.recipient_id = v_uid
       and (p_channel is null or l.channel = p_channel)
       and (not p_unread_only or l.read_at is null)
  ),
  pending as (
    select 'pending'::text       as state,
           null::bigint          as log_id,
           q.id                  as queue_id,
           q.kind                as kind,
           q.entity_type         as entity_type,
           q.entity_id           as entity_id,
           q.channel             as channel,
           q.status              as status,         -- 'pending'
           null::text            as error,
           q.fire_at             as effective_at,
           null::timestamptz     as fired_at,
           q.fire_at             as fire_at,
           null::timestamptz     as read_at,
           q.payload             as payload,
           case q.entity_type
             when 'task' then (
               select to_jsonb(s) from (
                 select t.title, t.branch, t.priority, t.due_date, t.status
                   from tasks t
                  where t.id = q.entity_id and t.deleted_at is null
               ) s
             )
             when 'follow_up' then (
               select to_jsonb(s) from (
                 select f.title, f.branch, f.priority, f.due_date, f.status
                   from follow_ups f
                  where f.id = q.entity_id and f.deleted_at is null
               ) s
             )
             else null
           end as entity
      from notifications_queue q
     where q.recipient_id = v_uid
       and q.status       = 'pending'
       and (p_channel is null or q.channel = p_channel)
       -- Pending rows are never "unread"; suppress when caller asked for unread-only.
       and not p_unread_only
  )
  select coalesce(jsonb_agg(c order by c.effective_at desc nulls last), '[]'::jsonb)
    into v_result
    from (
      select * from fired
      union all
      select * from pending
      order by effective_at desc nulls last
      limit v_lim_capped
    ) c;

  return v_result;
end;
$$;

comment on function public.rpc_list_notifications(int, boolean, text) is
  'Unified read of the caller''s notifications. Returns notification_log rows (state=''fired'') and notifications_queue pending rows (state=''pending'') as one jsonb array sorted newest first. p_unread_only=true filters to fired+unread (pending rows never count as unread). p_channel optionally narrows to one of in_app/telegram/email/calendar. Capped at 200 rows server-side.';

grant execute on function public.rpc_list_notifications(int, boolean, text) to authenticated;

-- =========================================================
-- 3. rpc_count_unread_notifications — topbar badge
-- =========================================================

create or replace function public.rpc_count_unread_notifications()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.notification_log
   where recipient_id = auth.uid()
     and read_at is null;
$$;

comment on function public.rpc_count_unread_notifications() is
  'Returns the caller''s unread notification count. Counts only fired notification_log rows; pending notifications_queue rows are never counted. Backed by idx_notification_log_recipient_unread.';

grant execute on function public.rpc_count_unread_notifications() to authenticated;

-- =========================================================
-- 4. rpc_mark_notification_read
-- =========================================================

create or replace function public.rpc_mark_notification_read(
  p_log_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row notification_log;
begin
  select * into v_row from notification_log where id = p_log_id;
  if v_row is null then
    raise exception 'notification % not found', p_log_id using errcode = 'P0002';
  end if;
  if v_row.recipient_id <> v_uid then
    -- Personal state; admin/ceo can SELECT but cannot mark someone else's row read.
    raise exception 'cannot mark someone else''s notification read' using errcode = '42501';
  end if;
  if v_row.read_at is not null then
    return to_jsonb(v_row);
  end if;

  update notification_log
     set read_at = now()
   where id = p_log_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_mark_notification_read(bigint) is
  'Marks one notification_log row read for the calling recipient. Idempotent — re-marking returns the current row. Personal state; no admin override.';

grant execute on function public.rpc_mark_notification_read(bigint) to authenticated;

-- =========================================================
-- 5. rpc_mark_all_notifications_read
-- =========================================================

create or replace function public.rpc_mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_count int;
begin
  with updated as (
    update notification_log
       set read_at = now()
     where recipient_id = v_uid
       and read_at is null
    returning 1
  )
  select count(*)::int into v_count from updated;
  return v_count;
end;
$$;

comment on function public.rpc_mark_all_notifications_read() is
  'Marks every unread notification_log row read for the calling recipient. Returns the number of rows touched. Idempotent — second call returns 0.';

grant execute on function public.rpc_mark_all_notifications_read() to authenticated;

commit;
