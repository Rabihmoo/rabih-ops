-- Rabih Ops — Phase H3.3: widen record_links to include note
-- =====================================================================
-- Three changes, all additive, mirroring H2.3's widening pattern:
--   1. Widen the from_entity_type / to_entity_type CHECK constraints to
--      include 'note'.
--   2. Extend public._can_access_entity with a note arm that delegates
--      to the H3.1 _note_visible helper — so record_links privacy stays
--      consistent with the strict notes visibility model:
--        * personal note → creator-only (no admin/CEO bypass)
--        * work note + branch → branch access (or admin/CEO)
--        * work note + null branch → admin/CEO only
--   3. Re-create rpc_record_link_internal and rpc_record_link_external
--      with the new entity-type whitelist in their input validation.
--      Bodies otherwise identical to H1 / H2.3.
--
-- Out of scope: no UI, no LinkedRecordsPanel, no widening of
-- rpc_record_relations (it already projects whatever passes the CHECK
-- and re-enforces _can_access_entity inline, so note rows flow through
-- automatically once the constraint accepts them).
--
-- No new audit verbs. record_link_created / external_link_added /
-- record_link_removed / external_link_removed already cover the wider
-- whitelist.
--
-- Linking does NOT require write access to either endpoint — only
-- _can_access_entity (read access). Mirrors documents + companies.

begin;

-- =====================================================================
-- 1. Widen CHECK constraints
-- =====================================================================

alter table public.record_links
  drop constraint if exists record_links_from_entity_type_check;
alter table public.record_links
  add constraint record_links_from_entity_type_check
  check (from_entity_type in (
    'task','follow_up','purchase_request','inspection','document',
    'company','contact','note'
  ));

alter table public.record_links
  drop constraint if exists record_links_to_entity_type_check;
alter table public.record_links
  add constraint record_links_to_entity_type_check
  check (to_entity_type in (
    'task','follow_up','purchase_request','inspection','document',
    'company','contact','note'
  ));

-- =====================================================================
-- 2. Extend _can_access_entity with a note arm.
-- =====================================================================
-- Delegates to _note_visible (H3.1) so the strict-personal rule lives
-- in exactly one place. _note_visible already returns false for:
--   * deleted notes
--   * personal notes whose creator <> auth.uid()
--   * work + null-branch notes when the caller isn't admin/CEO
--   * work + branch notes when the caller can't access the branch
-- and true otherwise.

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
-- 3. Re-create record-link RPCs with the widened whitelist.
-- =====================================================================
-- Bodies identical to H2.3 except the entity-type validation arrays.
-- Self-link rejection, idempotency, privacy and audit behaviour
-- unchanged.

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
