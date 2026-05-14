-- Rabih Ops — Phase H2.3: widen record_links to include company / contact
-- =====================================================================
-- Three changes, all additive:
--   1. Widen the from_entity_type / to_entity_type CHECK constraints to
--      include 'company' and 'contact'.
--   2. Extend public._can_access_entity with arms that delegate to the
--      H2.1 _company_visible and _contact_visible helpers — so
--      record_links privacy stays consistent with the rest of the
--      Directory's RLS.
--   3. Re-create rpc_record_link_internal and rpc_record_link_external
--      with the new entity-type whitelist in their input validation.
--      (Bodies otherwise identical to H1.)
--
-- Out of scope: inspection_finding is intentionally not added — it has
-- no detail page surface. Add when there's a real link target need.
--
-- No new audit verbs. record_link_created / external_link_added /
-- record_link_removed / external_link_removed already cover the wider
-- whitelist.
--
-- Replay-safety note (added retroactively):
--   The canonical H2.3 whitelist is (task, follow_up, purchase_request,
--   inspection, document, company, contact). The next migration in
--   chronological order (20260530_record_links_widen_note.sql) drops
--   and re-adds the same constraint with 'note' added. After that
--   ran on staging, real note-typed record_links rows accumulated
--   (122 as of edit time). `npm run db:push` then re-applies every
--   migration in order — re-running THIS migration's narrower CHECK
--   would fail with 23514 against those existing note rows, even
--   though the next migration immediately re-widens.
--
--   To make replay safe, 'note' is included in this whitelist too.
--   The intermediate state after this migration is therefore identical
--   to the post-20260530 state (same 8-type set). 20260530 still drops
--   and re-adds the constraint with the same set, so the final shape
--   on either a blank DB or a replayed DB is unchanged. This edit
--   does not change any user-facing behavior; it only fixes db:push
--   idempotency.

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
-- 2. Extend _can_access_entity with company / contact arms.
-- =====================================================================
-- Reuse the H2.1 _company_visible / _contact_visible helpers so the
-- rule lives in exactly one place — they already mirror the SELECT
-- policy on the underlying tables (admin/ceo bypass; otherwise at least
-- one matching branch join; zero-branch rows are admin/ceo only).

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
    -- H2.1 helper: admin/ceo bypass; otherwise must have at least one
    -- accessible branch join. Zero branch rows are admin/ceo only.
    return public._company_visible(p_entity_id);
  elsif p_entity_type = 'contact' then
    return public._contact_visible(p_entity_id);
  else
    return false;
  end if;

  if not v_found then return false; end if;
  if v_branch is null then return false; end if;
  return public.current_user_can_access_branch(v_branch);
end;
$$;

-- =====================================================================
-- 3. Re-create record-link RPCs with the widened whitelist.
-- =====================================================================
-- Bodies identical to H1 except the entity-type validation arrays. Self-
-- link rejection, idempotency, privacy and audit behaviour unchanged.

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
    'company','contact'
  ) then
    raise exception 'invalid from_entity_type %', p_from_type using errcode = '22023';
  end if;
  if p_to_type not in (
    'task','follow_up','purchase_request','inspection','document',
    'company','contact'
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
    'company','contact'
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
