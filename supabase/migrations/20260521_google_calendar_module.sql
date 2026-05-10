-- Rabih Ops — Phase D: Google Calendar module
-- =====================================================================
-- Three new tables, 11 RPCs, Vault-backed refresh token storage.
--
-- Tables:
--   * google_oauth_tokens  per-user OAuth state. Locked from frontend
--                          (RLS enabled, no SELECT policies). Refresh
--                          token stored in vault.secrets via
--                          refresh_token_secret_id; access_token kept
--                          inline (short-lived).
--   * calendar_event_links polymorphic link from RabihOS task/follow_up
--                          to a Google Calendar event. SELECT for owner
--                          + admin/ceo.
--   * oauth_state          CSRF nonce for the OAuth handshake. 10-min TTL,
--                          consumed once by the callback Edge Function.
--
-- Web RPCs (granted to authenticated):
--   rpc_calendar_request_authorize, rpc_calendar_link_status,
--   rpc_calendar_disconnect_self, rpc_calendar_links_for_entity
--
-- Service-role RPCs (Edge Functions only — no grant):
--   rpc_calendar_consume_state, rpc_calendar_store_tokens,
--   rpc_calendar_get_token, rpc_calendar_update_access_token,
--   rpc_calendar_mark_disconnected, rpc_calendar_record_event,
--   rpc_calendar_remove_event
--
-- Audit verbs (existing source values cover these):
--   calendar_linked, calendar_unlinked,
--   calendar_event_created, calendar_event_deleted

begin;

-- =========================================================
-- 1. google_oauth_tokens (locked from frontend)
-- =========================================================

create table if not exists public.google_oauth_tokens (
  user_id                  uuid primary key references public.users(id) on delete cascade,
  google_account_id        text not null,
  google_email             text not null,
  access_token             text not null,
  access_token_expires_at  timestamptz not null,
  refresh_token_secret_id  uuid not null,
  scope                    text not null,
  is_active                boolean not null default true,
  connected_at             timestamptz not null default now(),
  disconnected_at          timestamptz,
  last_used_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table  public.google_oauth_tokens is
  'Per-user Google OAuth state. Refresh token lives in vault.secrets via refresh_token_secret_id; access_token kept inline since it expires hourly. RLS denies all access from authenticated/anon — only Edge Functions reach this via service role.';
comment on column public.google_oauth_tokens.refresh_token_secret_id is
  'FK-style pointer into vault.secrets(id). Resolved via vault.decrypted_secrets in Edge Function paths.';

alter table public.google_oauth_tokens enable row level security;
-- Deliberately NO policies. Frontend cannot read these rows. Service role
-- bypasses RLS so the Edge Function paths still work.

drop trigger if exists trg_google_oauth_tokens_updated_at on public.google_oauth_tokens;
create trigger trg_google_oauth_tokens_updated_at
before update on public.google_oauth_tokens
for each row execute function public.set_updated_at();

-- =========================================================
-- 2. calendar_event_links (polymorphic)
-- =========================================================

create table if not exists public.calendar_event_links (
  id                  bigserial primary key,
  entity_type         text not null check (entity_type in ('task','follow_up')),
  entity_id           uuid not null,
  user_id             uuid not null references public.users(id),
  google_calendar_id  text not null default 'primary',
  google_event_id     text not null,
  event_title         text,
  event_start         timestamptz,
  event_end           timestamptz,
  event_html_link     text,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table public.calendar_event_links is
  'Links from a RabihOS entity (task / follow_up) to a Google Calendar event. Soft-deleted via deleted_at. Disconnect leaves rows alone (history pointers).';

create index if not exists idx_calendar_event_links_entity
  on public.calendar_event_links (entity_type, entity_id) where deleted_at is null;
create index if not exists idx_calendar_event_links_user
  on public.calendar_event_links (user_id) where deleted_at is null;

alter table public.calendar_event_links enable row level security;
drop policy if exists calendar_event_links_select_visible on public.calendar_event_links;
create policy calendar_event_links_select_visible on public.calendar_event_links
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('admin','ceo'));

-- =========================================================
-- 3. oauth_state (10-min CSRF nonces)
-- =========================================================

create table if not exists public.oauth_state (
  state        text primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  provider     text not null check (provider in ('google')),
  redirect_to  text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes'
);

comment on table public.oauth_state is
  'Short-lived CSRF nonce table for the Google OAuth handshake. Consumed exactly once by the callback Edge Function via rpc_calendar_consume_state. Lazy cleanup on each consume.';

create index if not exists idx_oauth_state_expires on public.oauth_state (expires_at);

alter table public.oauth_state enable row level security;
drop policy if exists oauth_state_select_self on public.oauth_state;
create policy oauth_state_select_self on public.oauth_state
  for select to authenticated using (user_id = auth.uid());

-- =========================================================
-- 4. Web-callable RPCs
-- =========================================================

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
  -- 48-char hex (24 random bytes) — plenty of entropy, URL-safe.
  v_state := encode(extensions.gen_random_bytes(24), 'hex');

  -- Wipe any stale rows for this user so re-clicking Connect always works.
  delete from oauth_state where user_id = v_uid and provider = 'google';

  insert into oauth_state(state, user_id, provider, redirect_to)
  values (v_state, v_uid, 'google', coalesce(nullif(btrim(p_redirect_to), ''), '/settings'));

  return jsonb_build_object('state', v_state);
end;
$$;

comment on function public.rpc_calendar_request_authorize(text) is
  'Issues a 48-char hex CSRF state for the Google OAuth handshake, valid for 15 minutes (table TTL). Frontend builds the auth URL using the public client_id and this state.';

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
  -- SECURITY DEFINER bypasses the no-policy RLS on google_oauth_tokens.
  -- We only return the safe fields — never tokens.
  select google_email, connected_at, last_used_at, scope
    into v_email, v_connected_at, v_last_used_at, v_scope
  from google_oauth_tokens
   where user_id = v_uid and is_active = true;

  if v_email is null then
    return jsonb_build_object('connected', false);
  end if;

  return jsonb_build_object(
    'connected',     true,
    'email',         v_email,
    'connected_at',  v_connected_at,
    'last_used_at',  v_last_used_at,
    'scope',         v_scope
  );
end;
$$;

comment on function public.rpc_calendar_link_status() is
  'Returns the calling user''s Google Calendar connection state. Only safe fields (email, timestamps, scope) — tokens never cross this boundary.';

grant execute on function public.rpc_calendar_link_status() to authenticated;


create or replace function public.rpc_calendar_disconnect_self()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_email  text;
begin
  select google_email into v_email
    from google_oauth_tokens
   where user_id = v_uid and is_active = true;

  if v_email is null then
    return jsonb_build_object('success', false, 'message', 'no active connection');
  end if;

  update google_oauth_tokens
     set is_active = false, disconnected_at = now()
   where user_id = v_uid;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_uid, 'calendar_unlinked', 'google_oauth', null,
          jsonb_build_object('email', v_email), 'web');

  -- We deliberately leave calendar_event_links alone (history pointers).
  -- The Edge Function calendar-oauth-revoke separately calls Google's
  -- revoke endpoint; this RPC just flips local state.
  return jsonb_build_object('success', true, 'email', v_email);
end;
$$;

comment on function public.rpc_calendar_disconnect_self() is
  'Marks the caller''s Google connection inactive. Existing calendar_event_links are kept as history pointers. Token revocation against Google happens in the calendar-oauth-revoke Edge Function.';

grant execute on function public.rpc_calendar_disconnect_self() to authenticated;


create or replace function public.rpc_calendar_links_for_entity(
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
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                 l.id,
    'google_calendar_id', l.google_calendar_id,
    'google_event_id',    l.google_event_id,
    'event_title',        l.event_title,
    'event_start',        l.event_start,
    'event_end',          l.event_end,
    'event_html_link',    l.event_html_link,
    'created_at',         l.created_at,
    'mine',               l.user_id = v_uid
  ) order by l.created_at desc), '[]'::jsonb)
    into v_result
  from calendar_event_links l
  where l.entity_type = p_entity_type
    and l.entity_id   = p_entity_id
    and l.deleted_at  is null
    and (l.user_id = v_uid or v_role in ('admin','ceo'));
  return v_result;
end;
$$;

grant execute on function public.rpc_calendar_links_for_entity(text, uuid) to authenticated;

-- =========================================================
-- 5. Service-role RPCs (Edge Functions only — no grants)
-- =========================================================

create or replace function public.rpc_calendar_consume_state(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row oauth_state;
begin
  -- Lazy cleanup of expired rows.
  delete from oauth_state where expires_at < now();

  delete from oauth_state
   where state = p_state and provider = 'google' and expires_at > now()
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

  select * into v_existing from google_oauth_tokens where user_id = p_user_id;

  if v_existing.user_id is null then
    -- Fresh: create vault secret, then insert row.
    select vault.create_secret(p_refresh_token, null,
      'Google OAuth refresh token for user ' || p_user_id::text)
      into v_secret_id;

    insert into google_oauth_tokens(
      user_id, google_account_id, google_email, access_token,
      access_token_expires_at, refresh_token_secret_id, scope, is_active, connected_at
    ) values (
      p_user_id, p_account_id, p_email, p_access_token,
      p_access_expires_at, v_secret_id, p_scope, true, now()
    );
  else
    -- Existing: update vault secret in place + refresh row.
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
     where user_id = p_user_id;
    v_secret_id := v_existing.refresh_token_secret_id;
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (p_user_id, 'calendar_linked', 'google_oauth', null,
          jsonb_build_object('email', p_email, 'scope', p_scope), 'web');

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
  select * into v_token from google_oauth_tokens where user_id = p_user_id and is_active = true;
  if v_token.user_id is null then
    return jsonb_build_object('connected', false);
  end if;

  select decrypted_secret into v_refresh
    from vault.decrypted_secrets where id = v_token.refresh_token_secret_id;
  if v_refresh is null then
    raise exception 'refresh-token vault entry missing for user %', p_user_id using errcode = 'P0002';
  end if;

  update google_oauth_tokens set last_used_at = now() where user_id = p_user_id;

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
   where user_id = p_user_id;
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
  select google_email into v_email from google_oauth_tokens where user_id = p_user_id;

  update google_oauth_tokens
     set is_active = false, disconnected_at = now()
   where user_id = p_user_id;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (p_user_id, 'calendar_unlinked', 'google_oauth', null,
          jsonb_build_object('email', v_email), 'api');
end;
$$;


create or replace function public.rpc_calendar_record_event(
  p_entity_type text,
  p_entity_id   uuid,
  p_user_id     uuid,
  p_calendar_id text,
  p_event_id    text,
  p_title       text,
  p_start       timestamptz,
  p_end         timestamptz,
  p_html_link   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row calendar_event_links;
begin
  insert into calendar_event_links(
    entity_type, entity_id, user_id, google_calendar_id, google_event_id,
    event_title, event_start, event_end, event_html_link
  ) values (
    p_entity_type, p_entity_id, p_user_id,
    coalesce(p_calendar_id, 'primary'), p_event_id,
    p_title, p_start, p_end, p_html_link
  )
  returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (p_user_id, 'calendar_event_created', p_entity_type, p_entity_id,
          jsonb_build_object(
            'event_id', p_event_id,
            'title',    p_title,
            'start',    p_start,
            'end',      p_end,
            'calendar', coalesce(p_calendar_id, 'primary')
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;


create or replace function public.rpc_calendar_remove_event(p_link_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row calendar_event_links;
begin
  update calendar_event_links set deleted_at = now()
   where id = p_link_id and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'calendar event link % not found', p_link_id using errcode = 'P0002';
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (v_row.user_id, 'calendar_event_deleted', v_row.entity_type, v_row.entity_id,
          jsonb_build_object('event_id', v_row.google_event_id, 'title', v_row.event_title),
          'web');

  return to_jsonb(v_row);
end;
$$;

commit;
