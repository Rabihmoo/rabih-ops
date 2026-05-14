-- Rabih Ops — rpc_gmail_link_status function restore (drift remediation)
-- =====================================================================
-- Restores rpc_gmail_link_status to its 20260603 body, which projects
-- google_account_id alongside email / connected_at / last_used_at /
-- scope. Observed on staging via pg_get_functiondef: the deployed
-- body did not contain 'google_account_id', meaning it had reverted
-- to its pre-20260603 (Phase F) shape.
--
-- Impact: the G2.3 Dashboard email cards (and the upcoming G3.1
-- linked-to pills wire-up) all read status.data.google_account_id to
-- pass it through to email_state RPCs and to the new
-- rpc_email_link_presence_for_messages RPC. Without this key,
-- those cards see undefined and skip their account-scoped queries.
--
-- Source of truth: 20260603_rpc_gmail_link_status_account_id.sql.
-- Body below is a verbatim copy of that migration's function body.
--
-- Scope: CREATE OR REPLACE FUNCTION only. No DDL. No data writes.
-- No table / constraint changes. Idempotent — re-applying is a no-op
-- when the body is already at 20260603 state.

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
