-- Rabih Ops — record-links function restore (drift remediation)
-- =====================================================================
-- Restores the H3.3-widened bodies of three functions that were
-- observed rolled back to their H1 definitions on staging:
--   * public._can_access_entity(text, uuid)
--   * public.rpc_record_link_internal(text, uuid, text, uuid, text)
--   * public.rpc_record_link_external(text, uuid, text, text, text, text, text, jsonb, text)
--
-- Symptoms that triggered this migration:
--   * Playwright `linked-records-add.spec.ts` failing in CI #66 with
--     rpc_record_link_internal returning HTTP 400 (22023 invalid
--     from_entity_type 'note') even though the table CHECK constraint
--     `record_links_from_entity_type_check` was already at the
--     H3.3-widened state including 'note'.
--   * pg_get_functiondef showed the three functions had the H1
--     (task / follow_up / purchase_request / inspection / document)
--     whitelist with no 'company', 'contact', or 'note' arms, while
--     109 record_links rows already existed referencing notes.
--
-- Source of truth for the bodies below is migration
-- 20260530_record_links_widen_note.sql (the H3.3 widen). The CHECK
-- constraint and table-shape sections of that migration are NOT
-- re-applied here because:
--   * The table CHECK is already at H3.3-wide on staging.
--   * Re-running 20260527 / 20260530's drop-then-add-constraint pair
--     via db:push currently fails (23514) because 109 existing rows
--     have entity_type='note', which 20260527's narrower H2.3
--     whitelist would reject. That blocker is orthogonal to this
--     remediation; this migration intentionally stays narrowly
--     scoped to the function bodies so it can ship without
--     untangling the older migration drift.
--
-- Idempotent: CREATE OR REPLACE FUNCTION only. No data writes. No
-- DDL changes. Re-applying is a no-op when the bodies are already
-- at the H3.3 state.

begin;

-- =====================================================================
-- 1. _can_access_entity — strict-personal note + branchless work note
--    + company/contact arms.
-- =====================================================================
-- Verbatim copy of the H3.3 (20260530) body. Delegates note visibility
-- to _note_visible so the strict-personal rule lives in exactly one
-- place. _company_visible / _contact_visible already mirror the SELECT
-- policies on the underlying tables.

create or replace function public._can_access_entity(
  p_entity_type text,
  p_entity_id   uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch text;
  v_found  boolean := false;
begin
  if p_entity_type = 'task' then
    select t.branch into v_branch
      from public.tasks t
     where t.id = p_entity_id and t.deleted_at is null;
    v_found := found;
  elsif p_entity_type = 'follow_up' then
    select f.branch into v_branch
      from public.follow_ups f
     where f.id = p_entity_id and f.deleted_at is null;
    v_found := found;
    if v_found and v_branch is null then
      return true;
    end if;
  elsif p_entity_type = 'inspection' then
    select i.branch into v_branch
      from public.inspections i
     where i.id = p_entity_id and i.deleted_at is null;
    v_found := found;
  elsif p_entity_type = 'purchase_request' then
    select pr.branch into v_branch
      from public.purchase_requests pr
     where pr.id = p_entity_id and pr.deleted_at is null;
    v_found := found;
  elsif p_entity_type = 'document' then
    declare
      v_visibility text;
      v_creator    uuid;
    begin
      select d.branch, d.visibility, d.created_by
        into v_branch, v_visibility, v_creator
        from public.documents d
       where d.id = p_entity_id and d.deleted_at is null;
      if not found then return false; end if;
      if v_visibility = 'personal' then
        return v_creator = auth.uid();
      end if;
      if v_branch is null then return true; end if;
      return public.current_user_can_access_branch(v_branch);
    end;
  elsif p_entity_type = 'company' then
    return public._company_visible(p_entity_id);
  elsif p_entity_type = 'contact' then
    return public._contact_visible(p_entity_id);
  elsif p_entity_type = 'note' then
    -- _note_visible enforces strict personal-creator-only AND the
    -- work + null-branch admin/CEO-only rule. Mirrors notes_select_visible
    -- exactly; lives in 20260528_notes_and_modules.sql.
    return public._note_visible(p_entity_id);
  else
    return false;
  end if;

  if not v_found then return false; end if;
  if v_branch is null then return false; end if;
  return public.current_user_can_access_branch(v_branch);
end;
$$;

comment on function public._can_access_entity(text,uuid) is
  'Returns true when the calling user can SEE the given entity. Used by record_links RLS + rpc_record_relations. Strict for personal notes and personal documents: creator-only, no admin/CEO bypass.';

-- =====================================================================
-- 2. rpc_record_link_internal — H3.3-wide whitelist
-- =====================================================================

create or replace function public.rpc_record_link_internal(
  p_from_type    text,
  p_from_id      uuid,
  p_to_type      text,
  p_to_id        uuid,
  p_relationship text default 'relates_to'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row record_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot link records' using errcode = '42501';
  end if;
  if p_from_type not in (
    'task','follow_up','purchase_request','inspection','document',
    'company','contact','note'
  ) then
    raise exception 'invalid from_entity_type %', p_from_type using errcode = '22023';
  end if;
  if p_to_type not in (
    'task','follow_up','purchase_request','inspection','document',
    'company','contact','note'
  ) then
    raise exception 'invalid to_entity_type %', p_to_type using errcode = '22023';
  end if;
  if p_from_type = p_to_type and p_from_id = p_to_id then
    raise exception 'cannot link an entity to itself' using errcode = '22023';
  end if;
  if not public._can_access_entity(p_from_type, p_from_id) then
    raise exception 'from entity not accessible' using errcode = '42501';
  end if;
  if not public._can_access_entity(p_to_type, p_to_id) then
    raise exception 'to entity not accessible' using errcode = '42501';
  end if;

  select * into v_row
    from record_links
   where from_entity_type = p_from_type and from_entity_id = p_from_id
     and to_entity_type   = p_to_type   and to_entity_id   = p_to_id
     and relationship = p_relationship
     and deleted_at is null
   limit 1;
  if v_row.id is not null then
    return to_jsonb(v_row);
  end if;

  insert into record_links(
    from_entity_type, from_entity_id, to_entity_type, to_entity_id,
    relationship, created_by
  ) values (
    p_from_type, p_from_id, p_to_type, p_to_id,
    p_relationship, v_uid
  ) returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'record_link_created', p_from_type, p_from_id,
          jsonb_build_object(
            'link_id', v_row.id,
            'to_type', p_to_type, 'to_id', p_to_id,
            'relationship', p_relationship
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_record_link_internal(text,uuid,text,uuid,text) to authenticated;

-- =====================================================================
-- 3. rpc_record_link_external — H3.3-wide whitelist
-- =====================================================================

create or replace function public.rpc_record_link_external(
  p_from_type             text,
  p_from_id               uuid,
  p_external_app          text,
  p_external_record_type  text,
  p_external_record_id    text,
  p_external_url          text,
  p_external_label        text,
  p_external_snapshot     jsonb default '{}'::jsonb,
  p_relationship          text default 'relates_to'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row record_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot link records' using errcode = '42501';
  end if;
  if p_from_type not in (
    'task','follow_up','purchase_request','inspection','document',
    'company','contact','note'
  ) then
    raise exception 'invalid from_entity_type %', p_from_type using errcode = '22023';
  end if;
  if p_external_app not in ('gmail','calendar','drive','cater_co','teamlink','salt_reservation','url') then
    raise exception 'invalid external_app %', p_external_app using errcode = '22023';
  end if;
  if p_external_record_id is null or btrim(p_external_record_id) = '' then
    raise exception 'external_record_id is required' using errcode = '22023';
  end if;
  if not public._can_access_entity(p_from_type, p_from_id) then
    raise exception 'from entity not accessible' using errcode = '42501';
  end if;

  select * into v_row
    from record_links
   where from_entity_type = p_from_type and from_entity_id = p_from_id
     and external_app = p_external_app
     and external_record_id = p_external_record_id
     and relationship = p_relationship
     and deleted_at is null
   limit 1;
  if v_row.id is not null then
    return to_jsonb(v_row);
  end if;

  insert into record_links(
    from_entity_type, from_entity_id,
    external_app, external_record_type, external_record_id,
    external_url, external_label, external_snapshot,
    relationship, created_by
  ) values (
    p_from_type, p_from_id,
    p_external_app,
    nullif(btrim(p_external_record_type), ''),
    p_external_record_id,
    nullif(btrim(p_external_url), ''),
    nullif(btrim(p_external_label), ''),
    coalesce(p_external_snapshot, '{}'::jsonb),
    p_relationship, v_uid
  ) returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'external_link_added', p_from_type, p_from_id,
          jsonb_build_object(
            'link_id', v_row.id,
            'external_app', p_external_app,
            'external_record_type', p_external_record_type,
            'external_record_id', p_external_record_id,
            'relationship', p_relationship
          ),
          'web');

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_record_link_external(text,uuid,text,text,text,text,text,jsonb,text) to authenticated;

commit;
