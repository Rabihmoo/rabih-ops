-- Rabih Ops — Phase E: Documents / SOPs module
-- =====================================================================
-- Three new tables, 11 RPCs, polymorphic comments/attachments via the
-- existing _can_access_entity helper (extended below).
--
-- Tables:
--   * documents          rich-text rows with category, visibility,
--                        optional branch, status, soft-delete, FTS index
--   * document_versions  append-only history; one row per save
--   * document_links     polymorphic many-to-many connecting documents
--                        to tasks / follow_ups / inspections /
--                        purchase_requests
--
-- RLS:
--   * documents — visibility='work' AND (branch null or branch_access),
--                 OR visibility='personal' AND created_by = auth.uid()
--                 (strict: admin/CEO do NOT override personal docs)
--   * document_versions / document_links — joined to parent doc
--
-- _can_access_entity gains a 'document' branch with the same visibility
-- logic so comments + attachments work polymorphically without surprise
-- exposure of personal documents.
--
-- 11 RPCs:
--   Web (granted to authenticated): create / update / archive /
--   unarchive / soft_delete / list / get / link / unlink /
--   documents_for_entity / revert.

begin;

-- =========================================================
-- 1. documents
-- =========================================================

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) between 1 and 300),
  category     text not null check (category in ('sop','policy','checklist','note','reference','personal')),
  branch       text references public.branches(code),
  status       text not null default 'draft' check (status in ('draft','active','archived')),
  visibility   text not null default 'work'  check (visibility in ('work','personal')),
  body_md      text,
  created_by   uuid not null references public.users(id),
  updated_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  tsv          tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'B')
  ) stored
);

comment on table public.documents is
  'SOPs, policies, checklists, reference documents, work notes, and private personal notes. Body is markdown. Soft-deletable. Full-text search via tsv generated column.';

comment on column public.documents.visibility is
  'work = scoped by branch + role; personal = visible only to created_by (strict, admin/CEO do not override).';

create index if not exists idx_documents_category_status
  on public.documents (category, status) where deleted_at is null;
create index if not exists idx_documents_branch
  on public.documents (branch) where deleted_at is null and visibility = 'work';
create index if not exists idx_documents_creator
  on public.documents (created_by) where deleted_at is null;
create index if not exists idx_documents_tsv
  on public.documents using gin (tsv) where deleted_at is null;

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

-- =========================================================
-- 2. document_versions (append-only)
-- =========================================================

create table if not exists public.document_versions (
  id            bigserial primary key,
  document_id   uuid not null references public.documents(id) on delete cascade,
  version_no    int not null check (version_no >= 1),
  title         text not null,
  body_md       text,
  category      text not null,
  branch        text,
  status        text not null,
  visibility    text not null,
  changed_by    uuid not null references public.users(id),
  change_note   text,
  created_at    timestamptz not null default now(),
  unique (document_id, version_no)
);

create index if not exists idx_document_versions_doc
  on public.document_versions (document_id, version_no desc);

-- =========================================================
-- 3. document_links (polymorphic)
-- =========================================================

create table if not exists public.document_links (
  id           bigserial primary key,
  document_id  uuid not null references public.documents(id) on delete cascade,
  entity_type  text not null check (entity_type in ('task','follow_up','inspection','purchase_request')),
  entity_id    uuid not null,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- Partial unique: at most one live link per (document, entity) pair.
create unique index if not exists uq_document_links_pair
  on public.document_links (document_id, entity_type, entity_id)
  where deleted_at is null;

create index if not exists idx_document_links_entity
  on public.document_links (entity_type, entity_id) where deleted_at is null;
create index if not exists idx_document_links_doc
  on public.document_links (document_id) where deleted_at is null;

-- =========================================================
-- 4. RLS — SELECT only (writes via RPCs)
-- =========================================================

alter table public.documents         enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_links    enable row level security;

drop policy if exists documents_select_visible on public.documents;
create policy documents_select_visible on public.documents
  for select to authenticated
  using (
    deleted_at is null and (
      (visibility = 'work'
        and (branch is null or public.current_user_can_access_branch(branch)))
      or (visibility = 'personal' and created_by = auth.uid())
    )
  );

drop policy if exists document_versions_select_visible on public.document_versions;
create policy document_versions_select_visible on public.document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.documents d
       where d.id = document_versions.document_id
         and d.deleted_at is null
         and (
           (d.visibility = 'work'
             and (d.branch is null or public.current_user_can_access_branch(d.branch)))
           or (d.visibility = 'personal' and d.created_by = auth.uid())
         )
    )
  );

drop policy if exists document_links_select_visible on public.document_links;
create policy document_links_select_visible on public.document_links
  for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.documents d
       where d.id = document_links.document_id
         and d.deleted_at is null
         and (
           (d.visibility = 'work'
             and (d.branch is null or public.current_user_can_access_branch(d.branch)))
           or (d.visibility = 'personal' and d.created_by = auth.uid())
         )
    )
  );

-- =========================================================
-- 5. Extend _can_access_entity with 'document'
-- =========================================================

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
    -- Documents have their own visibility model. Strict personal: only
    -- the creator. Work: branch-aware (null branch = visible to anyone
    -- authenticated with branch access).
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
      -- visibility = 'work'
      if v_branch is null then return true; end if;
      return public.current_user_can_access_branch(v_branch);
    end;
  else
    return false;
  end if;

  if not v_found then return false; end if;
  if v_branch is null then return false; end if;
  return public.current_user_can_access_branch(v_branch);
end;
$$;

-- =========================================================
-- 6. RPCs
-- =========================================================

create or replace function public.rpc_create_document(
  p_title       text,
  p_category    text,
  p_visibility  text default 'work',
  p_branch      text default null,
  p_body_md     text default null,
  p_status      text default 'draft'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row documents;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create documents' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if p_category not in ('sop','policy','checklist','note','reference','personal') then
    raise exception 'invalid category %', p_category using errcode = '22023';
  end if;
  if p_visibility not in ('work','personal') then
    raise exception 'invalid visibility %', p_visibility using errcode = '22023';
  end if;
  if p_visibility = 'work' and p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  insert into documents(title, category, branch, status, visibility, body_md, created_by, updated_by)
  values (btrim(p_title), p_category,
          case when p_visibility = 'personal' then p_branch else p_branch end,  -- null OK for either
          coalesce(p_status,'draft'), p_visibility,
          p_body_md, v_uid, v_uid)
  returning * into v_row;

  -- Initial version snapshot
  insert into document_versions(document_id, version_no, title, body_md, category, branch, status, visibility, changed_by, change_note)
  values (v_row.id, 1, v_row.title, v_row.body_md, v_row.category, v_row.branch, v_row.status, v_row.visibility, v_uid, 'initial version');

  perform public._audit('create','document', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_create_document(text, text, text, text, text, text) to authenticated;


create or replace function public.rpc_update_document(
  p_doc_id      uuid,
  p_updates     jsonb,
  p_change_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before documents;
  v_after  documents;
  v_next   int;
begin
  if not public._can_mutate() then
    raise exception 'role cannot edit documents' using errcode = '42501';
  end if;

  -- _can_access_entity respects personal-vs-work visibility.
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found or not accessible', p_doc_id using errcode = 'P0002';
  end if;

  select * into v_before from documents where id = p_doc_id and deleted_at is null;
  if v_before is null then
    raise exception 'document % not found', p_doc_id using errcode = 'P0002';
  end if;

  -- If branch is being changed AND visibility is work (existing or new),
  -- enforce branch access.
  if p_updates ? 'branch' then
    declare v_new_branch text := nullif(p_updates->>'branch','');
    begin
      if (coalesce(p_updates->>'visibility', v_before.visibility) = 'work')
         and v_new_branch is not null then
        perform public._require_branch_access(v_new_branch);
      end if;
    end;
  end if;

  -- Personal docs: only the creator can edit. Strict.
  if v_before.visibility = 'personal' and v_before.created_by <> v_uid then
    raise exception 'cannot edit another user''s personal document' using errcode = '42501';
  end if;

  update documents
     set title       = coalesce(nullif(btrim(p_updates->>'title'),''), title),
         category    = coalesce(p_updates->>'category', category),
         branch      = case when p_updates ? 'branch'
                             then nullif(p_updates->>'branch','')
                             else branch end,
         status      = coalesce(p_updates->>'status', status),
         visibility  = coalesce(p_updates->>'visibility', visibility),
         body_md     = case when p_updates ? 'body_md'
                             then p_updates->>'body_md'
                             else body_md end,
         updated_by  = v_uid
   where id = p_doc_id
  returning * into v_after;

  -- Snapshot a new version row.
  select coalesce(max(version_no), 0) + 1 into v_next
    from document_versions where document_id = p_doc_id;
  insert into document_versions(
    document_id, version_no, title, body_md, category, branch, status, visibility, changed_by, change_note
  ) values (
    p_doc_id, v_next, v_after.title, v_after.body_md, v_after.category,
    v_after.branch, v_after.status, v_after.visibility, v_uid,
    nullif(btrim(p_change_note), '')
  );

  perform public._audit('update','document', p_doc_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

grant execute on function public.rpc_update_document(uuid, jsonb, text) to authenticated;


create or replace function public.rpc_archive_document(p_doc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before documents;
  v_after  documents;
begin
  if not public._can_mutate() then
    raise exception 'role cannot archive documents' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found' , p_doc_id using errcode = 'P0002';
  end if;
  select * into v_before from documents where id = p_doc_id and deleted_at is null;
  if v_before.visibility = 'personal' and v_before.created_by <> v_uid then
    raise exception 'cannot archive another user''s personal document' using errcode = '42501';
  end if;

  update documents set status = 'archived', updated_by = v_uid
   where id = p_doc_id
  returning * into v_after;

  perform public._audit('archive','document', p_doc_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

grant execute on function public.rpc_archive_document(uuid) to authenticated;


create or replace function public.rpc_unarchive_document(p_doc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before documents;
  v_after  documents;
begin
  if not public._can_mutate() then
    raise exception 'role cannot unarchive documents' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found', p_doc_id using errcode = 'P0002';
  end if;
  select * into v_before from documents where id = p_doc_id and deleted_at is null;
  if v_before.status <> 'archived' then
    raise exception 'document % is not archived (status=%)', p_doc_id, v_before.status
      using errcode = '22023';
  end if;
  if v_before.visibility = 'personal' and v_before.created_by <> v_uid then
    raise exception 'cannot unarchive another user''s personal document' using errcode = '42501';
  end if;

  update documents set status = 'draft', updated_by = v_uid
   where id = p_doc_id
  returning * into v_after;

  perform public._audit('update','document', p_doc_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

grant execute on function public.rpc_unarchive_document(uuid) to authenticated;


create or replace function public.rpc_soft_delete_document(p_doc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before documents;
  v_after  documents;
begin
  -- Admin/CEO only — except creators can always delete their own personal.
  select * into v_before from documents where id = p_doc_id and deleted_at is null;
  if v_before is null then
    raise exception 'document % not found', p_doc_id using errcode = 'P0002';
  end if;
  if v_before.visibility = 'personal' then
    if v_before.created_by <> v_uid then
      raise exception 'cannot delete another user''s personal document' using errcode = '42501';
    end if;
  else
    if v_role not in ('admin','ceo') then
      raise exception 'only admin/ceo can delete work documents' using errcode = '42501';
    end if;
  end if;

  update documents set deleted_at = now(), updated_by = v_uid
   where id = p_doc_id
  returning * into v_after;

  perform public._audit('delete','document', p_doc_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

grant execute on function public.rpc_soft_delete_document(uuid) to authenticated;


create or replace function public.rpc_list_documents(
  p_category    text default null,
  p_branch      text default null,
  p_status      text default null,
  p_visibility  text default null,
  p_search      text default null,
  p_limit       int  default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_result jsonb;
  v_q      tsquery;
begin
  if p_search is not null and length(btrim(p_search)) > 0 then
    v_q := plainto_tsquery('english', btrim(p_search));
  end if;

  select coalesce(jsonb_agg(d order by
    case when v_q is not null then ts_rank(d.tsv, v_q) end desc nulls last,
    d.updated_at desc
  ), '[]'::jsonb)
    into v_result
  from (
    select dd.id, dd.title, dd.category, dd.branch, dd.status, dd.visibility,
           dd.created_by, dd.updated_by, dd.created_at, dd.updated_at,
           dd.tsv,
           case when v_q is not null
                then ts_headline('english', coalesce(dd.body_md,''), v_q,
                                 'StartSel=«,StopSel=»,MaxWords=20,MinWords=8,ShortWord=2,MaxFragments=1')
                else null
           end as snippet
      from documents dd
     where dd.deleted_at is null
       and (
         (dd.visibility = 'work'
           and (dd.branch is null or public.current_user_can_access_branch(dd.branch)))
         or (dd.visibility = 'personal' and dd.created_by = v_uid)
       )
       and (p_category   is null or dd.category   = p_category)
       and (p_branch     is null or dd.branch     = p_branch)
       and (p_status     is null or dd.status     = p_status)
       and (p_visibility is null or dd.visibility = p_visibility)
       and (v_q is null or dd.tsv @@ v_q)
     limit greatest(coalesce(p_limit, 100), 1)
  ) d;

  return v_result;
end;
$$;

grant execute on function public.rpc_list_documents(text, text, text, text, text, int) to authenticated;


create or replace function public.rpc_get_document(p_doc_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_doc documents;
begin
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found or not accessible', p_doc_id using errcode = 'P0002';
  end if;
  select * into v_doc from documents where id = p_doc_id and deleted_at is null;

  return jsonb_build_object(
    'document', to_jsonb(v_doc),
    'versions', (
      select coalesce(jsonb_agg(v order by v.version_no desc), '[]'::jsonb) from (
        select dv.id, dv.version_no, dv.title, dv.category, dv.branch, dv.status,
               dv.visibility, dv.change_note, dv.created_at, u.full_name as changed_by_name
          from document_versions dv
          join users u on u.id = dv.changed_by
         where dv.document_id = p_doc_id
      ) v
    ),
    'links', (
      select coalesce(jsonb_agg(l order by l.created_at desc), '[]'::jsonb) from (
        select dl.id, dl.entity_type, dl.entity_id, dl.created_at,
               case dl.entity_type
                 when 'task'             then (select t.title  from tasks t              where t.id = dl.entity_id and t.deleted_at is null)
                 when 'follow_up'        then (select f.title  from follow_ups f         where f.id = dl.entity_id and f.deleted_at is null)
                 when 'inspection'       then (select i.area || ' @ ' || i.branch from inspections i where i.id = dl.entity_id and i.deleted_at is null)
                 when 'purchase_request' then (select p.title  from purchase_requests p  where p.id = dl.entity_id and p.deleted_at is null)
               end as entity_title
          from document_links dl
         where dl.document_id = p_doc_id and dl.deleted_at is null
      ) l
    ),
    'comments', (
      select coalesce(jsonb_agg(c order by c.created_at asc), '[]'::jsonb) from (
        select cc.*, u.full_name as author_name
          from comments cc
          join users u on u.id = cc.author_id
         where cc.entity_type = 'document' and cc.entity_id = p_doc_id and cc.deleted_at is null
      ) c
    ),
    'attachments', (
      select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb) from (
        select aa.*, u.full_name as uploader_name
          from attachments aa
          join users u on u.id = aa.uploaded_by
         where aa.entity_type = 'document' and aa.entity_id = p_doc_id
      ) a
    ),
    'audit', (
      select coalesce(jsonb_agg(al order by al.created_at desc), '[]'::jsonb) from (
        select l.id, l.action, l.before_state, l.after_state, l.created_at, l.user_id,
               coalesce(u.full_name, 'system') as user_name
          from audit_log l
          left join users u on u.id = l.user_id
         where l.entity_type = 'document' and l.entity_id = p_doc_id
         order by l.created_at desc
         limit 50
      ) al
    )
  );
end;
$$;

grant execute on function public.rpc_get_document(uuid) to authenticated;


create or replace function public.rpc_link_document(
  p_doc_id      uuid,
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row document_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot link documents' using errcode = '42501';
  end if;
  if p_entity_type not in ('task','follow_up','inspection','purchase_request') then
    raise exception 'invalid entity_type %', p_entity_type using errcode = '22023';
  end if;
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found or not accessible', p_doc_id using errcode = 'P0002';
  end if;
  if not public._can_access_entity(p_entity_type, p_entity_id) then
    raise exception '% % not found or not accessible', p_entity_type, p_entity_id using errcode = 'P0002';
  end if;

  -- If a soft-deleted link exists, revive it; else insert fresh.
  update document_links
     set deleted_at = null
   where document_id = p_doc_id
     and entity_type = p_entity_type
     and entity_id   = p_entity_id
     and deleted_at is not null
  returning * into v_row;

  if v_row.id is null then
    insert into document_links(document_id, entity_type, entity_id, created_by)
    values (p_doc_id, p_entity_type, p_entity_id, v_uid)
    on conflict (document_id, entity_type, entity_id) where deleted_at is null do nothing
    returning * into v_row;
  end if;

  perform public._audit('document_linked', p_entity_type, p_entity_id, null,
    jsonb_build_object('document_id', p_doc_id));
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_link_document(uuid, text, uuid) to authenticated;


create or replace function public.rpc_unlink_document(p_link_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row document_links;
begin
  if not public._can_mutate() then
    raise exception 'role cannot unlink documents' using errcode = '42501';
  end if;
  select * into v_row from document_links where id = p_link_id and deleted_at is null;
  if v_row is null then
    raise exception 'link % not found', p_link_id using errcode = 'P0002';
  end if;
  if not public._can_access_entity('document', v_row.document_id) then
    raise exception 'document not accessible' using errcode = '42501';
  end if;

  update document_links set deleted_at = now() where id = p_link_id
  returning * into v_row;

  perform public._audit('document_unlinked', v_row.entity_type, v_row.entity_id, null,
    jsonb_build_object('document_id', v_row.document_id));
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_unlink_document(bigint) to authenticated;


create or replace function public.rpc_documents_for_entity(
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_result jsonb;
begin
  -- Each link is only returned if the calling user can read its document
  -- (RLS enforced via the inner subquery + _can_access_entity check).
  select coalesce(jsonb_agg(jsonb_build_object(
    'link_id',     l.id,
    'document_id', d.id,
    'title',       d.title,
    'category',    d.category,
    'status',      d.status,
    'visibility',  d.visibility,
    'updated_at',  d.updated_at
  ) order by d.updated_at desc), '[]'::jsonb)
    into v_result
  from document_links l
  join documents d on d.id = l.document_id and d.deleted_at is null
  where l.entity_type = p_entity_type
    and l.entity_id   = p_entity_id
    and l.deleted_at  is null
    and public._can_access_entity('document', d.id);

  return v_result;
end;
$$;

grant execute on function public.rpc_documents_for_entity(text, uuid) to authenticated;


create or replace function public.rpc_revert_document(
  p_doc_id     uuid,
  p_version_no int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before documents;
  v_after  documents;
  v_old    document_versions;
  v_next   int;
begin
  if not public._can_mutate() then
    raise exception 'role cannot revert documents' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found or not accessible', p_doc_id using errcode = 'P0002';
  end if;

  select * into v_before from documents where id = p_doc_id and deleted_at is null;
  if v_before.visibility = 'personal' and v_before.created_by <> v_uid then
    raise exception 'cannot revert another user''s personal document' using errcode = '42501';
  end if;

  select * into v_old from document_versions
   where document_id = p_doc_id and version_no = p_version_no;
  if v_old is null then
    raise exception 'version % of document % not found', p_version_no, p_doc_id using errcode = 'P0002';
  end if;

  update documents
     set title      = v_old.title,
         body_md    = v_old.body_md,
         category   = v_old.category,
         branch     = v_old.branch,
         status     = v_old.status,
         visibility = v_old.visibility,
         updated_by = v_uid
   where id = p_doc_id
  returning * into v_after;

  select coalesce(max(version_no), 0) + 1 into v_next from document_versions where document_id = p_doc_id;
  insert into document_versions(
    document_id, version_no, title, body_md, category, branch, status, visibility, changed_by, change_note
  ) values (
    p_doc_id, v_next, v_after.title, v_after.body_md, v_after.category, v_after.branch,
    v_after.status, v_after.visibility, v_uid,
    'reverted from version ' || p_version_no
  );

  perform public._audit('revert','document', p_doc_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

grant execute on function public.rpc_revert_document(uuid, int) to authenticated;

-- =========================================================
-- 7. Document comment + attachment wrappers
-- =========================================================

create or replace function public.rpc_add_document_comment(
  p_doc_id uuid,
  p_body   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row comments;
begin
  if not public._can_mutate() then
    raise exception 'role cannot comment on documents' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found or not accessible', p_doc_id using errcode = 'P0002';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'comment body is required' using errcode = '22023';
  end if;

  insert into comments(entity_type, entity_id, author_id, body)
  values ('document', p_doc_id, v_uid, btrim(p_body))
  returning * into v_row;

  perform public._audit('comment','document', p_doc_id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_add_document_comment(uuid, text) to authenticated;


create or replace function public.rpc_delete_document_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before comments;
begin
  select * into v_before from comments where id = p_comment_id and deleted_at is null;
  if v_before is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  if v_before.entity_type <> 'document' then
    raise exception 'rpc_delete_document_comment used on % comment', v_before.entity_type using errcode = '22023';
  end if;
  if v_before.author_id <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'only the author or admin/ceo can delete a comment' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', v_before.entity_id) then
    raise exception 'document not accessible' using errcode = '42501';
  end if;

  update comments set deleted_at = now() where id = p_comment_id;
  perform public._audit('comment_delete','document', v_before.entity_id, to_jsonb(v_before), null);
  return jsonb_build_object('success', true, 'id', p_comment_id);
end;
$$;

grant execute on function public.rpc_delete_document_comment(uuid) to authenticated;


create or replace function public.rpc_attach_file_to_document(
  p_doc_id       uuid,
  p_storage_path text,
  p_file_name    text,
  p_mime_type    text,
  p_file_size    int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row attachments;
begin
  if not public._can_mutate() then
    raise exception 'role cannot attach files' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', p_doc_id) then
    raise exception 'document % not found or not accessible', p_doc_id using errcode = 'P0002';
  end if;
  if p_storage_path !~ ('^document/' || p_doc_id::text || '/.+') then
    raise exception 'storage_path must be under document/%/', p_doc_id using errcode = '22023';
  end if;

  insert into attachments(entity_type, entity_id, uploaded_by, storage_path, file_name, mime_type, file_size)
  values ('document', p_doc_id, v_uid, p_storage_path, p_file_name, p_mime_type, p_file_size)
  returning * into v_row;

  perform public._audit('attach','document', p_doc_id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_attach_file_to_document(uuid, text, text, text, int) to authenticated;


create or replace function public.rpc_remove_document_attachment(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before attachments;
begin
  select * into v_before from attachments where id = p_attachment_id;
  if v_before is null then
    raise exception 'attachment % not found', p_attachment_id using errcode = 'P0002';
  end if;
  if v_before.entity_type <> 'document' then
    raise exception 'rpc_remove_document_attachment used on % attachment', v_before.entity_type using errcode = '22023';
  end if;
  if v_before.uploaded_by <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'only the uploader or admin/ceo can remove' using errcode = '42501';
  end if;
  if not public._can_access_entity('document', v_before.entity_id) then
    raise exception 'document not accessible' using errcode = '42501';
  end if;

  delete from attachments where id = p_attachment_id;
  perform public._audit('detach','document', v_before.entity_id, to_jsonb(v_before), null);
  return jsonb_build_object('success', true, 'id', p_attachment_id);
end;
$$;

grant execute on function public.rpc_remove_document_attachment(uuid) to authenticated;

commit;
