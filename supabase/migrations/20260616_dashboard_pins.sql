-- Rabih Ops — dashboard_pins column + RPC
-- =====================================================================
-- Adds a per-user JSONB column for pinned dashboard section keys.
-- Pinned sections bubble to the top of the compact-lists area on the
-- dashboard. The array stores string keys; order is insertion order.
--
-- Idempotent: ALTER TABLE … IF NOT EXISTS, CREATE OR REPLACE FUNCTION.

begin;

-- 1. Add the column
alter table public.users
  add column if not exists dashboard_pins jsonb not null default '[]'::jsonb;

comment on column public.users.dashboard_pins is
  'Array of pinned dashboard section keys. Order = display order of pinned sections. Managed via rpc_set_dashboard_pins.';

-- 2. RPC to write the pins (SECURITY DEFINER — no direct table writes)
create or replace function public.rpc_set_dashboard_pins(
  p_pins jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := public._require_auth();
  v_allowed text[] := array[
    'calendar',
    'pending_emails',
    'today_emails',
    'important_emails',
    'overdue',
    'today',
    'follow_ups_today',
    'waiting',
    'critical_findings',
    'purchases',
    'reminders'
  ];
  v_clean   jsonb := '[]'::jsonb;
  v_key     text;
  v_seen    text[] := '{}';
  v_result  jsonb;
begin
  -- Validate: must be a JSON array of strings, filter to allowed keys, deduplicate
  if jsonb_typeof(p_pins) <> 'array' then
    raise exception 'p_pins must be a JSON array' using errcode = '22023';
  end if;

  for i in 0 .. jsonb_array_length(p_pins) - 1 loop
    v_key := p_pins ->> i;
    if v_key is not null
       and v_key = any(v_allowed)
       and not (v_key = any(v_seen))
    then
      v_clean := v_clean || to_jsonb(v_key);
      v_seen := array_append(v_seen, v_key);
    end if;
  end loop;

  update users
     set dashboard_pins = v_clean,
         updated_at     = now()
   where id = v_uid;

  -- Audit
  insert into audit_log (user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'dashboard_pins_updated', 'user', v_uid, v_clean, 'web');

  select row_to_json(u.*) into v_result
    from users u
   where u.id = v_uid;

  return v_result;
end;
$$;

comment on function public.rpc_set_dashboard_pins(jsonb) is
  'Sets the dashboard pinned-section keys for the calling user. Validates keys against an allowlist, deduplicates, and persists. Returns the updated user row.';

grant execute on function public.rpc_set_dashboard_pins(jsonb) to authenticated;

commit;
