-- Rabih Ops — Harden rpc_update_recurring_template against JSON-null
-- recurrence_dow.
--
-- Pre-fix bug: when a non-weekly cadence (daily / monthly / yearly) was
-- edited, the frontend sent `recurrence_dow: null` in the patch jsonb.
-- The RPC's `p_updates ? 'recurrence_dow'` check returned true (the
-- key was present even though the value was JSON null), then
-- jsonb_array_elements_text(p_updates->'recurrence_dow') raised
-- 22023: 'cannot extract elements from a scalar'. PostgREST surfaced
-- that as a 400 to the browser.
--
-- recurrence_dom and recurrence_month already handled JSON null safely
-- because they used `->>` (text extraction → SQL NULL via nullif).
-- This migration brings recurrence_dow to the same standard so:
--   * a JSON null clears the field (assigns SQL NULL) — consistent with
--     the dom/month behaviour and consistent with the column's CHECK
--     constraint (recurrence_dow IS NULL is allowed)
--   * a JSON array is parsed as before (each element → int → array)
--   * an absent key leaves the column untouched (no change)
--
-- CREATE OR REPLACE only. No schema change. Same signature.
-- Idempotent: re-running is a no-op once the body is in place.

begin;

create or replace function public.rpc_update_recurring_template(
  p_template_id uuid,
  p_updates     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
  v_recurrence_changed boolean;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot edit recurring templates' using errcode = '42501';
  end if;

  select * into v_before
    from tasks
   where id = p_template_id
     and is_template = true
     and deleted_at is null;
  if v_before is null then
    raise exception 'recurring template % not found', p_template_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  v_recurrence_changed :=
       (p_updates ? 'recurrence')
    or (p_updates ? 'recurrence_dow')
    or (p_updates ? 'recurrence_dom')
    or (p_updates ? 'recurrence_month')
    or (p_updates ? 'recurrence_time');

  update tasks
     set title          = coalesce(p_updates->>'title',        title),
         description    = coalesce(p_updates->>'description',  description),
         branch         = coalesce(p_updates->>'branch',       branch),
         category       = coalesce(p_updates->>'category',     category),
         priority       = coalesce(p_updates->>'priority',     priority),
         assigned_to    = case when p_updates ? 'assigned_to'
                               then nullif(p_updates->>'assigned_to','')::uuid
                               else assigned_to end,
         recurrence     = case when p_updates ? 'recurrence'
                               then nullif(p_updates->>'recurrence','')
                               else recurrence end,
         -- recurrence_dow: tolerate JSON null + non-array shapes by
         -- gating jsonb_array_elements_text behind a typeof('array')
         -- check. JSON null → SQL NULL (clears the field, matching
         -- the dom/month branches above).
         recurrence_dow = case
                            when not (p_updates ? 'recurrence_dow')
                              then recurrence_dow
                            when jsonb_typeof(p_updates->'recurrence_dow') = 'array'
                              then (
                                select array_agg(x::int)
                                  from jsonb_array_elements_text(p_updates->'recurrence_dow') as x
                              )
                            else null
                          end,
         recurrence_dom = case when p_updates ? 'recurrence_dom'
                               then nullif(p_updates->>'recurrence_dom','')::int
                               else recurrence_dom end,
         recurrence_month = case when p_updates ? 'recurrence_month'
                                 then nullif(p_updates->>'recurrence_month','')::int
                                 else recurrence_month end,
         recurrence_time = case when p_updates ? 'recurrence_time'
                                then nullif(p_updates->>'recurrence_time','')::time
                                else recurrence_time end
   where id = p_template_id
  returning * into v_after;

  -- If recurrence changed, recompute next_spawn_at against the NEW values.
  if v_recurrence_changed then
    update tasks
       set next_spawn_at = public._next_spawn_at(
             v_after.recurrence,
             v_after.recurrence_dow,
             v_after.recurrence_dom,
             v_after.recurrence_month,
             v_after.recurrence_time
           )
     where id = p_template_id
    returning * into v_after;
  end if;

  perform public._audit('update','task', p_template_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_update_recurring_template(uuid, jsonb) is
  'Patches a recurring template. Allowed keys: title/description/branch/category/priority/assigned_to/recurrence/recurrence_dow/recurrence_dom/recurrence_month/recurrence_time. Recurrence_dow accepts an array or JSON null (clears it); a missing key leaves the column untouched. Recomputes next_spawn_at when any recurrence field changes.';

grant execute on function public.rpc_update_recurring_template(uuid, jsonb) to authenticated;

commit;
