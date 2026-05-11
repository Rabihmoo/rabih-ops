-- Rabih Ops — Phase F: Gmail integration (read-only)
-- =====================================================================
-- Reuses the Calendar OAuth machinery (google_oauth_tokens + oauth_state)
-- by adding a `service` column to both, so a single user can independently
-- connect Calendar and Gmail without duplicate token tables.
--
-- Scope (V1):
--   * gmail.readonly + userinfo.email + openid scopes ONLY.
--     No gmail.modify — we never mark-read or change labels.
--   * Dashboard "Important emails" surface (computed live by the Edge
--     Function — no nightly sync, no message bodies in the DB).
--   * Link an important email to a task or follow_up (snapshot fields
--     stored locally so the link survives if the message is deleted in
--     Gmail later).
--
-- Tables added:
--   * email_links — polymorphic snapshot of a Gmail message attached to
--                   a task or follow_up. SELECT for owner + admin/ceo.
--
-- Tables refactored:
--   * google_oauth_tokens — PK changed from (user_id) to (user_id, service).
--                            `service` column added (default 'calendar' so
--                            existing rows remain Calendar rows).
--   * oauth_state — `service` column added (default 'calendar').
--
-- New web RPCs (granted to authenticated):
--   rpc_gmail_request_authorize, rpc_gmail_link_status,
--   rpc_gmail_disconnect_self,
--   rpc_email_link_create, rpc_email_link_remove,
--   rpc_email_links_for_entity
--
-- New service-role RPCs (Edge Functions only — no grant):
--   rpc_gmail_consume_state, rpc_gmail_store_tokens,
--   rpc_gmail_get_token, rpc_gmail_update_access_token,
--   rpc_gmail_mark_disconnected
--
-- Existing Calendar RPCs are re-created to filter `service='calendar'`
-- so the composite-PK refactor doesn't break the Calendar flow.
--
-- Audit verbs: gmail_linked, gmail_unlinked, email_linked, email_unlinked

begin;

-- =====================================================================
-- 0. Idempotency: drop any prior versions before re-installing.
--    Functions with the same name+signature are CREATE OR REPLACE'd
--    below, but we still drop email_links policies/triggers/indexes by
--    `if exists` so re-applying is safe.
-- =====================================================================

-- =====================================================================
-- 1. Add `service` column to oauth_state + google_oauth_tokens
-- =====================================================================

alter table public.oauth_state
  add column if not exists service text not null default 'calendar';

alter table public.oauth_state drop constraint if exists oauth_state_service_check;
alter table public.oauth_state
  add constraint oauth_state_service_check check (service in ('calendar','gmail'));

comment on column public.oauth_state.service is
  'Which Google integration this state was issued for — ''calendar'' or ''gmail''. Filtered on consume so a stray calendar state cannot complete a gmail flow.';


alter table public.google_oauth_tokens
  add column if not exists service text not null default 'calendar';

alter table public.google_oauth_tokens drop constraint if exists google_oauth_tokens_service_check;
alter table public.google_oauth_tokens
  add constraint google_oauth_tokens_service_check check (service in ('calendar','gmail'));

comment on column public.google_oauth_tokens.service is
  'Which Google integration this token row is for — ''calendar'' or ''gmail''. A user may connect each independently.';

-- Refactor PK from (user_id) -> (user_id, service). Safe to re-run: the
-- drop-if-exists handles the single-column PK from Phase D; the new PK
-- is added only if absent.
alter table public.google_oauth_tokens drop constraint if exists google_oauth_tokens_pkey;
do $do$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_class      t on t.oid = c.conrelid
     where t.relname = 'google_oauth_tokens'
       and c.contype = 'p'
  ) then
    alter table public.google_oauth_tokens
      add constraint google_oauth_tokens_pkey primary key (user_id, service);
  end if;
end
$do$;

-- =====================================================================
-- 2. Re-create Calendar RPCs with `service='calendar'` scoping
--    (no behaviour change for the caller — they still address Calendar
--    only).
-- =====================================================================

create or replace function public.rpc_calendar_request_authorize(
  p_redirect_to text default '/settings'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_state text;
begin
  v_state := encode(extensions.gen_random_bytes(24), 'hex');
  delete from oauth_state
   where user_id = v_uid and provider = 'google' and service = 'calendar';
  insert into oauth_state(state, user_id, provider, service, redirect_to)
  values (v_state, v_uid, 'google', 'calendar',
          coalesce(nullif(btrim(p_redirect_to), ''), '/settings'));
  return jsonb_build_object('state', v_state);
end;
$$;

grant execute on function public.rpc_calendar_request_authorize(text) to authenticated;


create or replace function public.rpc_calendar_link_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_email text;
  v_connected_at timestamptz;
  v_last_used_at timestamptz;
  v_scope text;
begin
  select google_email, connected_at, last_used_at, scope
    into v_email, v_connected_at, v_last_used_at, v_scope
  from google_oauth_tokens
   where user_id = v_uid and service = 'calendar' and is_active = true;
  if v_email is null then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected',    true,
    'email',        v_email,
    'connected_at', v_connected_at,
    'last_used_at', v_last_used_at,
    'scope',        v_scope
  );
end;
$$;

grant execute on function public.rpc_calendar_link_status() to authenticated;


create or replace function public.rpc_calendar_disconnect_self()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_email text;
begin
  select google_email into v_email
    from google_oauth_tokens
   where user_id = v_uid and service = 'calendar' and is_active = true;
  if v_email is null then
    return jsonb_build_object('success', false, 'message', 'no active connection');
  end if;
  update google_oauth_tokens
     set is_active = false, disconnected_at = now()
   where user_id = v_uid and service = 'calendar';
  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'calendar_unlinked', 'google_oauth', null,
          jsonb_build_object('email', v_email, 'service', 'calendar'), 'web');
  return jsonb_build_object('success', true, 'email', v_email);
end;
$$;

grant execute on function public.rpc_calendar_disconnect_self() to authenticated;


create or replace function public.rpc_calendar_consume_state(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row oauth_state;
begin
  delete from oauth_state where expires_at < now();
  delete from oauth_state
   where state = p_state and provider = 'google' and service = 'calendar'
     and expires_at > now()
  returning * into v_row;
  if v_row.user_id is null then
    raise exception 'invalid or expired oauth state' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'user_id',     v_row.user_id,
    'redirect_to', coalesce(v_row.redirect_to, '/settings')
  );
end;
$$;


create or replace function public.rpc_calendar_store_tokens(
  p_user_id           uuid,
  p_email             text,
  p_account_id        text,
  p_refresh_token     text,
  p_access_token      text,
  p_access_expires_at timestamptz,
  p_scope             text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing  google_oauth_tokens;
  v_secret_id uuid;
begin
  if p_refresh_token is null or length(btrim(p_refresh_token)) = 0 then
    raise exception 'refresh_token is required' using errcode = '22023';
  end if;
  if p_access_token is null or length(btrim(p_access_token)) = 0 then
    raise exception 'access_token is required' using errcode = '22023';
  end if;

  select * into v_existing
    from google_oauth_tokens
   where user_id = p_user_id and service = 'calendar';

  if v_existing.user_id is null then
    select vault.create_secret(p_refresh_token, null,
      'Google OAuth refresh token (calendar) for user ' || p_user_id::text)
      into v_secret_id;
    insert into google_oauth_tokens(
      user_id, service, google_account_id, google_email, access_token,
      access_token_expires_at, refresh_token_secret_id, scope, is_active, connected_at
    ) values (
      p_user_id, 'calendar', p_account_id, p_email, p_access_token,
      p_access_expires_at, v_secret_id, p_scope, true, now()
    );
  else
    perform vault.update_secret(v_existing.refresh_token_secret_id, p_refresh_token);
    update google_oauth_tokens
       set google_account_id      = p_account_id,
           google_email            = p_email,
           access_token            = p_access_token,
           access_token_expires_at = p_access_expires_at,
           scope                   = p_scope,
           is_active               = true,
           connected_at            = case when v_existing.is_active then v_existing.connected_at else now() end,
           disconnected_at         = null
     where user_id = p_user_id and service = 'calendar';
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (p_user_id, 'calendar_linked', 'google_oauth', null,
          jsonb_build_object('email', p_email, 'scope', p_scope, 'service', 'calendar'), 'web');

  return jsonb_build_object('success', true);
end;
$$;


create or replace function public.rpc_calendar_get_token(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   google_oauth_tokens;
  v_refresh text;
begin
  select * into v_token
    from google_oauth_tokens
   where user_id = p_user_id and service = 'calendar' and is_active = true;
  if v_token.user_id is null then
    return jsonb_build_object('connected', false);
  end if;
  select decrypted_secret into v_refresh
    from vault.decrypted_secrets where id = v_token.refresh_token_secret_id;
  if v_refresh is null then
    raise exception 'refresh-token vault entry missing for user %', p_user_id using errcode = 'P0002';
  end if;
  update google_oauth_tokens
     set last_used_at = now()
   where user_id = p_user_id and service = 'calendar';
  return jsonb_build_object(
    'connected',                true,
    'access_token',             v_token.access_token,
    'access_token_expires_at',  v_token.access_token_expires_at,
    'refresh_token',            v_refresh,
    'scope',                    v_token.scope,
    'google_email',             v_token.google_email
  );
end;
$$;


create or replace function public.rpc_calendar_update_access_token(
  p_user_id           uuid,
  p_access_token      text,
  p_access_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update google_oauth_tokens
     set access_token            = p_access_token,
         access_token_expires_at = p_access_expires_at
   where user_id = p_user_id and service = 'calendar';
end;
$$;


create or replace function public.rpc_calendar_mark_disconnected(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select google_email into v_email
    from google_oauth_tokens
   where user_id = p_user_id and service = 'calendar';
  update google_oauth_tokens
     set is_active = false, disconnected_at = now()
   where user_id = p_user_id and service = 'calendar';
  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (p_user_id, 'calendar_unlinked', 'google_oauth', null,
          jsonb_build_object('email', v_email, 'service', 'calendar'), 'api');
end;
$$;

-- =====================================================================
-- 3. Gmail RPCs — web-callable
-- =====================================================================

create or replace function public.rpc_gmail_request_authorize(
  p_redirect_to text default '/settings'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_state text;
begin
  v_state := encode(extensions.gen_random_bytes(24), 'hex');
  delete from oauth_state
   where user_id = v_uid and provider = 'google' and service = 'gmail';
  insert into oauth_state(state, user_id, provider, service, redirect_to)
  values (v_state, v_uid, 'google', 'gmail',
          coalesce(nullif(btrim(p_redirect_to), ''), '/settings'));
  return jsonb_build_object('state', v_state);
end;
$$;

comment on function public.rpc_gmail_request_authorize(text) is
  'Issues a CSRF state token for the Gmail OAuth handshake (10-min TTL). Frontend builds the auth URL with the public client_id and this state.';

grant execute on function public.rpc_gmail_request_authorize(text) to authenticated;


create or replace function public.rpc_gmail_link_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_email text;
  v_connected_at timestamptz;
  v_last_used_at timestamptz;
  v_scope text;
begin
  select google_email, connected_at, last_used_at, scope
    into v_email, v_connected_at, v_last_used_at, v_scope
  from google_oauth_tokens
   where user_id = v_uid and service = 'gmail' and is_active = true;
  if v_email is null then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected',    true,
    'email',        v_email,
    'connected_at', v_connected_at,
    'last_used_at', v_last_used_at,
    'scope',        v_scope
  );
end;
$$;

comment on function public.rpc_gmail_link_status() is
  'Returns the caller''s Gmail connection state. Safe fields only — tokens never cross this boundary.';

grant execute on function public.rpc_gmail_link_status() to authenticated;


create or replace function public.rpc_gmail_disconnect_self()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_email text;
begin
  select google_email into v_email
    from google_oauth_tokens
   where user_id = v_uid and service = 'gmail' and is_active = true;
  if v_email is null then
    return jsonb_build_object('success', false, 'message', 'no active connection');
  end if;
  update google_oauth_tokens
     set is_active = false, disconnected_at = now()
   where user_id = v_uid and service = 'gmail';
  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'gmail_unlinked', 'google_oauth', null,
          jsonb_build_object('email', v_email, 'service', 'gmail'), 'web');
  -- Email link snapshots are left intact (history pointers).
  return jsonb_build_object('success', true, 'email', v_email);
end;
$$;

comment on function public.rpc_gmail_disconnect_self() is
  'Marks the caller''s Gmail connection inactive. Existing email_links snapshots stay as history. Token revocation against Google happens in the gmail-oauth-revoke Edge Function.';

grant execute on function public.rpc_gmail_disconnect_self() to authenticated;

-- =====================================================================
-- 4. Gmail RPCs — service-role only (no grants)
-- =====================================================================

create or replace function public.rpc_gmail_consume_state(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row oauth_state;
begin
  delete from oauth_state where expires_at < now();
  delete from oauth_state
   where state = p_state and provider = 'google' and service = 'gmail'
     and expires_at > now()
  returning * into v_row;
  if v_row.user_id is null then
    raise exception 'invalid or expired oauth state' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'user_id',     v_row.user_id,
    'redirect_to', coalesce(v_row.redirect_to, '/settings')
  );
end;
$$;


create or replace function public.rpc_gmail_store_tokens(
  p_user_id           uuid,
  p_email             text,
  p_account_id        text,
  p_refresh_token     text,
  p_access_token      text,
  p_access_expires_at timestamptz,
  p_scope             text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing  google_oauth_tokens;
  v_secret_id uuid;
begin
  if p_refresh_token is null or length(btrim(p_refresh_token)) = 0 then
    raise exception 'refresh_token is required' using errcode = '22023';
  end if;
  if p_access_token is null or length(btrim(p_access_token)) = 0 then
    raise exception 'access_token is required' using errcode = '22023';
  end if;

  select * into v_existing
    from google_oauth_tokens
   where user_id = p_user_id and service = 'gmail';

  if v_existing.user_id is null then
    select vault.create_secret(p_refresh_token, null,
      'Google OAuth refresh token (gmail) for user ' || p_user_id::text)
      into v_secret_id;
    insert into google_oauth_tokens(
      user_id, service, google_account_id, google_email, access_token,
      access_token_expires_at, refresh_token_secret_id, scope, is_active, connected_at
    ) values (
      p_user_id, 'gmail', p_account_id, p_email, p_access_token,
      p_access_expires_at, v_secret_id, p_scope, true, now()
    );
  else
    perform vault.update_secret(v_existing.refresh_token_secret_id, p_refresh_token);
    update google_oauth_tokens
       set google_account_id      = p_account_id,
           google_email            = p_email,
           access_token            = p_access_token,
           access_token_expires_at = p_access_expires_at,
           scope                   = p_scope,
           is_active               = true,
           connected_at            = case when v_existing.is_active then v_existing.connected_at else now() end,
           disconnected_at         = null
     where user_id = p_user_id and service = 'gmail';
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (p_user_id, 'gmail_linked', 'google_oauth', null,
          jsonb_build_object('email', p_email, 'scope', p_scope, 'service', 'gmail'), 'web');

  return jsonb_build_object('success', true);
end;
$$;


create or replace function public.rpc_gmail_get_token(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   google_oauth_tokens;
  v_refresh text;
begin
  select * into v_token
    from google_oauth_tokens
   where user_id = p_user_id and service = 'gmail' and is_active = true;
  if v_token.user_id is null then
    return jsonb_build_object('connected', false);
  end if;
  select decrypted_secret into v_refresh
    from vault.decrypted_secrets where id = v_token.refresh_token_secret_id;
  if v_refresh is null then
    raise exception 'refresh-token vault entry missing for user %', p_user_id using errcode = 'P0002';
  end if;
  update google_oauth_tokens
     set last_used_at = now()
   where user_id = p_user_id and service = 'gmail';
  return jsonb_build_object(
    'connected',                true,
    'access_token',             v_token.access_token,
    'access_token_expires_at',  v_token.access_token_expires_at,
    'refresh_token',            v_refresh,
    'scope',                    v_token.scope,
    'google_email',             v_token.google_email
  );
end;
$$;


create or replace function public.rpc_gmail_update_access_token(
  p_user_id           uuid,
  p_access_token      text,
  p_access_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update google_oauth_tokens
     set access_token            = p_access_token,
         access_token_expires_at = p_access_expires_at
   where user_id = p_user_id and service = 'gmail';
end;
$$;


create or replace function public.rpc_gmail_mark_disconnected(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select google_email into v_email
    from google_oauth_tokens
   where user_id = p_user_id and service = 'gmail';
  update google_oauth_tokens
     set is_active = false, disconnected_at = now()
   where user_id = p_user_id and service = 'gmail';
  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (p_user_id, 'gmail_unlinked', 'google_oauth', null,
          jsonb_build_object('email', v_email, 'service', 'gmail'), 'api');
end;
$$;

-- =====================================================================
-- 5. email_links table — polymorphic snapshots of Gmail messages
-- =====================================================================

create table if not exists public.email_links (
  id                bigserial primary key,
  entity_type       text not null check (entity_type in ('task','follow_up')),
  entity_id         uuid not null,
  user_id           uuid not null references public.users(id),
  gmail_message_id  text not null,
  gmail_thread_id   text not null,
  subject           text,
  from_address      text,
  from_name         text,
  snippet           text,
  internal_date     timestamptz,
  html_link         text,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.email_links is
  'Polymorphic link from a RabihOS entity (task / follow_up) to a Gmail message. Subject/from/snippet/internal_date are snapshotted at link time so the row survives if the message is deleted in Gmail later. Disconnect leaves these rows intact (history pointers).';
comment on column public.email_links.gmail_message_id is
  'Gmail message id (immutable per message). Used to build the open-in-Gmail link.';
comment on column public.email_links.gmail_thread_id is
  'Gmail thread id. Same value for all messages in a thread.';
comment on column public.email_links.subject is 'Snapshot of the Subject header at link time.';
comment on column public.email_links.from_address is 'Snapshot of the From email address.';
comment on column public.email_links.from_name is 'Snapshot of the From display name (if present).';
comment on column public.email_links.snippet is 'Gmail-supplied snippet at link time. ~200 chars.';
comment on column public.email_links.internal_date is 'Gmail-supplied internalDate at link time.';
comment on column public.email_links.html_link is 'mail.google.com URL the user can click to open the message.';

create unique index if not exists uq_email_links_entity_message
  on public.email_links (entity_type, entity_id, gmail_message_id)
  where deleted_at is null;
create index if not exists idx_email_links_entity
  on public.email_links (entity_type, entity_id) where deleted_at is null;
create index if not exists idx_email_links_user
  on public.email_links (user_id) where deleted_at is null;

alter table public.email_links enable row level security;
drop policy if exists email_links_select_visible on public.email_links;
create policy email_links_select_visible on public.email_links
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('admin','ceo'));

-- =====================================================================
-- 6. Email link RPCs — web-callable
-- =====================================================================

create or replace function public.rpc_email_link_create(
  p_entity_type    text,
  p_entity_id      uuid,
  p_message_id     text,
  p_thread_id      text,
  p_subject        text,
  p_from_address   text,
  p_from_name      text,
  p_snippet        text,
  p_internal_date  timestamptz,
  p_html_link      text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_row    email_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot link emails' using errcode = '42501';
  end if;
  if p_entity_type not in ('task','follow_up') then
    raise exception 'invalid entity_type %', p_entity_type using errcode = '22023';
  end if;
  if not public._can_access_entity(p_entity_type, p_entity_id) then
    raise exception 'entity not accessible' using errcode = '42501';
  end if;
  if p_message_id is null or length(btrim(p_message_id)) = 0 then
    raise exception 'message_id is required' using errcode = '22023';
  end if;
  if p_thread_id is null or length(btrim(p_thread_id)) = 0 then
    raise exception 'thread_id is required' using errcode = '22023';
  end if;

  -- Idempotent: linking the same message to the same entity twice is a
  -- no-op. We return the existing live row.
  select * into v_row
    from email_links
   where entity_type = p_entity_type
     and entity_id   = p_entity_id
     and gmail_message_id = p_message_id
     and deleted_at is null
   limit 1;
  if v_row.id is not null then
    return to_jsonb(v_row);
  end if;

  insert into email_links(
    entity_type, entity_id, user_id, gmail_message_id, gmail_thread_id,
    subject, from_address, from_name, snippet, internal_date, html_link
  ) values (
    p_entity_type, p_entity_id, v_uid, p_message_id, p_thread_id,
    nullif(btrim(p_subject), ''),
    nullif(btrim(p_from_address), ''),
    nullif(btrim(p_from_name), ''),
    nullif(p_snippet, ''),
    p_internal_date,
    nullif(btrim(p_html_link), '')
  )
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'email_linked', p_entity_type, p_entity_id,
          jsonb_build_object('message_id', p_message_id, 'subject', p_subject), 'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_email_link_create(text, uuid, text, text, text, text, text, text, timestamptz, text) is
  'Snapshots a Gmail message and links it to a task or follow_up. Idempotent on (entity, message_id). Requires _can_mutate + entity access.';

grant execute on function public.rpc_email_link_create(text, uuid, text, text, text, text, text, text, timestamptz, text) to authenticated;


create or replace function public.rpc_email_link_remove(p_link_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row email_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot unlink emails' using errcode = '42501';
  end if;
  select * into v_row from email_links where id = p_link_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'email link % not found', p_link_id using errcode = 'P0002';
  end if;
  -- Only the user who linked it, or admin/ceo, may unlink.
  if v_row.user_id <> v_uid and public.current_user_role() not in ('admin','ceo') then
    raise exception 'not allowed to unlink this email' using errcode = '42501';
  end if;

  update email_links set deleted_at = now()
   where id = p_link_id
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'email_unlinked', v_row.entity_type, v_row.entity_id,
          jsonb_build_object('message_id', v_row.gmail_message_id, 'subject', v_row.subject), 'web');

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_email_link_remove(bigint) is
  'Soft-deletes an email_links row. Caller must be the linker, admin, or ceo.';

grant execute on function public.rpc_email_link_remove(bigint) to authenticated;


create or replace function public.rpc_email_links_for_entity(
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_result jsonb;
begin
  if not public._can_access_entity(p_entity_type, p_entity_id) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',               l.id,
    'gmail_message_id', l.gmail_message_id,
    'gmail_thread_id',  l.gmail_thread_id,
    'subject',          l.subject,
    'from_address',     l.from_address,
    'from_name',        l.from_name,
    'snippet',          l.snippet,
    'internal_date',    l.internal_date,
    'html_link',        l.html_link,
    'created_at',       l.created_at,
    'mine',             l.user_id = v_uid
  ) order by l.internal_date desc nulls last, l.created_at desc), '[]'::jsonb)
    into v_result
  from email_links l
  where l.entity_type = p_entity_type
    and l.entity_id   = p_entity_id
    and l.deleted_at  is null
    and (l.user_id = v_uid or v_role in ('admin','ceo'));
  return v_result;
end;
$$;

comment on function public.rpc_email_links_for_entity(text, uuid) is
  'Returns email link snapshots for an entity. Visible: own links + admin/ceo. Ordered by Gmail internal_date desc.';

grant execute on function public.rpc_email_links_for_entity(text, uuid) to authenticated;

commit;
