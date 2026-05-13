-- Rabih Ops — Phase G2.1: email_states table + RPCs
-- =====================================================================
-- RabihOS-owned email state machine (pending / followed_up / done /
-- dismissed) decoupled from Gmail. Snapshots message metadata at
-- status-set time so Pending/Done lists render without a Gmail
-- roundtrip and survive account disconnect.
--
-- The linked_to_task / linked_to_follow_up "statuses" mentioned in
-- the Gmail V2 design are NOT stored here. They're derived at query
-- time by joining with email_links so they never drift from the
-- actual link rows.
--
-- RLS posture: user-scoped SELECT only (no admin/CEO bypass —
-- personal classifications). No INSERT/UPDATE/DELETE policies; all
-- writes go through SECURITY DEFINER RPCs that re-check
-- user_id = auth.uid(). Mirrors the strict-personal model used by
-- notes with visibility='personal'.
--
-- Audit verbs:
--   email_state_set      — caller upserted a state row
--   email_state_cleared  — caller deleted a state row
--
-- Additive: this migration does NOT touch any existing table or
-- RPC. V1 + G2.0 callers continue working unchanged. Idempotent
-- (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION).

begin;

-- =====================================================================
-- 1. email_states table
-- =====================================================================

create table if not exists public.email_states (
  user_id           uuid    not null references public.users(id) on delete cascade,
  google_account_id text    not null,
  gmail_message_id  text    not null,

  status text not null check (status in
    ('pending','followed_up','done','dismissed')),

  -- Snapshot of the message's metadata at the time the state was
  -- first set. Lets Pending/Done lists render without a Gmail
  -- roundtrip and survive account disconnect. Mirrors the column
  -- set on email_links (subject / from / snippet / internal_date /
  -- thread_id) so the two tables can be JOINed for the derived
  -- linked_to_* status in projection layers.
  gmail_thread_id   text,
  subject           text,
  from_address      text,
  from_name         text,
  snippet           text,
  internal_date     timestamptz,

  -- Optional user-written note ("followed up via WhatsApp, awaiting
  -- reply"). UI surfaces this on Done / Followed-up rows.
  note              text,

  set_at            timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  primary key (user_id, google_account_id, gmail_message_id)
);

comment on table public.email_states is
  'RabihOS-owned per-(user, account, message) state machine: pending / followed_up / done / dismissed. Independent of Gmail — never written to Gmail. Snapshots message metadata at status-set time so Pending/Done views render without a Gmail roundtrip and survive account disconnect. linked_to_task / linked_to_follow_up are NOT stored here; they''re derived from email_links at query time.';

comment on column public.email_states.user_id is
  'The user who owns this state row. Always = auth.uid() at insert/update time. Personal classification — no admin/CEO bypass on SELECT.';
comment on column public.email_states.google_account_id is
  'Which Gmail mailbox the message belongs to. Composite PK with user_id + message_id so the same Gmail message id seen across two of the user''s accounts is tracked independently.';
comment on column public.email_states.gmail_message_id is
  'Gmail message id. Composite PK component.';
comment on column public.email_states.status is
  'pending: user wants to handle. followed_up: handled externally; track for memory. done: fully handled. dismissed: explicitly hidden as non-actionable. linked_to_* are derived at query time (joining email_links), not stored.';
comment on column public.email_states.gmail_thread_id is
  'Gmail thread id snapshotted at status-set time. Lets the UI surface thread context without a Gmail fetch.';
comment on column public.email_states.subject is
  'Subject line snapshot. The calling RPC encourages callers to pass it on insert; nullable so a snapshot-less state row is still allowed (degraded UI in that case).';
comment on column public.email_states.from_address is
  'Sender email address snapshot.';
comment on column public.email_states.from_name is
  'Sender display name snapshot.';
comment on column public.email_states.snippet is
  'Gmail-generated snippet (first ~200 chars). Snapshot only — never re-fetched.';
comment on column public.email_states.internal_date is
  'Gmail internal_date snapshot (when the message landed in the mailbox). Drives ordering on Pending/Done lists when the user hasn''t set a custom sort.';
comment on column public.email_states.note is
  'Optional user-written note. Surfaced on Done / Followed-up rows in the UI.';
comment on column public.email_states.set_at is
  'When the state row was first inserted. Stable across status updates.';
comment on column public.email_states.updated_at is
  'Last status change. Bumped by rpc_email_state_set on every upsert.';

-- =====================================================================
-- 2. Indexes
-- =====================================================================

-- Hot path: list user's pending emails (the override that keeps an
-- old-but-still-pending email visible in the Important card).
-- Partial index so the index stays small as Done / Dismissed rows
-- accumulate.
create index if not exists idx_email_states_user_status_pending
  on public.email_states (user_id, set_at desc)
  where status = 'pending';

-- Thread lookup — for the future "roll the whole thread up" UI.
create index if not exists idx_email_states_user_thread
  on public.email_states (user_id, gmail_thread_id)
  where gmail_thread_id is not null;

-- =====================================================================
-- 3. RLS
-- =====================================================================

alter table public.email_states enable row level security;

drop policy if exists email_states_select_own on public.email_states;
create policy email_states_select_own on public.email_states
  for select to authenticated
  using (user_id = auth.uid());

-- NO INSERT / UPDATE / DELETE policies. Per project rule #1, all
-- mutations go through the SECURITY DEFINER RPCs below.

-- =====================================================================
-- 4. _can_access_gmail_account helper
-- =====================================================================
-- Centralised "this Gmail account belongs to the caller" check.
-- Used by every email_state RPC to defensively reject cross-account
-- writes (a malicious caller passing someone else's google_account_id
-- would otherwise insert a row pointed at a foreign mailbox).
--
-- SECURITY DEFINER because google_oauth_tokens has zero SELECT
-- policies (tokens table is service-role-only on read).

create or replace function public._can_access_gmail_account(p_account_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.google_oauth_tokens
     where user_id = auth.uid()
       and service = 'gmail'
       and google_account_id = p_account_id
  );
$$;

comment on function public._can_access_gmail_account(text) is
  'Returns true when the caller owns a Gmail token row (active or inactive) for the given Google account id. Used by email_state RPCs to reject cross-account writes. SECURITY DEFINER because google_oauth_tokens has no SELECT RLS policies.';

-- =====================================================================
-- 5. rpc_email_state_set — upsert
-- =====================================================================
-- Status mutation + snapshot capture. Snapshot fields are written on
-- INSERT; on UPDATE they''re refreshed only if the caller passes a
-- non-null replacement, so a status-only flip from another surface
-- doesn''t have to re-pass full message metadata.

create or replace function public.rpc_email_state_set(
  p_google_account_id text,
  p_gmail_message_id  text,
  p_status            text,
  p_gmail_thread_id   text         default null,
  p_subject           text         default null,
  p_from_address      text         default null,
  p_from_name         text         default null,
  p_snippet           text         default null,
  p_internal_date     timestamptz  default null,
  p_note              text         default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row email_states;
begin
  if not public._can_mutate() then
    raise exception 'role cannot set email state' using errcode = '42501';
  end if;
  if p_status not in ('pending','followed_up','done','dismissed') then
    raise exception 'invalid email_state status %', p_status using errcode = '22023';
  end if;
  if p_google_account_id is null or btrim(p_google_account_id) = '' then
    raise exception 'google_account_id is required' using errcode = '22023';
  end if;
  if p_gmail_message_id is null or btrim(p_gmail_message_id) = '' then
    raise exception 'gmail_message_id is required' using errcode = '22023';
  end if;
  if not public._can_access_gmail_account(p_google_account_id) then
    raise exception 'gmail account not accessible' using errcode = '42501';
  end if;

  insert into email_states(
    user_id, google_account_id, gmail_message_id,
    status,
    gmail_thread_id, subject, from_address, from_name, snippet,
    internal_date, note,
    set_at, updated_at
  ) values (
    v_uid, p_google_account_id, p_gmail_message_id,
    p_status,
    p_gmail_thread_id, p_subject, p_from_address, p_from_name, p_snippet,
    p_internal_date, p_note,
    now(), now()
  )
  on conflict (user_id, google_account_id, gmail_message_id) do update
    set status            = excluded.status,
        -- Refresh snapshot fields only when the caller passes a
        -- non-null replacement. NULL params preserve the existing
        -- snapshot so a status-only update doesn''t wipe metadata.
        gmail_thread_id   = coalesce(excluded.gmail_thread_id, email_states.gmail_thread_id),
        subject           = coalesce(excluded.subject,         email_states.subject),
        from_address      = coalesce(excluded.from_address,    email_states.from_address),
        from_name         = coalesce(excluded.from_name,       email_states.from_name),
        snippet           = coalesce(excluded.snippet,         email_states.snippet),
        internal_date     = coalesce(excluded.internal_date,   email_states.internal_date),
        note              = coalesce(excluded.note,            email_states.note),
        updated_at        = now()
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'email_state_set', 'email', null,
          jsonb_build_object(
            'google_account_id', p_google_account_id,
            'gmail_message_id',  p_gmail_message_id,
            'status',            p_status,
            'note_set',          p_note is not null
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_email_state_set(text,text,text,text,text,text,text,text,timestamptz,text) is
  'Upserts an email_state row for (caller, account, message). Snapshot fields are written on insert; on update they''re refreshed only if the caller passes a non-null replacement (so a status-only flip preserves metadata). Requires _can_mutate AND _can_access_gmail_account. Audits as email_state_set.';

grant execute on function public.rpc_email_state_set(text,text,text,text,text,text,text,text,timestamptz,text) to authenticated;

-- =====================================================================
-- 6. rpc_email_state_clear — delete
-- =====================================================================

create or replace function public.rpc_email_state_clear(
  p_google_account_id text,
  p_gmail_message_id  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row email_states;
begin
  if not public._can_mutate() then
    raise exception 'role cannot clear email state' using errcode = '42501';
  end if;
  if not public._can_access_gmail_account(p_google_account_id) then
    raise exception 'gmail account not accessible' using errcode = '42501';
  end if;

  delete from email_states
   where user_id           = v_uid
     and google_account_id = p_google_account_id
     and gmail_message_id  = p_gmail_message_id
   returning * into v_row;

  if v_row.user_id is null then
    -- No row to clear — return a benign payload rather than raising,
    -- since the caller's UI may invoke clear defensively without
    -- knowing whether a state row currently exists.
    return jsonb_build_object(
      'removed',           false,
      'google_account_id', p_google_account_id,
      'gmail_message_id',  p_gmail_message_id
    );
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'email_state_cleared', 'email', null,
          jsonb_build_object(
            'google_account_id', p_google_account_id,
            'gmail_message_id',  p_gmail_message_id,
            'status',            v_row.status
          ),
          'web');

  return jsonb_build_object(
    'removed',           true,
    'google_account_id', p_google_account_id,
    'gmail_message_id',  p_gmail_message_id,
    'previous_status',   v_row.status
  );
end;
$$;

comment on function public.rpc_email_state_clear(text,text) is
  'Deletes the email_state row for (caller, account, message). Returns {removed: true, previous_status} on hit, {removed: false} if no row existed (no error). Requires _can_mutate AND _can_access_gmail_account. Audits as email_state_cleared.';

grant execute on function public.rpc_email_state_clear(text,text) to authenticated;

-- =====================================================================
-- 7. rpc_email_states_for_user — list with filters
-- =====================================================================

create or replace function public.rpc_email_states_for_user(
  p_status            text[]  default null,
  p_google_account_id text    default null,
  p_limit             int     default 50,
  p_offset            int     default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 50;
  end if;
  if p_limit > 200 then
    p_limit := 200;
  end if;
  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.set_at desc), '[]'::jsonb)
    into v_result
  from (
    select es.*
      from email_states es
     where es.user_id = v_uid
       and (p_status is null or es.status = any(p_status))
       and (p_google_account_id is null or es.google_account_id = p_google_account_id)
     order by es.set_at desc
     limit p_limit
    offset p_offset
  ) t;

  return v_result;
end;
$$;

comment on function public.rpc_email_states_for_user(text[],text,int,int) is
  'Lists the caller''s email_state rows with snapshots. Filter by p_status[] (any subset of pending/followed_up/done/dismissed) and/or p_google_account_id. Orders by set_at desc. Paginated; limit capped at 200. RLS already restricts user_id = auth.uid().';

grant execute on function public.rpc_email_states_for_user(text[],text,int,int) to authenticated;

-- =====================================================================
-- 8. rpc_email_state_for_message — single lookup
-- =====================================================================
-- Used by Edge Functions (G2.2 gmail-list-today / gmail-list-priority)
-- to overlay current state onto each fetched Gmail message. Returns
-- NULL if no state exists.

create or replace function public.rpc_email_state_for_message(
  p_google_account_id text,
  p_gmail_message_id  text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row email_states;
begin
  select * into v_row
    from email_states es
   where es.user_id           = v_uid
     and es.google_account_id = p_google_account_id
     and es.gmail_message_id  = p_gmail_message_id;
  if v_row.user_id is null then
    return null;
  end if;
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_email_state_for_message(text,text) is
  'Returns the caller''s email_state row for (account, message) or NULL if not set. Read-only; no audit. Used by Edge Functions to overlay state pills onto live Gmail results.';

grant execute on function public.rpc_email_state_for_message(text,text) to authenticated;

commit;
