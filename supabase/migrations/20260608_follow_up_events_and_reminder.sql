-- Rabih Ops — Follow-up history log + time-of-day reminder columns.
-- F1.1 DB foundation. UI lands in F1.2 / F1.3.
--
-- New surfaces:
--   * follow_ups.reminder_at         — timestamptz; engine fires on this
--   * follow_ups.calendar_event_id   — set by F1.5 calendar attach
--   * follow_ups.calendar_html_link  — google calendar htmlLink for click-through
--   * follow_up_events table         — per-user-action history log
--   * 5 new RPCs                     — append event, set status, set reminder, attach/detach calendar
--   * trigger _trg_log_follow_up_status_change — auto-writes a status_change
--                                      event whenever follow_ups.status changes,
--                                      regardless of which RPC made the write
--
-- Status taxonomy (per F1 design, user-approved 2026-05-15):
--   pending | working | waiting | no_answer | postponed | done | cancelled
--
-- Existing 'snoozed' status is renamed to 'postponed' (semantic equivalent;
-- 0 live rows of status='snoozed' on staging as of migration time).
-- rpc_snooze_follow_up keeps its name + behaviour; only the stored status
-- value normalizes to 'postponed'. snoozed_until column UNCHANGED.

begin;

-- =========================================================
-- 1. Status taxonomy: drop old CHECK, rename historic 'snoozed' → 'postponed',
--    add new CHECK. Order matters — the UPDATE writes a value ('postponed')
--    that the OLD CHECK rejects, so the old constraint must come off first.
-- =========================================================

alter table public.follow_ups
  drop constraint if exists follow_ups_status_check;

-- Normalize any pre-existing 'snoozed' rows. On staging this is 0 live +
-- a handful of soft-deleted rows; audit_log preserves the original status
-- for any caller that needs prior state.
update public.follow_ups set status = 'postponed' where status = 'snoozed';

alter table public.follow_ups
  add constraint follow_ups_status_check
    check (status in (
      'pending', 'working', 'waiting', 'no_answer',
      'postponed', 'done', 'cancelled'
    ));

-- =========================================================
-- 2. New columns on follow_ups for reminder + calendar
-- =========================================================

alter table public.follow_ups
  add column if not exists reminder_at         timestamptz,
  add column if not exists calendar_event_id   text,
  add column if not exists calendar_html_link  text;

comment on column public.follow_ups.reminder_at is
  'When the engine should fire a reminder for this follow-up (in_app + telegram + calendar channels). Distinct from snoozed_until (which only pushes due_date forward).';
comment on column public.follow_ups.calendar_event_id is
  'Google Calendar event id when the user attached one (F1.5). Null if no calendar event exists.';
comment on column public.follow_ups.calendar_html_link is
  'htmlLink returned by Google Calendar at attach time. Stored for click-through; not refreshed.';

-- Partial index keeps the engine''s "what reminders are due soon" sweep cheap.
create index if not exists follow_ups_reminder_at_idx
  on public.follow_ups (reminder_at)
  where reminder_at is not null and deleted_at is null;

-- =========================================================
-- 3. follow_up_events: history log
-- =========================================================

create table if not exists public.follow_up_events (
  id            bigserial primary key,
  follow_up_id  uuid not null references public.follow_ups(id) on delete cascade,
  kind          text not null check (kind in (
                  'note',
                  'status_change',
                  'reminder_set',
                  'reminder_cleared',
                  'calendar_added',
                  'calendar_removed',
                  'invitee_added',
                  'postponed',
                  'snoozed'
                )),
  from_status   text,
  to_status     text,
  body          text,
  payload       jsonb,
  created_by    uuid not null,
  created_at    timestamptz not null default now()
);

comment on table public.follow_up_events is
  'Append-only history log for follow-ups. One row per user (or trigger-driven) action. Drives the FollowUpDetail history feed in F1.2. Notes go in `body`; structured payload (e.g. invitees list) goes in `payload`. status_change rows carry from_status/to_status.';

comment on column public.follow_up_events.kind is
  'Event kind. note=free-form note; status_change=auto-logged on status delta; reminder_set/cleared=user toggled reminder_at; calendar_added/removed=F1.5 calendar attach; invitee_added=F1.5 invitee email; postponed/snoozed=specific scheduling actions worth a distinct kind for analytics.';

create index if not exists follow_up_events_follow_up_idx
  on public.follow_up_events (follow_up_id, created_at desc);

-- RLS: SELECT mirrors follow_ups visibility via the parent row. No INSERT/
-- UPDATE/DELETE policies — all writes go through SECURITY DEFINER RPCs or
-- the trigger below (which runs as the table owner).
alter table public.follow_up_events enable row level security;
drop policy if exists follow_up_events_select on public.follow_up_events;
create policy follow_up_events_select on public.follow_up_events
  for select using (
    exists (
      select 1 from public.follow_ups fu
       where fu.id = follow_up_events.follow_up_id
         and public.current_user_can_access_branch(fu.branch)
         and fu.deleted_at is null
    )
  );

-- =========================================================
-- 4. Widen notifications_queue.kind for the new time-of-day reminder
-- =========================================================

alter table public.notifications_queue
  drop constraint if exists notifications_queue_kind_check;
alter table public.notifications_queue
  add constraint notifications_queue_kind_check
    check (kind in (
      'start_reminder', 'follow_up_reminder', 'deadline_reminder',
      'recurring_spawn', 'followup_due', 'follow_up_reminder_at'
    ));

-- =========================================================
-- 5. rpc_snooze_follow_up — replace 'snoozed' status write with 'postponed'
-- =========================================================
-- Function name and signature UNCHANGED. snoozed_until column UNCHANGED.
-- Only the stored status value changes from 'snoozed' to 'postponed' so
-- the new CHECK (which omits 'snoozed') is satisfied.

create or replace function public.rpc_snooze_follow_up(
  p_follow_up_id uuid,
  p_new_due_date date,
  p_reason       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before follow_ups;
  v_after  follow_ups;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot snooze follow-ups' using errcode = '42501';
  end if;
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set status        = 'postponed',
         snoozed_until = p_new_due_date
   where id = p_follow_up_id
  returning * into v_after;

  if p_reason is not null and length(btrim(p_reason)) > 0 then
    perform public._add_comment(
      'follow_up',
      p_follow_up_id,
      '[snoozed to ' || p_new_due_date::text || '] ' || p_reason
    );
  end if;

  perform public._audit('update','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_snooze_follow_up(uuid, date, text) is
  'Pushes a follow-up forward: writes snoozed_until and sets status=''postponed''. Reason captured as a system comment when supplied. Snoozed_until column semantics unchanged from V1.';

-- =========================================================
-- 6. rpc_add_follow_up_event — manual event (note or arbitrary kind)
-- =========================================================

create or replace function public.rpc_add_follow_up_event(
  p_follow_up_id uuid,
  p_kind         text,
  p_body         text default null,
  p_payload      jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_fu  follow_ups;
  v_row follow_up_events;
begin
  v_uid := public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot edit follow-ups' using errcode = '42501';
  end if;
  if p_kind is null or length(btrim(p_kind)) = 0 then
    raise exception 'kind required' using errcode = '22023';
  end if;

  select * into v_fu from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_fu is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_fu.branch is not null then
    perform public._require_branch_access(v_fu.branch);
  end if;

  insert into follow_up_events (follow_up_id, kind, body, payload, created_by)
  values (p_follow_up_id, p_kind, nullif(btrim(p_body), ''), p_payload, v_uid)
  returning * into v_row;

  -- Bump follow_ups.updated_at so list-views re-sort correctly.
  update follow_ups set updated_at = now() where id = p_follow_up_id;

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_add_follow_up_event(uuid, text, text, jsonb) is
  'Appends an event to the follow-up history log. Used for free-form notes (kind=note) and any other kind in the events.kind CHECK list. status_change events are written automatically by the trigger; callers should NOT pass kind=status_change manually.';

grant execute on function public.rpc_add_follow_up_event(uuid, text, text, jsonb) to authenticated;

-- =========================================================
-- 7. rpc_set_follow_up_status — status transition + auto-log
-- =========================================================

create or replace function public.rpc_set_follow_up_status(
  p_follow_up_id uuid,
  p_status       text,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before follow_ups;
  v_after  follow_ups;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot edit follow-ups' using errcode = '42501';
  end if;
  if p_status not in ('pending','working','waiting','no_answer','postponed','done','cancelled') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  -- Idempotent: same-status update is a no-op except for an optional note.
  if v_before.status = p_status and (p_note is null or length(btrim(p_note)) = 0) then
    return to_jsonb(v_before);
  end if;

  update follow_ups
     set status       = p_status,
         completed_at = case when p_status = 'done' then coalesce(completed_at, now()) else completed_at end,
         -- When the operator provides an outcome note alongside status=done,
         -- also persist it to follow_ups.outcome so the telegram bot's
         -- existing reads of `outcome` keep working (per F1 design Q3).
         outcome      = case
                          when p_status = 'done' and p_note is not null and length(btrim(p_note)) > 0
                            then btrim(p_note)
                          else outcome
                        end
   where id = p_follow_up_id
  returning * into v_after;

  -- If a note was supplied, log it as a separate note event for the
  -- history feed (in addition to the trigger-written status_change row).
  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into follow_up_events (follow_up_id, kind, body, created_by)
    values (p_follow_up_id, 'note', btrim(p_note), public._require_auth());
  end if;

  perform public._audit('update','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_set_follow_up_status(uuid, text, text) is
  'Transitions a follow-up status. p_note optional: when set and status=done, also writes to follow_ups.outcome AND inserts a note event. The trigger _trg_log_follow_up_status_change writes the status_change event row automatically.';

grant execute on function public.rpc_set_follow_up_status(uuid, text, text) to authenticated;

-- =========================================================
-- 8. rpc_set_follow_up_reminder — set/clear reminder_at + enqueue
-- =========================================================
-- Channels validated against the existing notifications_queue.channel CHECK.
-- Per F1 design: V1 supports in_app + telegram + calendar. email is allowed
-- by the channel CHECK but has no dispatcher wired — passing it is harmless
-- (the row sits pending until F1.x adds an email dispatcher, or stays
-- pending forever).

create or replace function public.rpc_set_follow_up_reminder(
  p_follow_up_id uuid,
  p_reminder_at  timestamptz,
  p_channels     text[] default array['in_app']
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_before follow_ups;
  v_after  follow_ups;
  v_chan   text;
begin
  v_uid := public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot edit follow-ups' using errcode = '42501';
  end if;
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  -- Cancel any pending reminder rows in the queue first — regardless of
  -- whether the caller is setting or clearing. This keeps the queue clean
  -- when the user changes their mind.
  update notifications_queue
     set status        = 'cancelled',
         cancelled_at  = coalesce(cancelled_at, now()),
         cancel_reason = 'reminder reset by user'
   where kind         = 'follow_up_reminder_at'
     and entity_type  = 'follow_up'
     and entity_id    = p_follow_up_id
     and status       in ('pending','sent');

  update follow_ups
     set reminder_at = p_reminder_at
   where id = p_follow_up_id
  returning * into v_after;

  if p_reminder_at is not null then
    -- Enqueue one row per channel. Recipient is the assigned user or the
    -- creator as a fallback.
    foreach v_chan in array coalesce(p_channels, array['in_app']) loop
      insert into notifications_queue (
        kind, entity_type, entity_id, recipient_id, channel, fire_at, status, payload
      ) values (
        'follow_up_reminder_at',
        'follow_up',
        p_follow_up_id,
        coalesce(v_after.assigned_to, v_after.created_by),
        v_chan,
        p_reminder_at,
        'pending',
        jsonb_build_object('title', v_after.title, 'branch', v_after.branch)
      );
    end loop;
    insert into follow_up_events (follow_up_id, kind, body, payload, created_by)
    values (
      p_follow_up_id,
      'reminder_set',
      null,
      jsonb_build_object('reminder_at', p_reminder_at, 'channels', p_channels),
      v_uid
    );
  else
    insert into follow_up_events (follow_up_id, kind, created_by)
    values (p_follow_up_id, 'reminder_cleared', v_uid);
  end if;

  perform public._audit('update','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_set_follow_up_reminder(uuid, timestamptz, text[]) is
  'Sets or clears a follow-up time-of-day reminder. Cancels any pending notifications_queue rows first, then enqueues one row per channel. Passing p_reminder_at=null clears the reminder. Channels: in_app/telegram/calendar are wired; email is allowed by CHECK but has no dispatcher yet.';

grant execute on function public.rpc_set_follow_up_reminder(uuid, timestamptz, text[]) to authenticated;

-- =========================================================
-- 9. rpc_attach_calendar_to_follow_up — called by F1.5 Edge Function
-- =========================================================

create or replace function public.rpc_attach_calendar_to_follow_up(
  p_follow_up_id uuid,
  p_event_id     text,
  p_html_link    text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_before follow_ups;
  v_after  follow_ups;
begin
  v_uid := public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot edit follow-ups' using errcode = '42501';
  end if;
  if p_event_id is null or length(btrim(p_event_id)) = 0 then
    raise exception 'event_id required' using errcode = '22023';
  end if;

  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set calendar_event_id  = p_event_id,
         calendar_html_link = p_html_link
   where id = p_follow_up_id
  returning * into v_after;

  insert into follow_up_events (follow_up_id, kind, payload, created_by)
  values (
    p_follow_up_id,
    'calendar_added',
    jsonb_build_object('event_id', p_event_id, 'html_link', p_html_link),
    v_uid
  );

  perform public._audit('update','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_attach_calendar_to_follow_up(uuid, text, text) is
  'Stores a Google Calendar event id + htmlLink on the follow-up. Intended to be called by the F1.5 calendar-create-event Edge Function after Google returns. Does NOT touch Google Calendar itself.';

grant execute on function public.rpc_attach_calendar_to_follow_up(uuid, text, text) to authenticated;

-- =========================================================
-- 10. rpc_detach_calendar_from_follow_up
-- =========================================================

create or replace function public.rpc_detach_calendar_from_follow_up(
  p_follow_up_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_before follow_ups;
  v_after  follow_ups;
begin
  v_uid := public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot edit follow-ups' using errcode = '42501';
  end if;
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set calendar_event_id  = null,
         calendar_html_link = null
   where id = p_follow_up_id
  returning * into v_after;

  insert into follow_up_events (follow_up_id, kind, payload, created_by)
  values (
    p_follow_up_id,
    'calendar_removed',
    jsonb_build_object('event_id', v_before.calendar_event_id),
    v_uid
  );

  perform public._audit('update','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_detach_calendar_from_follow_up(uuid) is
  'Clears the calendar_event_id/htmlLink columns and logs a calendar_removed event. The Edge Function (F1.5) is responsible for actually deleting the Google Calendar event before calling this.';

grant execute on function public.rpc_detach_calendar_from_follow_up(uuid) to authenticated;

-- =========================================================
-- 11. Trigger: auto-log status_change events on EVERY status mutation
-- =========================================================
-- Captures status changes regardless of which RPC made the write
-- (rpc_update_follow_up, rpc_mark_follow_up_done, rpc_snooze_follow_up,
-- rpc_set_follow_up_status, or future paths). Attributes to auth.uid().

create or replace function public._trg_log_follow_up_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (OLD.status is distinct from NEW.status) then
    insert into follow_up_events (
      follow_up_id, kind, from_status, to_status, created_by
    ) values (
      NEW.id,
      'status_change',
      OLD.status,
      NEW.status,
      -- auth.uid() can be null in trigger context if the caller path
      -- doesn't set it; fall back to the row's created_by so the column
      -- (which is NOT NULL) is always satisfied.
      coalesce(auth.uid(), NEW.created_by)
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_log_follow_up_status_change on public.follow_ups;
create trigger trg_log_follow_up_status_change
  after update of status on public.follow_ups
  for each row execute function public._trg_log_follow_up_status_change();

commit;
