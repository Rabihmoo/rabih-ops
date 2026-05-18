-- Rabih Ops — Google OAuth "needs reconnect" state
-- =====================================================================
-- When Google returns invalid_grant on the refresh-token exchange (most
-- commonly: a Testing-status OAuth app whose 7-day refresh-token expiry
-- has elapsed), the access-token side of the pipeline collapses but the
-- existing row in google_oauth_tokens stays is_active=true. The frontend
-- then reads a stale rpc_*_link_status saying "connected" and the
-- Dashboard cards leak Google's raw "refresh-token exchange 400 …" body
-- straight into the user-facing surface.
--
-- This migration adds an explicit "needs_reconnect" state so:
--   * rpc_*_link_status returns connected=false, needs_reconnect=true,
--     and the existing google_email so the UI can say "Reconnect <email>".
--   * Edge Functions short-circuit refresh attempts once flagged (no more
--     repeated 400s against Google's oauth2 endpoint).
--   * _has_calendar_connection treats the flag as "not connected" so
--     dismissals / writes are also blocked until the user re-consents.
--   * A successful re-OAuth handshake clears the flag and the audit
--     trail records calendar_token_expired / gmail_token_expired.
--
-- Columns added:
--   google_oauth_tokens.needs_reconnect  boolean  default false
--   google_oauth_tokens.expired_at       timestamptz nullable
--
-- New RPC (service-role only — no grant):
--   rpc_google_mark_needs_reconnect(p_user_id, p_service)
--
-- RPCs re-created (no signature change):
--   rpc_calendar_link_status   — returns needs_reconnect
--   rpc_gmail_link_status      — returns needs_reconnect
--   rpc_calendar_get_token     — returns needs_reconnect
--   rpc_gmail_get_token        — returns needs_reconnect
--   rpc_calendar_store_tokens  — clears needs_reconnect on re-connect
--   rpc_gmail_store_tokens     — clears needs_reconnect on re-connect
--   _has_calendar_connection   — gates on needs_reconnect=false
--
-- Audit verbs (new):
--   calendar_token_expired
--   gmail_token_expired

begin;

-- =====================================================================
-- 1. Columns
-- =====================================================================

alter table public.google_oauth_tokens
  add column if not exists needs_reconnect boolean not null default false;
alter table public.google_oauth_tokens
  add column if not exists expired_at timestamptz;

comment on column public.google_oauth_tokens.needs_reconnect is
  'True when Google returned invalid_grant on a refresh exchange — the refresh token has been revoked or expired (Testing-status apps expire refresh tokens after 7 days for non-owner users). The frontend reads this via rpc_*_link_status and prompts the user to re-consent. Cleared on a successful re-OAuth handshake by rpc_*_store_tokens.';
comment on column public.google_oauth_tokens.expired_at is
  'Timestamp of the first invalid_grant that flipped needs_reconnect=true. Stable across subsequent failed refresh attempts so the audit trail captures the original event.';

-- =====================================================================
-- 2. _has_calendar_connection — gate on needs_reconnect=false
-- =====================================================================

create or replace function public._has_calendar_connection()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.google_oauth_tokens
     where user_id         = auth.uid()
       and service         = 'calendar'
       and is_active       = true
       and needs_reconnect = false
  );
$$;
comment on function public._has_calendar_connection() is
  'True iff the caller has an ACTIVE Google Calendar connection that is not in the needs_reconnect state. Used by Calendar Inbox dismissal RPCs to block writes while the connection is broken.';

-- =====================================================================
-- 3. rpc_calendar_link_status — include needs_reconnect
-- =====================================================================

create or replace function public.rpc_calendar_link_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_auth();
  v_row google_oauth_tokens;
begin
  select * into v_row
    from google_oauth_tokens
   where user_id = v_uid and service = 'calendar' and is_active = true;

  if v_row.user_id is null then
    return jsonb_build_object('connected', false, 'needs_reconnect', false);
  end if;

  if v_row.needs_reconnect then
    return jsonb_build_object(
      'connected',       false,
      'needs_reconnect', true,
      'email',           v_row.google_email,
      'connected_at',    v_row.connected_at,
      'expired_at',      v_row.expired_at,
      'scope',           v_row.scope
    );
  end if;

  return jsonb_build_object(
    'connected',       true,
    'needs_reconnect', false,
    'email',           v_row.google_email,
    'connected_at',    v_row.connected_at,
    'last_used_at',    v_row.last_used_at,
    'scope',           v_row.scope
  );
end;
$$;
comment on function public.rpc_calendar_link_status() is
  'Returns the caller''s Google Calendar connection state. Three states: not-connected (connected=false, needs_reconnect=false), needs-reconnect (connected=false, needs_reconnect=true, email retained), and connected (connected=true). Tokens never cross this boundary.';

grant execute on function public.rpc_calendar_link_status() to authenticated;

-- =====================================================================
-- 4. rpc_gmail_link_status — include needs_reconnect + google_account_id
-- =====================================================================
-- Preserves the google_account_id field added by 20260603 (used by
-- email_states mutations) so callers don't regress.

create or replace function public.rpc_gmail_link_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_auth();
  v_row google_oauth_tokens;
begin
  select * into v_row
    from google_oauth_tokens
   where user_id = v_uid and service = 'gmail' and is_active = true;

  if v_row.user_id is null then
    return jsonb_build_object('connected', false, 'needs_reconnect', false);
  end if;

  if v_row.needs_reconnect then
    return jsonb_build_object(
      'connected',         false,
      'needs_reconnect',   true,
      'email',             v_row.google_email,
      'google_account_id', v_row.google_account_id,
      'connected_at',      v_row.connected_at,
      'expired_at',        v_row.expired_at,
      'scope',             v_row.scope
    );
  end if;

  return jsonb_build_object(
    'connected',         true,
    'needs_reconnect',   false,
    'email',             v_row.google_email,
    'google_account_id', v_row.google_account_id,
    'connected_at',      v_row.connected_at,
    'last_used_at',      v_row.last_used_at,
    'scope',             v_row.scope
  );
end;
$$;
comment on function public.rpc_gmail_link_status() is
  'Returns the caller''s Gmail connection state. Three states (see rpc_calendar_link_status). Includes google_account_id so email_states mutations can key off it without a second roundtrip.';

grant execute on function public.rpc_gmail_link_status() to authenticated;

-- =====================================================================
-- 5. rpc_calendar_get_token — surface needs_reconnect
-- =====================================================================

create or replace function public.rpc_calendar_get_token(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_token   google_oauth_tokens;
  v_refresh text;
begin
  select * into v_token
    from google_oauth_tokens
   where user_id = p_user_id and service = 'calendar' and is_active = true;
  if v_token.user_id is null then
    return jsonb_build_object('connected', false, 'needs_reconnect', false);
  end if;
  if v_token.needs_reconnect then
    -- Edge Function short-circuits on this so we never attempt another
    -- doomed refresh against Google. Return the email so the caller
    -- can echo it through to the user-facing copy.
    return jsonb_build_object(
      'connected',       false,
      'needs_reconnect', true,
      'google_email',    v_token.google_email,
      'expired_at',      v_token.expired_at
    );
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
    'needs_reconnect',          false,
    'access_token',             v_token.access_token,
    'access_token_expires_at',  v_token.access_token_expires_at,
    'refresh_token',            v_refresh,
    'scope',                    v_token.scope,
    'google_email',             v_token.google_email
  );
end;
$$;

-- =====================================================================
-- 6. rpc_gmail_get_token — surface needs_reconnect
-- =====================================================================

create or replace function public.rpc_gmail_get_token(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_token   google_oauth_tokens;
  v_refresh text;
begin
  select * into v_token
    from google_oauth_tokens
   where user_id = p_user_id and service = 'gmail' and is_active = true;
  if v_token.user_id is null then
    return jsonb_build_object('connected', false, 'needs_reconnect', false);
  end if;
  if v_token.needs_reconnect then
    return jsonb_build_object(
      'connected',       false,
      'needs_reconnect', true,
      'google_email',    v_token.google_email,
      'expired_at',      v_token.expired_at
    );
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
    'needs_reconnect',          false,
    'access_token',             v_token.access_token,
    'access_token_expires_at',  v_token.access_token_expires_at,
    'refresh_token',            v_refresh,
    'scope',                    v_token.scope,
    'google_email',             v_token.google_email
  );
end;
$$;

-- =====================================================================
-- 7. rpc_calendar_store_tokens — clear needs_reconnect on re-connect
-- =====================================================================

create or replace function public.rpc_calendar_store_tokens(
  p_user_id           uuid,
  p_email             text,
  p_account_id        text,
  p_refresh_token     text,
  p_access_token      text,
  p_access_expires_at timestamptz,
  p_scope             text
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
      access_token_expires_at, refresh_token_secret_id, scope, is_active, connected_at,
      needs_reconnect, expired_at
    ) values (
      p_user_id, 'calendar', p_account_id, p_email, p_access_token,
      p_access_expires_at, v_secret_id, p_scope, true, now(),
      false, null
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
           disconnected_at         = null,
           needs_reconnect         = false,
           expired_at              = null
     where user_id = p_user_id and service = 'calendar';
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (p_user_id, 'calendar_linked', 'google_oauth', null,
          jsonb_build_object('email', p_email, 'scope', p_scope, 'service', 'calendar'), 'web');

  return jsonb_build_object('success', true);
end;
$$;

-- =====================================================================
-- 8. rpc_gmail_store_tokens — clear needs_reconnect on re-connect
-- =====================================================================

create or replace function public.rpc_gmail_store_tokens(
  p_user_id           uuid,
  p_email             text,
  p_account_id        text,
  p_refresh_token     text,
  p_access_token      text,
  p_access_expires_at timestamptz,
  p_scope             text
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
      access_token_expires_at, refresh_token_secret_id, scope, is_active, connected_at,
      needs_reconnect, expired_at
    ) values (
      p_user_id, 'gmail', p_account_id, p_email, p_access_token,
      p_access_expires_at, v_secret_id, p_scope, true, now(),
      false, null
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
           disconnected_at         = null,
           needs_reconnect         = false,
           expired_at              = null
     where user_id = p_user_id and service = 'gmail';
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (p_user_id, 'gmail_linked', 'google_oauth', null,
          jsonb_build_object('email', p_email, 'scope', p_scope, 'service', 'gmail'), 'web');

  return jsonb_build_object('success', true);
end;
$$;

-- =====================================================================
-- 9. rpc_google_mark_needs_reconnect — Edge Function entry point
-- =====================================================================
-- Service-role only. Called by _shared/google.ts when Google returns
-- invalid_grant on the refresh exchange. Idempotent: if the row is
-- already flagged, returns marked=false and skips the audit insert so
-- repeated failed refreshes don't spam the audit log.

create or replace function public.rpc_google_mark_needs_reconnect(
  p_user_id uuid,
  p_service text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_was   boolean;
  v_verb  text;
begin
  if p_service not in ('calendar', 'gmail') then
    raise exception 'invalid service: %', p_service using errcode = '22023';
  end if;

  select google_email, needs_reconnect into v_email, v_was
    from google_oauth_tokens
   where user_id = p_user_id and service = p_service;

  if v_email is null then
    return jsonb_build_object('marked', false, 'reason', 'no row');
  end if;

  if v_was then
    return jsonb_build_object(
      'marked', false, 'reason', 'already marked', 'email', v_email
    );
  end if;

  update google_oauth_tokens
     set needs_reconnect = true,
         expired_at      = coalesce(expired_at, now())
   where user_id = p_user_id and service = p_service;

  v_verb := p_service || '_token_expired';
  insert into audit_log(user_id, action, entity_type, entity_id, before_state, source)
  values (
    p_user_id, v_verb, 'google_oauth', null,
    jsonb_build_object('email', v_email, 'service', p_service), 'api'
  );

  return jsonb_build_object('marked', true, 'email', v_email);
end;
$$;
comment on function public.rpc_google_mark_needs_reconnect(uuid, text) is
  'Service-role-only. Flags a Google OAuth row as needs_reconnect=true and stamps expired_at + an audit entry. Called by _shared/google.ts when Google returns invalid_grant on the refresh exchange. Idempotent — repeated calls are no-ops once flagged.';

-- Service-role bypasses RLS but EXECUTE on functions still requires a
-- grant somewhere; deny PUBLIC explicitly so an authenticated user can't
-- call this RPC to mark another user's connection expired.
revoke all on function public.rpc_google_mark_needs_reconnect(uuid, text) from public;

commit;
