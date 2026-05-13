-- Rabih Ops — G2.3 wire-up: expose google_account_id via rpc_gmail_link_status
-- =====================================================================
-- Adds a single new key (`google_account_id`) to the jsonb response.
-- Same signature, same grant, same RLS posture (SECURITY DEFINER reads
-- the otherwise-RLS-locked tokens table). V1 callers that read only
-- `connected` / `email` keep working unchanged — jsonb is freely
-- extensible at the wire level, so extra keys are ignored.
--
-- Why: the G2.3 frontend needs google_account_id so it can pass it
-- to the G2.1 email_state RPCs (which require it). Currently the
-- frontend has no way to learn the operator's account id without
-- either a new RPC or threading it through Gmail Edge Function
-- responses. Extending this one existing read RPC is the smallest
-- change.
--
-- Idempotent: CREATE OR REPLACE FUNCTION of the same signature.

begin;

create or replace function public.rpc_gmail_link_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_email             text;
  v_google_account_id text;
  v_connected_at      timestamptz;
  v_last_used_at      timestamptz;
  v_scope             text;
begin
  select google_email, google_account_id, connected_at, last_used_at, scope
    into v_email, v_google_account_id, v_connected_at, v_last_used_at, v_scope
    from google_oauth_tokens
   where user_id = v_uid and service = 'gmail' and is_active = true;
  if v_email is null then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected',         true,
    'email',             v_email,
    'google_account_id', v_google_account_id,
    'connected_at',      v_connected_at,
    'last_used_at',      v_last_used_at,
    'scope',             v_scope
  );
end;
$$;

comment on function public.rpc_gmail_link_status() is
  'Returns the caller''s Gmail connection state. Safe fields only — tokens never cross this boundary. Includes google_account_id so frontend mutations on email_states can address the right mailbox.';

commit;
