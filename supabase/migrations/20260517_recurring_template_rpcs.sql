-- Rabih Ops — Recurring template management RPCs
-- =====================================================================
-- Three new RPCs and one spawner tweak, no schema changes.
--
--   * rpc_update_recurring_template      — patches a template + recomputes next_spawn_at
--   * rpc_archive_recurring_template     — status='archived' AND next_spawn_at=null
--   * rpc_unarchive_recurring_template   — status='not_started' + recomputes next_spawn_at
--   * _spawn_due_recurring               — also exclude status='archived' (belt+suspenders)

begin;

-- =========================================================
-- 1. rpc_update_recurring_template
-- =========================================================

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
         recurrence_dow = case when p_updates ? 'recurrence_dow'
                               then (
                                 select array_agg(x::int)
                                   from jsonb_array_elements_text(p_updates->'recurrence_dow') as x
                               )
                               else recurrence_dow end,
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
  'Patches a recurring template. Allowed keys: title/description/branch/category/priority/assigned_to/recurrence/recurrence_dow/recurrence_dom/recurrence_month/recurrence_time. Recomputes next_spawn_at when any recurrence field changes.';

grant execute on function public.rpc_update_recurring_template(uuid, jsonb) to authenticated;

-- =========================================================
-- 2. rpc_archive_recurring_template
-- =========================================================

create or replace function public.rpc_archive_recurring_template(
  p_template_id uuid,
  p_reason      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot archive recurring templates' using errcode = '42501';
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

  update tasks
     set status        = 'archived',
         next_spawn_at = null
   where id = p_template_id
  returning * into v_after;

  perform public._audit('archive','task', p_template_id, to_jsonb(v_before),
    to_jsonb(v_after) || coalesce(jsonb_build_object('reason', nullif(btrim(p_reason), '')), '{}'::jsonb));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_archive_recurring_template(uuid, text) is
  'Archives a template: sets status=archived AND clears next_spawn_at so the cron skips it. Reason captured in audit only.';

grant execute on function public.rpc_archive_recurring_template(uuid, text) to authenticated;

-- =========================================================
-- 3. rpc_unarchive_recurring_template
-- =========================================================

create or replace function public.rpc_unarchive_recurring_template(
  p_template_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot unarchive recurring templates' using errcode = '42501';
  end if;

  select * into v_before
    from tasks
   where id = p_template_id
     and is_template = true
     and deleted_at is null;
  if v_before is null then
    raise exception 'recurring template % not found', p_template_id using errcode = 'P0002';
  end if;
  if v_before.status <> 'archived' then
    raise exception 'template % is not archived (status=%)', p_template_id, v_before.status
      using errcode = '22023';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status        = 'not_started',
         next_spawn_at = public._next_spawn_at(
           recurrence, recurrence_dow, recurrence_dom, recurrence_month, recurrence_time
         )
   where id = p_template_id
  returning * into v_after;

  perform public._audit('update','task', p_template_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_unarchive_recurring_template(uuid) is
  'Re-enables an archived template: status=not_started + recomputes next_spawn_at from the recurrence fields.';

grant execute on function public.rpc_unarchive_recurring_template(uuid) to authenticated;

-- =========================================================
-- 4. _spawn_due_recurring — exclude archived templates (belt+suspenders)
-- =========================================================

create or replace function public._spawn_due_recurring()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template tasks;
  v_instance tasks;
  v_target   date;
  v_count    int := 0;
begin
  for v_template in
    select * from tasks
     where is_template   = true
       and deleted_at    is null
       and status        not in ('archived')
       and next_spawn_at is not null
       and next_spawn_at <= now()
     order by next_spawn_at asc
     limit 50
  loop
    v_target := (v_template.next_spawn_at at time zone 'Africa/Maputo')::date;

    insert into tasks(
      title, description, branch, category, priority, assigned_to, created_by,
      status, due_date, template_id
    ) values (
      v_template.title, v_template.description, v_template.branch, v_template.category,
      v_template.priority, v_template.assigned_to,
      coalesce(v_template.assigned_to, v_template.created_by),
      'not_started', v_target, v_template.id
    )
    returning * into v_instance;

    update tasks
       set next_spawn_at = public._next_spawn_at(
             v_template.recurrence, v_template.recurrence_dow, v_template.recurrence_dom,
             v_template.recurrence_month, v_template.recurrence_time,
             ((v_target + 1)::timestamp) at time zone 'Africa/Maputo'
           )
     where id = v_template.id;

    perform public._audit('recurring_spawn','task', v_instance.id, null,
      jsonb_build_object('template_id', v_template.id, 'target_date', v_target),
      'cron');

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

commit;
