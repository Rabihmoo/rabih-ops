-- Rabih Ops — user_inbox_settings for Smart Suggestions v2
-- =====================================================================
-- Per-user threshold overrides and disabled-rules list for the inbox
-- suggestion engine. Rules read these at compose time (client-side);
-- the table is a thin config store, not a runtime dependency of any
-- server-side RPC.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION.

begin;

create table if not exists public.user_inbox_settings (
  user_id                   uuid primary key references public.users(id) on delete cascade,
  stale_follow_up_days      int  not null default 7,
  supplier_silence_days     int  not null default 5,
  draft_doc_aging_days      int  not null default 14,
  recurring_grace_days      int  not null default 2,
  disabled_rules            text[] not null default '{}',
  updated_at                timestamptz not null default now()
);

comment on table public.user_inbox_settings is
  'Per-user thresholds and disabled-rules list for the Smart Suggestions engine. Read client-side at compose time.';
comment on column public.user_inbox_settings.disabled_rules is
  'Array of rule keys (e.g. stale-follow-up) that the user has opted out of. The compose pipeline skips any rule whose key is in this list.';

-- RLS enabled, no SELECT policies — SECURITY DEFINER RPCs only
alter table public.user_inbox_settings enable row level security;

-- Read RPC — returns the caller's settings or defaults
create or replace function public.rpc_get_inbox_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_result jsonb;
begin
  select row_to_json(s.*) into v_result
    from user_inbox_settings s
   where s.user_id = v_uid;

  -- If no row yet, return defaults
  if v_result is null then
    v_result := jsonb_build_object(
      'stale_follow_up_days', 7,
      'supplier_silence_days', 5,
      'draft_doc_aging_days', 14,
      'recurring_grace_days', 2,
      'disabled_rules', '[]'::jsonb
    );
  end if;

  return v_result;
end;
$$;

comment on function public.rpc_get_inbox_settings() is
  'Returns the calling user''s inbox suggestion settings or defaults if no row exists.';
grant execute on function public.rpc_get_inbox_settings() to authenticated;

-- Write RPC — upserts the caller's settings
create or replace function public.rpc_set_inbox_settings(
  p_stale_follow_up_days  int     default null,
  p_supplier_silence_days int     default null,
  p_draft_doc_aging_days  int     default null,
  p_recurring_grace_days  int     default null,
  p_disabled_rules        text[]  default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_result jsonb;
begin
  insert into user_inbox_settings (user_id, stale_follow_up_days, supplier_silence_days, draft_doc_aging_days, recurring_grace_days, disabled_rules, updated_at)
  values (
    v_uid,
    coalesce(p_stale_follow_up_days, 7),
    coalesce(p_supplier_silence_days, 5),
    coalesce(p_draft_doc_aging_days, 14),
    coalesce(p_recurring_grace_days, 2),
    coalesce(p_disabled_rules, '{}'),
    now()
  )
  on conflict (user_id) do update set
    stale_follow_up_days = coalesce(p_stale_follow_up_days, user_inbox_settings.stale_follow_up_days),
    supplier_silence_days = coalesce(p_supplier_silence_days, user_inbox_settings.supplier_silence_days),
    draft_doc_aging_days = coalesce(p_draft_doc_aging_days, user_inbox_settings.draft_doc_aging_days),
    recurring_grace_days = coalesce(p_recurring_grace_days, user_inbox_settings.recurring_grace_days),
    disabled_rules = coalesce(p_disabled_rules, user_inbox_settings.disabled_rules),
    updated_at = now();

  select row_to_json(s.*) into v_result
    from user_inbox_settings s
   where s.user_id = v_uid;

  return v_result;
end;
$$;

comment on function public.rpc_set_inbox_settings(int, int, int, int, text[]) is
  'Upserts the calling user''s inbox suggestion settings. Null params preserve existing values.';
grant execute on function public.rpc_set_inbox_settings(int, int, int, int, text[]) to authenticated;

commit;
