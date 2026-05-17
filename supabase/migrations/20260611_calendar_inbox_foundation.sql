-- Rabih Ops — Calendar Inbox foundation (C1)
-- =====================================================================
-- One new table, one helper, four RPCs. Foundation for the /calendar page
-- that surfaces ALL Google Calendar events inside Rabih Ops.
--
-- Tables:
--   * calendar_event_dismissals  user-owned "ignored" state per event.
--                                Mirrors the email_states pattern: SELECT
--                                for self only, writes via SECURITY DEFINER
--                                RPCs. Snapshot fields survive Google-side
--                                deletions in the Ignored view.
--
-- Web RPCs (granted to authenticated):
--   rpc_calendar_dismiss_event          upsert
--   rpc_calendar_undismiss_event        delete (benign if absent)
--   rpc_list_calendar_dismissals        caller's dismissals
--   rpc_list_calendar_links_for_user    caller's calendar_event_links in [from, to]
--
-- Helper:
--   _has_calendar_connection            true iff caller has an active
--                                       calendar token (matches the
--                                       is_active=true filter used by
--                                       rpc_calendar_link_status).
--
-- Audit verbs (new):
--   calendar_event_dismissed
--   calendar_event_undismissed
--
-- This migration is foundation-only. NO UI surface. NO conversion
-- actions. NO entity_type widening (the fixed_task arm lands in C5).

begin;

-- =====================================================================
-- 1. calendar_event_dismissals
-- =====================================================================
create table if not exists public.calendar_event_dismissals (
  user_id              uuid        not null
    references public.users(id) on delete cascade,
  google_calendar_id   text        not null default 'primary',
  google_event_id      text        not null,

  recurring_event_id   text,
  is_series_dismiss    boolean     not null default false,

  -- Snapshot (so Ignored survives a Google-side delete)
  summary              text,
  event_start          timestamptz,
  event_end            timestamptz,
  all_day              boolean,
  html_link            text,
  rrule                text,
  note                 text,

  dismissed_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  primary key (user_id, google_calendar_id, google_event_id)
);

comment on table  public.calendar_event_dismissals is
  'User-owned "ignored" state for Google Calendar events. Mirrors email_states shape. Snapshot fields let the Ignored view survive a Google-side delete. is_series_dismiss=true means every instance of recurring_event_id is hidden.';
comment on column public.calendar_event_dismissals.user_id is
  'Owner of the dismissal. Always = auth.uid() at insert time. Personal classification — no admin/CEO bypass on SELECT.';
comment on column public.calendar_event_dismissals.google_calendar_id is
  'Calendar containing the event. V1 always "primary". Part of the PK so multi-calendar support can be added later without a data migration.';
comment on column public.calendar_event_dismissals.google_event_id is
  'Google Calendar event id. For series dismissals this is the master id (= recurring_event_id). For single-instance dismissals it is the instance id.';
comment on column public.calendar_event_dismissals.recurring_event_id is
  'Parent recurring event id. Set when the dismissal targets (or originated from) a recurring instance.';
comment on column public.calendar_event_dismissals.is_series_dismiss is
  'true ⇒ all instances of recurring_event_id are hidden in the UI. false ⇒ only this single instance is hidden.';
comment on column public.calendar_event_dismissals.summary is
  'Event title snapshot at dismiss time. Survives Google-side deletes.';
comment on column public.calendar_event_dismissals.event_start is
  'Event start snapshot at dismiss time.';
comment on column public.calendar_event_dismissals.event_end is
  'Event end snapshot at dismiss time.';
comment on column public.calendar_event_dismissals.all_day is
  'True when the original event was all-day (no dateTime, just date).';
comment on column public.calendar_event_dismissals.html_link is
  'Google Calendar UI URL snapshot. Lets "Open in Google" work even after Google-side delete (lands on a "not found" page — acceptable).';
comment on column public.calendar_event_dismissals.rrule is
  'RRULE captured at dismissal time when known. Populated for series dismissals so the Ignored row stays legible without re-querying Google.';
comment on column public.calendar_event_dismissals.note is
  'Optional user-written "why ignored" note. Surfaced in the Ignored view.';
comment on column public.calendar_event_dismissals.dismissed_at is
  'When the dismissal was first created. Stable across re-dismiss upserts.';
comment on column public.calendar_event_dismissals.updated_at is
  'Bumped by trg_calendar_dismissals_updated_at on every UPDATE.';

create index if not exists idx_calendar_dismiss_user_series
  on public.calendar_event_dismissals (user_id, recurring_event_id)
  where is_series_dismiss = true;

-- =====================================================================
-- 2. updated_at trigger (reuse public.set_updated_at)
-- =====================================================================
drop trigger if exists trg_calendar_dismissals_updated_at
  on public.calendar_event_dismissals;
create trigger trg_calendar_dismissals_updated_at
  before update on public.calendar_event_dismissals
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. RLS — SELECT-own only
-- =====================================================================
alter table public.calendar_event_dismissals enable row level security;
drop policy if exists calendar_dismissals_select_own
  on public.calendar_event_dismissals;
create policy calendar_dismissals_select_own
  on public.calendar_event_dismissals
  for select to authenticated
  using (user_id = auth.uid());
-- No INSERT / UPDATE / DELETE policies. All writes go through the
-- SECURITY DEFINER RPCs below.

-- =====================================================================
-- 4. _has_calendar_connection helper
-- =====================================================================
-- Matches the is_active=true filter used by rpc_calendar_link_status —
-- a revoked / disconnected user cannot pollute calendar_event_dismissals.
create or replace function public._has_calendar_connection()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.google_oauth_tokens
     where user_id   = auth.uid()
       and service   = 'calendar'
       and is_active = true
  );
$$;
comment on function public._has_calendar_connection() is
  'True iff the caller has an ACTIVE Google Calendar connection. Matches rpc_calendar_link_status filter (is_active=true). A revoked/disconnected user cannot write calendar_event_dismissals rows.';

-- =====================================================================
-- 5. rpc_calendar_dismiss_event (upsert)
-- =====================================================================
create or replace function public.rpc_calendar_dismiss_event(
  p_google_calendar_id   text,
  p_google_event_id      text,
  p_is_series_dismiss    boolean      default false,
  p_recurring_event_id   text         default null,
  p_summary              text         default null,
  p_event_start          timestamptz  default null,
  p_event_end            timestamptz  default null,
  p_all_day              boolean      default null,
  p_html_link            text         default null,
  p_rrule                text         default null,
  p_note                 text         default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_auth();
  v_row calendar_event_dismissals;
  v_cal text := coalesce(nullif(btrim(p_google_calendar_id), ''), 'primary');
begin
  if not public._can_mutate() then
    raise exception 'role cannot dismiss calendar events' using errcode = '42501';
  end if;
  if not public._has_calendar_connection() then
    raise exception 'calendar not connected' using errcode = '42501';
  end if;
  if p_google_event_id is null or btrim(p_google_event_id) = '' then
    raise exception 'google_event_id is required' using errcode = '22023';
  end if;
  if coalesce(p_is_series_dismiss, false)
     and (p_recurring_event_id is null or btrim(p_recurring_event_id) = '') then
    raise exception 'recurring_event_id required for series dismiss' using errcode = '22023';
  end if;

  insert into calendar_event_dismissals(
    user_id, google_calendar_id, google_event_id,
    recurring_event_id, is_series_dismiss,
    summary, event_start, event_end, all_day, html_link, rrule, note,
    dismissed_at, updated_at
  ) values (
    v_uid, v_cal, p_google_event_id,
    p_recurring_event_id, coalesce(p_is_series_dismiss, false),
    p_summary, p_event_start, p_event_end, p_all_day, p_html_link, p_rrule, p_note,
    now(), now()
  )
  on conflict (user_id, google_calendar_id, google_event_id) do update
    set is_series_dismiss   = excluded.is_series_dismiss,
        recurring_event_id  = coalesce(excluded.recurring_event_id, calendar_event_dismissals.recurring_event_id),
        summary             = coalesce(excluded.summary,            calendar_event_dismissals.summary),
        event_start         = coalesce(excluded.event_start,        calendar_event_dismissals.event_start),
        event_end           = coalesce(excluded.event_end,          calendar_event_dismissals.event_end),
        all_day             = coalesce(excluded.all_day,            calendar_event_dismissals.all_day),
        html_link           = coalesce(excluded.html_link,          calendar_event_dismissals.html_link),
        rrule               = coalesce(excluded.rrule,              calendar_event_dismissals.rrule),
        note                = coalesce(excluded.note,               calendar_event_dismissals.note),
        updated_at          = now()
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'calendar_event_dismissed', 'calendar_event', null,
          jsonb_build_object(
            'google_calendar_id', v_row.google_calendar_id,
            'google_event_id',    v_row.google_event_id,
            'is_series_dismiss',  v_row.is_series_dismiss,
            'recurring_event_id', v_row.recurring_event_id
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_calendar_dismiss_event(
  text,text,boolean,text,text,timestamptz,timestamptz,boolean,text,text,text
) is
  'Upserts a calendar_event_dismissals row for the caller. Snapshot fields are written on insert; on update they refresh only if the caller passes a non-null replacement. Gates: _require_auth, _can_mutate (blocks viewer), _has_calendar_connection (ACTIVE connection required — revoked/disconnected users are blocked). Audits as calendar_event_dismissed.';

grant execute on function public.rpc_calendar_dismiss_event(
  text,text,boolean,text,text,timestamptz,timestamptz,boolean,text,text,text
) to authenticated;

-- =====================================================================
-- 6. rpc_calendar_undismiss_event (delete; benign if absent)
-- =====================================================================
create or replace function public.rpc_calendar_undismiss_event(
  p_google_calendar_id text,
  p_google_event_id    text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_auth();
  v_row calendar_event_dismissals;
  v_cal text := coalesce(nullif(btrim(p_google_calendar_id), ''), 'primary');
begin
  if not public._can_mutate() then
    raise exception 'role cannot undismiss calendar events' using errcode = '42501';
  end if;
  if p_google_event_id is null or btrim(p_google_event_id) = '' then
    raise exception 'google_event_id is required' using errcode = '22023';
  end if;

  delete from calendar_event_dismissals
   where user_id            = v_uid
     and google_calendar_id = v_cal
     and google_event_id    = p_google_event_id
  returning * into v_row;

  if v_row.user_id is null then
    -- No-op: caller can invoke defensively without prior knowledge.
    return jsonb_build_object(
      'removed',            false,
      'google_calendar_id', v_cal,
      'google_event_id',    p_google_event_id
    );
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'calendar_event_undismissed', 'calendar_event', null,
          jsonb_build_object(
            'google_calendar_id', v_row.google_calendar_id,
            'google_event_id',    v_row.google_event_id,
            'is_series_dismiss',  v_row.is_series_dismiss
          ),
          'web');

  return jsonb_build_object(
    'removed',            true,
    'google_calendar_id', v_row.google_calendar_id,
    'google_event_id',    v_row.google_event_id,
    'was_series_dismiss', v_row.is_series_dismiss
  );
end;
$$;

comment on function public.rpc_calendar_undismiss_event(text,text) is
  'Removes a calendar_event_dismissals row for the caller. Returns {removed:false} if no matching row existed (so callers can invoke defensively). Audits as calendar_event_undismissed.';

grant execute on function public.rpc_calendar_undismiss_event(text,text) to authenticated;

-- =====================================================================
-- 7. rpc_list_calendar_dismissals
-- =====================================================================
create or replace function public.rpc_list_calendar_dismissals()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid    uuid := public._require_auth();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'google_calendar_id', d.google_calendar_id,
    'google_event_id',    d.google_event_id,
    'recurring_event_id', d.recurring_event_id,
    'is_series_dismiss',  d.is_series_dismiss,
    'summary',            d.summary,
    'event_start',        d.event_start,
    'event_end',          d.event_end,
    'all_day',            d.all_day,
    'html_link',          d.html_link,
    'rrule',              d.rrule,
    'note',               d.note,
    'dismissed_at',       d.dismissed_at,
    'updated_at',         d.updated_at
  ) order by d.dismissed_at desc), '[]'::jsonb)
    into v_result
  from calendar_event_dismissals d
  where d.user_id = v_uid;
  return v_result;
end;
$$;

comment on function public.rpc_list_calendar_dismissals() is
  'Returns all calendar_event_dismissals rows for the caller, ordered newest-first. Personal classification — no admin/CEO bypass.';

grant execute on function public.rpc_list_calendar_dismissals() to authenticated;

-- =====================================================================
-- 8. rpc_list_calendar_links_for_user(p_from, p_to)
-- =====================================================================
-- Returns calendar_event_links whose window overlaps [p_from, p_to],
-- with entity titles joined in so C2's page can render "Linked to X"
-- without an N+1 fetch. Admin/CEO see all rows (matches the existing
-- calendar_event_links_select_visible policy).
create or replace function public.rpc_list_calendar_links_for_user(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_result jsonb;
begin
  if p_from is null or p_to is null then
    raise exception 'p_from and p_to are required' using errcode = '22023';
  end if;
  if p_to < p_from then
    raise exception 'p_to must be >= p_from' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'link_id',            l.id,
    'entity_type',        l.entity_type,
    'entity_id',          l.entity_id,
    'entity_title',       coalesce(t.title, f.title),
    'google_calendar_id', l.google_calendar_id,
    'google_event_id',    l.google_event_id,
    'event_title',        l.event_title,
    'event_start',        l.event_start,
    'event_end',          l.event_end,
    'event_html_link',    l.event_html_link,
    'created_at',         l.created_at,
    'mine',               l.user_id = v_uid
  ) order by l.event_start asc nulls last), '[]'::jsonb)
    into v_result
  from calendar_event_links l
  left join tasks      t on l.entity_type = 'task'      and t.id = l.entity_id and t.deleted_at is null
  left join follow_ups f on l.entity_type = 'follow_up' and f.id = l.entity_id and f.deleted_at is null
  where l.deleted_at is null
    and (l.user_id = v_uid or v_role in ('admin','ceo'))
    and (
      l.event_start is null
      or (l.event_start <= p_to and (l.event_end is null or l.event_end >= p_from))
    );
  return v_result;
end;
$$;

comment on function public.rpc_list_calendar_links_for_user(timestamptz, timestamptz) is
  'Returns the caller-visible calendar_event_links rows whose event window overlaps [p_from, p_to], with task/follow_up titles joined. Admin/CEO see all rows. Used by /calendar (C2) to render the "Linked" status on each event without N+1 fetches.';

grant execute on function public.rpc_list_calendar_links_for_user(timestamptz, timestamptz) to authenticated;

commit;
