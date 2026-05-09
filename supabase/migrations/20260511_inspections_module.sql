-- Rabih Ops — Inspections module
-- No new tables. The inspections + inspection_findings tables already exist
-- (deployed in 20260421_initial_schema.sql) with the full set of fields the
-- spec needs. _can_access_entity already includes the 'inspection' branch
-- (deployed in 20260508_shared_comments_attachments.sql).
--
-- Scope of this migration:
--   1. _can_admin_inspect() helper — admin/ceo only gate
--   2. Tighten existing RPCs that were missing role gates:
--        rpc_create_inspection         → admin/ceo only
--        rpc_complete_inspection       → admin/ceo only (was: no gate)
--        rpc_add_inspection_finding    → admin/ceo only (was: no gate)
--        rpc_resolve_finding           → manager+   only (was: no gate)
--   3. New RPCs:
--        rpc_update_inspection         → admin/ceo (jsonb-patch)
--        rpc_list_inspections          → authenticated, filtered
--        rpc_get_inspection            → authenticated; returns inspection +
--                                         findings (inline) + comments +
--                                         attachments + audit
--        rpc_update_finding            → admin/ceo (jsonb-patch)
--        rpc_list_critical_findings    → authenticated; dashboard tile feed
--        rpc_add_inspection_comment    → wrapper over _add_comment
--        rpc_delete_inspection_comment → wrapper over _delete_comment
--        rpc_attach_file_to_inspection → wrapper over _add_attachment
--        rpc_remove_inspection_attachment → wrapper over _remove_attachment
--
-- Deliberately omitted: rpc_delete_finding. Findings are accountability
-- records. Errors are corrected via rpc_update_finding (audited). Resolution
-- happens via rpc_resolve_finding (audited). No path destroys history.

begin;

-- =========================================================
-- 1. Admin-only helper
-- =========================================================

create or replace function public._can_admin_inspect()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin','ceo')
$$;

comment on function public._can_admin_inspect() is
  'True for admin or ceo. Used to gate inspection create / update / complete and finding add / update.';

-- =========================================================
-- 2. Existing RPC role-gate tightening
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
  if not public._can_admin_inspect() then
    raise exception 'only admin or ceo can create inspections' using errcode = '42501';
  end if;
  perform public._require_branch_access(p_branch);

  insert into inspections(branch, area, inspection_date, general_notes, inspected_by)
  values (p_branch, p_area, p_date, p_general_notes, v_uid)
  returning * into v_row;

  perform public._audit('create','inspection', v_row.id, null, to_jsonb(v_row));
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
  if not public._can_admin_inspect() then
    raise exception 'only admin or ceo can complete inspections' using errcode = '42501';
  end if;
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
  if not public._can_admin_inspect() then
    raise exception 'only admin or ceo can add findings' using errcode = '42501';
  end if;
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
  if not public._can_mutate() then
    raise exception 'role cannot resolve findings' using errcode = '42501';
  end if;
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
-- 3. rpc_update_inspection (NEW)
-- =========================================================

create or replace function public.rpc_update_inspection(
  p_inspection_id uuid,
  p_updates       jsonb
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
  if not public._can_admin_inspect() then
    raise exception 'only admin or ceo can update inspections' using errcode = '42501';
  end if;

  select * into v_before from inspections where id = p_inspection_id and deleted_at is null;
  if v_before is null then
    raise exception 'inspection % not found', p_inspection_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_before.branch);
  if (p_updates ? 'branch') and (p_updates->>'branch') is not null
     and p_updates->>'branch' <> v_before.branch then
    perform public._require_branch_access(p_updates->>'branch');
  end if;

  update inspections
     set branch          = coalesce(p_updates->>'branch',          branch),
         area            = coalesce(p_updates->>'area',            area),
         inspection_date = case when p_updates ? 'inspection_date'
                                 then nullif(p_updates->>'inspection_date','')::date
                                 else inspection_date end,
         general_notes   = coalesce(p_updates->>'general_notes',   general_notes),
         result          = coalesce(p_updates->>'result',          result)
   where id = p_inspection_id
  returning * into v_after;

  perform public._audit('update','inspection', p_inspection_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_update_inspection(uuid, jsonb) is
  'Patches an inspection with a jsonb of updates. Admin/CEO only. result and date are most commonly mutated; branch change re-checks access.';

-- =========================================================
-- 4. rpc_list_inspections (NEW)
-- =========================================================

create or replace function public.rpc_list_inspections(
  p_branch        text default null,
  p_result        text default null,
  p_area          text default null,
  p_inspected_by  uuid default null,
  p_date_before   date default null,
  p_date_after    date default null,
  p_search        text default null,
  p_limit         int  default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public._require_auth();
  if p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  select coalesce(jsonb_agg(i order by i.inspection_date desc, i.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select ii.*, u.full_name as inspector_name,
           (select count(*)::int
              from inspection_findings fr
             where fr.inspection_id = ii.id
               and fr.severity = 'critical'
               and fr.status not in ('resolved')) as open_critical_count,
           (select count(*)::int
              from inspection_findings fr
             where fr.inspection_id = ii.id
               and fr.status not in ('resolved')) as open_finding_count
      from inspections ii
      join users u on u.id = ii.inspected_by
     where ii.deleted_at is null
       and public.current_user_can_access_branch(ii.branch)
       and (p_branch       is null or ii.branch          = p_branch)
       and (p_result       is null or ii.result          = p_result)
       and (p_area         is null or ii.area            = p_area)
       and (p_inspected_by is null or ii.inspected_by    = p_inspected_by)
       and (p_date_before  is null or ii.inspection_date <= p_date_before)
       and (p_date_after   is null or ii.inspection_date >= p_date_after)
       and (p_search is null
            or coalesce(ii.general_notes,'') ilike '%' || p_search || '%')
     limit greatest(coalesce(p_limit, 100), 1)
  ) i;

  return v_result;
end;
$$;

comment on function public.rpc_list_inspections(text,text,text,uuid,date,date,text,int) is
  'Filtered jsonb array of inspections the caller can access. Each row is augmented with inspector_name, open_critical_count, open_finding_count for list-view density.';

-- =========================================================
-- 5. rpc_get_inspection (NEW)
-- =========================================================

create or replace function public.rpc_get_inspection(
  p_inspection_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inspection    inspections;
  v_inspector     text;
  v_findings      jsonb;
  v_comments      jsonb;
  v_attachments   jsonb;
  v_audit         jsonb;
begin
  perform public._require_auth();

  select * into v_inspection from inspections where id = p_inspection_id and deleted_at is null;
  if v_inspection is null then
    raise exception 'inspection % not found', p_inspection_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_inspection.branch);

  select full_name into v_inspector from users where id = v_inspection.inspected_by;

  -- Findings inline. Surface severity tone first, then created order.
  select coalesce(jsonb_agg(f order by
            (case f.severity when 'critical' then 0 when 'major' then 1 else 2 end),
            f.created_at asc
          ), '[]'::jsonb)
    into v_findings
  from inspection_findings f
  where f.inspection_id = p_inspection_id;

  select coalesce(jsonb_agg(c order by c.created_at asc), '[]'::jsonb)
    into v_comments
  from (
    select cc.*, u.full_name as author_name
      from comments cc
      join users u on u.id = cc.author_id
     where cc.entity_type = 'inspection'
       and cc.entity_id = p_inspection_id
       and cc.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
    into v_attachments
  from (
    select aa.*, u.full_name as uploader_name
      from attachments aa
      join users u on u.id = aa.uploaded_by
     where aa.entity_type = 'inspection'
       and aa.entity_id = p_inspection_id
  ) a;

  select coalesce(jsonb_agg(al order by al.created_at desc), '[]'::jsonb)
    into v_audit
  from (
    select l.id, l.action, l.entity_type, l.entity_id, l.before_state, l.after_state,
           l.created_at, l.user_id,
           coalesce(u.full_name, 'system') as user_name
      from audit_log l
      left join users u on u.id = l.user_id
     where (l.entity_type = 'inspection' and l.entity_id = p_inspection_id)
        or (l.entity_type = 'inspection_finding'
            and l.entity_id in (select id from inspection_findings
                                where inspection_id = p_inspection_id))
     order by l.created_at desc
     limit 50
  ) al;

  return jsonb_build_object(
    'inspection', to_jsonb(v_inspection) || jsonb_build_object('inspector_name', v_inspector),
    'findings',   v_findings,
    'comments',   v_comments,
    'attachments',v_attachments,
    'audit',      v_audit
  );
end;
$$;

comment on function public.rpc_get_inspection(uuid) is
  'Returns an inspection with inline findings + shared comments / attachments + audit (covering both the inspection and its findings).';

-- =========================================================
-- 6. rpc_update_finding (NEW)
-- =========================================================

create or replace function public.rpc_update_finding(
  p_finding_id uuid,
  p_updates    jsonb
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
  if not public._can_admin_inspect() then
    raise exception 'only admin or ceo can edit findings' using errcode = '42501';
  end if;

  select * into v_before from inspection_findings where id = p_finding_id;
  if v_before is null then
    raise exception 'finding % not found', p_finding_id using errcode = 'P0002';
  end if;
  select * into v_insp from inspections where id = v_before.inspection_id and deleted_at is null;
  if v_insp is null then
    raise exception 'parent inspection of % not found', p_finding_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_insp.branch);

  update inspection_findings
     set severity        = coalesce(p_updates->>'severity',        severity),
         description     = coalesce(p_updates->>'description',     description),
         action_required = coalesce(p_updates->>'action_required', action_required),
         responsible     = coalesce(p_updates->>'responsible',     responsible),
         follow_up_date  = case when p_updates ? 'follow_up_date'
                                 then nullif(p_updates->>'follow_up_date','')::date
                                 else follow_up_date end,
         status          = coalesce(p_updates->>'status',          status)
   where id = p_finding_id
  returning * into v_after;

  perform public._audit('update','inspection_finding', p_finding_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_update_finding(uuid, jsonb) is
  'Patches a finding (description, severity, action_required, responsible, follow_up_date, status). Admin/CEO only. No hard-delete path exists by design — findings are accountability records and every change is audited.';

-- =========================================================
-- 7. rpc_list_critical_findings (NEW)
-- =========================================================

create or replace function public.rpc_list_critical_findings(
  p_limit int default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public._require_auth();

  select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select fr.id,
           fr.inspection_id,
           fr.severity,
           fr.description,
           fr.action_required,
           fr.responsible,
           fr.follow_up_date,
           fr.status,
           fr.created_at,
           i.branch          as inspection_branch,
           i.area            as inspection_area,
           i.inspection_date as inspection_date
      from inspection_findings fr
      join inspections i on i.id = fr.inspection_id
     where fr.severity = 'critical'
       and fr.status <> 'resolved'
       and i.deleted_at is null
       and public.current_user_can_access_branch(i.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) f;

  return v_result;
end;
$$;

comment on function public.rpc_list_critical_findings(int) is
  'Open critical findings (severity=critical, status <> resolved) across inspections the caller can see. Each row carries parent inspection branch / area / date for the dashboard tile.';

-- =========================================================
-- 8. Comment + attachment wrappers for inspection entity
-- =========================================================

create or replace function public.rpc_add_inspection_comment(
  p_inspection_id uuid,
  p_body          text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspection inspections;
begin
  perform public._require_auth();
  select * into v_inspection from inspections where id = p_inspection_id and deleted_at is null;
  if v_inspection is null then
    raise exception 'inspection % not found', p_inspection_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_inspection.branch);
  return public._add_comment('inspection', p_inspection_id, p_body);
end;
$$;

create or replace function public.rpc_delete_inspection_comment(
  p_comment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment    comments;
  v_inspection inspections;
begin
  perform public._require_auth();
  select * into v_comment
    from comments
   where id = p_comment_id and entity_type = 'inspection' and deleted_at is null;
  if v_comment is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  select * into v_inspection
    from inspections where id = v_comment.entity_id and deleted_at is null;
  perform public._require_branch_access(v_inspection.branch);
  return public._delete_comment(p_comment_id);
end;
$$;

create or replace function public.rpc_attach_file_to_inspection(
  p_inspection_id uuid,
  p_storage_path  text,
  p_file_name     text,
  p_mime_type     text,
  p_file_size     int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspection inspections;
begin
  perform public._require_auth();
  select * into v_inspection from inspections where id = p_inspection_id and deleted_at is null;
  if v_inspection is null then
    raise exception 'inspection % not found', p_inspection_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_inspection.branch);
  return public._add_attachment(
    'inspection', p_inspection_id, p_storage_path, p_file_name, p_mime_type, p_file_size
  );
end;
$$;

create or replace function public.rpc_remove_inspection_attachment(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment attachments;
  v_inspection inspections;
begin
  perform public._require_auth();
  select * into v_attachment
    from attachments
   where id = p_attachment_id and entity_type = 'inspection';
  if v_attachment is null then
    raise exception 'attachment % not found', p_attachment_id using errcode = 'P0002';
  end if;
  select * into v_inspection
    from inspections where id = v_attachment.entity_id and deleted_at is null;
  perform public._require_branch_access(v_inspection.branch);
  return public._remove_attachment(p_attachment_id);
end;
$$;

-- =========================================================
-- 9. Grants
-- =========================================================

grant execute on function public.rpc_update_inspection(uuid, jsonb)                                       to authenticated;
grant execute on function public.rpc_list_inspections(text,text,text,uuid,date,date,text,int)             to authenticated;
grant execute on function public.rpc_get_inspection(uuid)                                                  to authenticated;
grant execute on function public.rpc_update_finding(uuid, jsonb)                                          to authenticated;
grant execute on function public.rpc_list_critical_findings(int)                                          to authenticated;
grant execute on function public.rpc_add_inspection_comment(uuid, text)                                   to authenticated;
grant execute on function public.rpc_delete_inspection_comment(uuid)                                      to authenticated;
grant execute on function public.rpc_attach_file_to_inspection(uuid, text, text, text, int)               to authenticated;
grant execute on function public.rpc_remove_inspection_attachment(uuid)                                   to authenticated;
-- rpc_create_inspection / rpc_complete_inspection / rpc_add_inspection_finding / rpc_resolve_finding
-- keep their existing grants from 20260421_rpcs.sql; signatures are unchanged.

commit;
