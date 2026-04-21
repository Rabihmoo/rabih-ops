-- Rabih Ops V1 — RPCs
-- Mirrors Part 8 of PLAN.md. 12 SECURITY DEFINER RPCs:
--   rpc_create_task, rpc_update_task, rpc_complete_task, rpc_delete_task
--   rpc_create_follow_up, rpc_mark_follow_up_done, rpc_snooze_follow_up
--   rpc_create_inspection, rpc_add_inspection_finding, rpc_complete_inspection, rpc_resolve_finding
--   rpc_get_user_dashboard
--   rpc_process_whatsapp_command
--
-- Rules (Part 2 of PLAN.md):
--   - Every mutation goes through a SECURITY DEFINER RPC (no direct table writes from JS)
--   - Permissions enforced inside each RPC via current_user_can_access_branch()
--   - Every mutation writes to audit_log
--   - Every RPC returns final state (jsonb row) so the caller can verify

begin;

-- =========================================================
-- Internal helpers
-- =========================================================

create or replace function public._audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_source text default 'web'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log(user_id, action, entity_type, entity_id, before_state, after_state, source)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_source);
end;
$$;

comment on function public._audit(text, text, uuid, jsonb, jsonb, text) is
  'Internal helper used by every mutation RPC to write the audit_log row.';

create or replace function public._require_auth()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public._require_branch_access(p_branch text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_can_access_branch(p_branch) then
    raise exception 'access denied to branch %', p_branch using errcode = '42501';
  end if;
end;
$$;

create or replace function public._can_mutate()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin','ceo','manager')
$$;

-- =========================================================
-- TASKS
-- =========================================================

create or replace function public.rpc_create_task(
  p_branch       text,
  p_category     text,
  p_title        text,
  p_priority     text default 'normal',
  p_due_date     date default null,
  p_assigned_to  uuid default null,
  p_description  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_id  uuid;
  v_row tasks;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create tasks' using errcode = '42501';
  end if;
  perform public._require_branch_access(p_branch);

  insert into tasks(title, description, branch, category, priority, due_date, assigned_to, created_by)
  values (p_title, p_description, p_branch, p_category, coalesce(p_priority,'normal'), p_due_date, p_assigned_to, v_uid)
  returning * into v_row;

  perform public._audit('create','task', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_create_task(text,text,text,text,date,uuid,text) is
  'Creates a task. Returns the inserted row as jsonb. Audit: action=create entity_type=task.';

create or replace function public.rpc_update_task(
  p_task_id uuid,
  p_updates jsonb
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
    raise exception 'role cannot update tasks' using errcode = '42501';
  end if;

  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set title         = coalesce(p_updates->>'title',        title),
         description   = coalesce(p_updates->>'description',  description),
         branch        = coalesce(p_updates->>'branch',       branch),
         category      = coalesce(p_updates->>'category',     category),
         priority      = coalesce(p_updates->>'priority',     priority),
         status        = coalesce(p_updates->>'status',       status),
         due_date      = case when p_updates ? 'due_date'
                              then nullif(p_updates->>'due_date','')::date
                              else due_date end,
         assigned_to   = case when p_updates ? 'assigned_to'
                              then nullif(p_updates->>'assigned_to','')::uuid
                              else assigned_to end
   where id = p_task_id
  returning * into v_after;

  perform public._audit('update','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_update_task(uuid, jsonb) is
  'Patches a task with a jsonb of updates. Returns the row after update.';

create or replace function public.rpc_complete_task(
  p_task_id         uuid,
  p_completion_note text default null
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
  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks
     set status          = 'done',
         completed_at    = now(),
         completion_note = p_completion_note
   where id = p_task_id
  returning * into v_after;

  perform public._audit('complete','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_delete_task(
  p_task_id uuid
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
    raise exception 'role cannot delete tasks' using errcode = '42501';
  end if;
  select * into v_before from tasks where id = p_task_id and deleted_at is null;
  if v_before is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update tasks set deleted_at = now() where id = p_task_id
  returning * into v_after;

  perform public._audit('delete','task', p_task_id, to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', p_task_id);
end;
$$;

-- =========================================================
-- FOLLOW-UPS
-- =========================================================

create or replace function public.rpc_create_follow_up(
  p_person    text,
  p_branch    text,
  p_category  text,
  p_title     text,
  p_due_date  date,
  p_priority  text default 'normal',
  p_notes     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row follow_ups;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create follow-ups' using errcode = '42501';
  end if;
  if p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  insert into follow_ups(title, person, branch, category, due_date, priority, notes, created_by)
  values (p_title, p_person, p_branch, p_category, p_due_date, coalesce(p_priority,'normal'), p_notes, v_uid)
  returning * into v_row;

  perform public._audit('create','follow_up', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.rpc_mark_follow_up_done(
  p_follow_up_id uuid,
  p_outcome      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before follow_ups;
  v_after  follow_ups;
begin
  perform public._require_auth();
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set status       = 'done',
         outcome      = p_outcome,
         completed_at = now()
   where id = p_follow_up_id
  returning * into v_after;

  perform public._audit('complete','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_snooze_follow_up(
  p_follow_up_id uuid,
  p_new_due_date date,
  p_reason       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before follow_ups;
  v_after  follow_ups;
begin
  perform public._require_auth();
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set due_date = p_new_due_date,
         status   = 'snoozed',
         notes    = coalesce(notes,'') ||
                    case when p_reason is not null
                         then E'\n[snoozed ' || to_char(now(),'YYYY-MM-DD') || '] ' || p_reason
                         else '' end
   where id = p_follow_up_id
  returning * into v_after;

  perform public._audit('snooze','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

-- =========================================================
-- INSPECTIONS + FINDINGS
-- =========================================================

create or replace function public.rpc_create_inspection(
  p_branch         text,
  p_area           text,
  p_date           date,
  p_general_notes  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row inspections;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create inspections' using errcode = '42501';
  end if;
  perform public._require_branch_access(p_branch);

  insert into inspections(branch, area, inspection_date, general_notes, inspected_by)
  values (p_branch, p_area, p_date, p_general_notes, v_uid)
  returning * into v_row;

  perform public._audit('create','inspection', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.rpc_add_inspection_finding(
  p_inspection_id   uuid,
  p_severity        text,
  p_description     text,
  p_action_required text default null,
  p_responsible     text default null,
  p_follow_up_date  date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insp inspections;
  v_row  inspection_findings;
begin
  perform public._require_auth();
  select * into v_insp from inspections where id = p_inspection_id and deleted_at is null;
  if v_insp is null then
    raise exception 'inspection % not found', p_inspection_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_insp.branch);

  insert into inspection_findings(inspection_id, severity, description, action_required, responsible, follow_up_date)
  values (p_inspection_id, p_severity, p_description, p_action_required, p_responsible, p_follow_up_date)
  returning * into v_row;

  perform public._audit('create','inspection_finding', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.rpc_complete_inspection(
  p_inspection_id uuid,
  p_result        text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before inspections;
  v_after  inspections;
begin
  perform public._require_auth();
  select * into v_before from inspections where id = p_inspection_id and deleted_at is null;
  if v_before is null then
    raise exception 'inspection % not found', p_inspection_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);

  update inspections set result = p_result where id = p_inspection_id
  returning * into v_after;

  perform public._audit('complete','inspection', p_inspection_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.rpc_resolve_finding(
  p_finding_id      uuid,
  p_resolution_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before inspection_findings;
  v_after  inspection_findings;
  v_insp   inspections;
begin
  perform public._require_auth();
  select * into v_before from inspection_findings where id = p_finding_id;
  if v_before is null then
    raise exception 'finding % not found', p_finding_id using errcode = 'P0002';
  end if;
  select * into v_insp from inspections where id = v_before.inspection_id;
  perform public._require_branch_access(v_insp.branch);

  update inspection_findings
     set status          = 'resolved',
         resolved_at     = now(),
         resolution_note = p_resolution_note
   where id = p_finding_id
  returning * into v_after;

  perform public._audit('resolve','inspection_finding', p_finding_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

-- =========================================================
-- DASHBOARD
-- =========================================================

create or replace function public.rpc_get_user_dashboard(
  p_user_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, public._require_auth());
  v_today date := current_date;
  v_priorities jsonb;
  v_overdue    jsonb;
  v_assigned   jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.due_date, t.priority), '[]'::jsonb)
    into v_priorities
  from (
    select *
      from tasks
     where deleted_at is null
       and status <> 'done'
       and (priority = 'urgent' or due_date = v_today)
       and public.current_user_can_access_branch(branch)
     limit 50
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.due_date), '[]'::jsonb)
    into v_overdue
  from (
    select *
      from tasks
     where deleted_at is null
       and status not in ('done','cancelled')
       and due_date < v_today
       and public.current_user_can_access_branch(branch)
     limit 50
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.priority, t.due_date), '[]'::jsonb)
    into v_assigned
  from (
    select *
      from tasks
     where deleted_at is null
       and status <> 'done'
       and assigned_to = v_uid
     limit 100
  ) t;

  return jsonb_build_object(
    'user_id', v_uid,
    'date', v_today,
    'priorities', v_priorities,
    'overdue', v_overdue,
    'assigned', v_assigned
  );
end;
$$;

comment on function public.rpc_get_user_dashboard(uuid) is
  'Returns today''s priorities, overdue items and items assigned to the given user, filtered by branch access.';

-- =========================================================
-- WHATSAPP (placeholder — full parser ships in Phase 5)
-- =========================================================

create or replace function public.rpc_process_whatsapp_command(
  p_phone   text,
  p_command text,
  p_params  jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user users;
  v_response text;
begin
  -- Phase 5 will flesh this out. For now we log and echo.
  select * into v_user from users where phone = p_phone limit 1;

  insert into whatsapp_messages(phone, direction, message_text, parsed_command, parsed_params)
  values (p_phone, 'inbound', coalesce(p_params->>'raw',''), p_command, p_params);

  v_response := case
    when v_user is null then '❌ Phone not registered. Contact admin.'
    when p_command = 'today' then '📋 Today''s view is not implemented yet.'
    else '✅ Received: ' || p_command
  end;

  insert into whatsapp_messages(phone, direction, message_text, response_text)
  values (p_phone, 'outbound', v_response, v_response);

  return v_response;
end;
$$;

-- =========================================================
-- User bootstrap (called from client after first login)
-- =========================================================

create or replace function public.rpc_bootstrap_user(
  p_full_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_email text;
  v_row users;
begin
  select email into v_email from auth.users where id = v_uid;

  insert into users(id, email, full_name, role, branches)
  values (v_uid, v_email, coalesce(p_full_name, split_part(v_email,'@',1)), 'viewer', '{}')
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, users.full_name)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_bootstrap_user(text) is
  'Idempotent: creates a public.users row for the authenticated user on first login. New users default to viewer/no branches — admin promotes manually.';

-- =========================================================
-- Grants
-- =========================================================

grant execute on function public.rpc_create_task(text,text,text,text,date,uuid,text)   to authenticated;
grant execute on function public.rpc_update_task(uuid, jsonb)                          to authenticated;
grant execute on function public.rpc_complete_task(uuid, text)                         to authenticated;
grant execute on function public.rpc_delete_task(uuid)                                 to authenticated;
grant execute on function public.rpc_create_follow_up(text,text,text,text,date,text,text) to authenticated;
grant execute on function public.rpc_mark_follow_up_done(uuid, text)                   to authenticated;
grant execute on function public.rpc_snooze_follow_up(uuid, date, text)                to authenticated;
grant execute on function public.rpc_create_inspection(text, text, date, text)         to authenticated;
grant execute on function public.rpc_add_inspection_finding(uuid, text, text, text, text, date) to authenticated;
grant execute on function public.rpc_complete_inspection(uuid, text)                   to authenticated;
grant execute on function public.rpc_resolve_finding(uuid, text)                       to authenticated;
grant execute on function public.rpc_get_user_dashboard(uuid)                          to authenticated;
grant execute on function public.rpc_bootstrap_user(text)                              to authenticated;
-- rpc_process_whatsapp_command is called server-side only (service role).

commit;
