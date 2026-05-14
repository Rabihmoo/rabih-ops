-- Rabih Ops — Phase G3.1: email link presence (batch read RPC)
-- =====================================================================
-- Powers the Dashboard "Linked to task" / "Linked to follow-up" pills
-- on email rows. Read-only, batched lookup of which of N supplied
-- gmail_message_ids have a live email_links row owned by the caller,
-- pinned to a specific Gmail account.
--
-- Scope intentionally NARROW (per the approved design):
--   * Caller-owned visibility ONLY. Admin/CEO global visibility is
--     deliberately NOT applied here — this is a personal mailbox
--     projection, not an admin-wide entity-relation report. Use
--     rpc_email_links_for_entity (which already carries the admin/CEO
--     carve-out) when admin-wide visibility is needed.
--   * Account-scoped. p_google_account_id pins the lookup to a single
--     Gmail account the caller controls. Defence-in-depth for the day
--     multi-account UI lands.
--   * Cap p_message_ids at 200 (matches the Today / email_states
--     parent-level fetch sizes).
--
-- NOT added by this migration:
--   * No table change.
--   * No new column. email_links.google_account_id (nullable since
--     20260601_gmail_v2_additive.sql) is the filter column.
--   * No RLS change. Function is SECURITY DEFINER and applies the
--     caller-owned filter inline.
--   * No index change. At V1 row counts the existing
--     idx_email_links_user partial index suffices; if volume grows,
--     a composite index follows in a separate migration.

begin;

-- Idempotent re-install: drop any prior signature variant before
-- (re-)creating. The two known shapes are this account-scoped one and
-- a (text[])-only variant we considered but never shipped.
drop function if exists public.rpc_email_link_presence_for_messages(text, text[]);
drop function if exists public.rpc_email_link_presence_for_messages(text[]);

create or replace function public.rpc_email_link_presence_for_messages(
  p_google_account_id text,
  p_message_ids       text[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
begin
  -- Empty / null inputs return [] without raising. Callers can safely
  -- pass an unfiltered batch even when the list is mid-load.
  if p_message_ids is null or cardinality(p_message_ids) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(p_message_ids) > 200 then
    raise exception 'p_message_ids exceeds the 200-entry cap (got %)',
      cardinality(p_message_ids) using errcode = '22023';
  end if;
  if p_google_account_id is null or length(btrim(p_google_account_id)) = 0 then
    raise exception 'p_google_account_id is required' using errcode = '22023';
  end if;
  if not public._can_access_gmail_account(p_google_account_id) then
    raise exception 'gmail account not accessible' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'gmail_message_id',   gmail_message_id,
        'has_task_link',      has_task_link,
        'has_follow_up_link', has_follow_up_link
      )
      order by gmail_message_id
    )
    from (
      select l.gmail_message_id,
             bool_or(l.entity_type = 'task')      as has_task_link,
             bool_or(l.entity_type = 'follow_up') as has_follow_up_link
        from public.email_links l
       where l.user_id           = v_uid
         and l.google_account_id = p_google_account_id
         and l.gmail_message_id  = any(p_message_ids)
         and l.deleted_at        is null
       group by l.gmail_message_id
    ) s
  ), '[]'::jsonb);
end;
$$;

comment on function public.rpc_email_link_presence_for_messages(text, text[]) is
  'Batch presence lookup: returns rows {gmail_message_id, has_task_link, has_follow_up_link} for caller-owned email_links pinned to a specific Gmail account. Drives the Dashboard "Linked to task / follow-up" pills. Caller-owned visibility only (no admin/CEO carve-out). Cap 200 message ids.';

grant execute on function public.rpc_email_link_presence_for_messages(text, text[]) to authenticated;

commit;
