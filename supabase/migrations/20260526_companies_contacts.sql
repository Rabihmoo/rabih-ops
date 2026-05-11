-- Rabih Ops — Phase H2.1: Companies + Contacts (schema + RPCs)
-- =====================================================================
-- Adds the Directory: companies, contacts, and per-branch joins.
--
-- Visibility rule (strict):
--   * admin / ceo see every non-deleted row.
--   * Anyone else sees a row only if at least one of its branch joins
--     resolves to a branch they can access.
--   * Zero branch rows = admin/ceo ONLY (no "shared / cross-branch"
--     fallback in V1).
--
-- Mutation rule:
--   * All writes via SECURITY DEFINER RPCs. Tables expose SELECT only.
--   * For non-admin/ceo callers, every branch they assign must satisfy
--     _require_branch_access. Admin/CEO may assign anything, including
--     zero branches (which then locks the row to admin/CEO).
--
-- H2.1 does NOT widen record_links yet — that's a separate H2.3
-- migration with its own CHECK update + _can_access_entity extension.

begin;

-- =====================================================================
-- 1. companies
-- =====================================================================

create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in (
    'supplier','contractor','landlord','government','agency','partner','customer','other'
  )),
  website     text,
  phone       text,
  email       text,
  notes       text,
  active      boolean not null default true,
  created_by  uuid not null references public.users(id),
  updated_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.companies is
  'Phase H2.1 — directory of organisations (suppliers, contractors, landlords, agencies, partners, customers, etc.). Branch-scoped via company_branches.';
comment on column public.companies.active is
  'False means archived. Archived rows are still visible (UI surfaces them under a "Show archived" toggle); deleted_at is reserved for hidden hard-delete admin cleanup.';

create index if not exists idx_companies_name_lower
  on public.companies (lower(name)) where deleted_at is null;
create index if not exists idx_companies_category
  on public.companies (category) where deleted_at is null and active = true;
create index if not exists idx_companies_updated_at
  on public.companies (updated_at desc) where deleted_at is null;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. contacts
-- =====================================================================

create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  company_id       uuid references public.companies(id) on delete set null,
  role             text,
  email            text,
  phone            text,
  whatsapp         text,
  telegram_handle  text,
  notes            text,
  active           boolean not null default true,
  created_by       uuid not null references public.users(id),
  updated_by       uuid not null references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.contacts is
  'Phase H2.1 — people inside companies (or independent). Branch-scoped via contact_branches. No "personal" visibility tier in V1; private records belong in notes (H3).';

create index if not exists idx_contacts_company_id
  on public.contacts (company_id) where deleted_at is null;
create index if not exists idx_contacts_name_lower
  on public.contacts (lower(full_name)) where deleted_at is null;
create index if not exists idx_contacts_email_lower
  on public.contacts (lower(email)) where deleted_at is null and email is not null;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. branch joins
-- =====================================================================

create table if not exists public.company_branches (
  company_id uuid not null references public.companies(id) on delete cascade,
  branch     text not null references public.branches(code) on delete cascade,
  primary key (company_id, branch)
);
create index if not exists idx_company_branches_branch
  on public.company_branches (branch);

create table if not exists public.contact_branches (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  branch     text not null references public.branches(code) on delete cascade,
  primary key (contact_id, branch)
);
create index if not exists idx_contact_branches_branch
  on public.contact_branches (branch);

-- =====================================================================
-- 4. RLS — strict zero-rows-means-admin-only
-- =====================================================================

alter table public.companies enable row level security;
drop policy if exists companies_select_visible on public.companies;
create policy companies_select_visible on public.companies
  for select to authenticated using (
    deleted_at is null
    and (
      public.current_user_role() in ('admin','ceo')
      or exists (
        select 1 from public.company_branches cb
         where cb.company_id = id
           and public.current_user_can_access_branch(cb.branch)
      )
    )
  );

alter table public.contacts enable row level security;
drop policy if exists contacts_select_visible on public.contacts;
create policy contacts_select_visible on public.contacts
  for select to authenticated using (
    deleted_at is null
    and (
      public.current_user_role() in ('admin','ceo')
      or exists (
        select 1 from public.contact_branches cb
         where cb.contact_id = id
           and public.current_user_can_access_branch(cb.branch)
      )
    )
  );

alter table public.company_branches enable row level security;
drop policy if exists company_branches_select_visible on public.company_branches;
create policy company_branches_select_visible on public.company_branches
  for select to authenticated using (
    public.current_user_role() in ('admin','ceo')
    or public.current_user_can_access_branch(branch)
  );

alter table public.contact_branches enable row level security;
drop policy if exists contact_branches_select_visible on public.contact_branches;
create policy contact_branches_select_visible on public.contact_branches
  for select to authenticated using (
    public.current_user_role() in ('admin','ceo')
    or public.current_user_can_access_branch(branch)
  );

-- =====================================================================
-- 5. Helper: validate the caller may assign each branch.
-- =====================================================================

create or replace function public._require_branches_assignable(
  p_branches text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  b text;
begin
  if p_branches is null then return; end if;
  if v_role in ('admin','ceo') then return; end if;
  foreach b in array p_branches loop
    if not public.current_user_can_access_branch(b) then
      raise exception 'cannot assign branch %; out of your branch access', b
        using errcode = '42501';
    end if;
  end loop;
end;
$$;

comment on function public._require_branches_assignable(text[]) is
  'Internal helper: for non-admin/ceo callers, raises 42501 if any branch in the array is outside the caller''s assigned branches.';

-- =====================================================================
-- 6. Helper: row visibility re-check (mirrors SELECT policies).
-- =====================================================================

create or replace function public._company_visible(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deleted timestamptz;
  v_role text := public.current_user_role();
begin
  select deleted_at into v_deleted from public.companies where id = p_id;
  if v_deleted is not null then return false; end if;
  if v_role in ('admin','ceo') then return true; end if;
  return exists (
    select 1 from public.company_branches cb
      where cb.company_id = p_id
        and public.current_user_can_access_branch(cb.branch)
  );
end;
$$;

create or replace function public._contact_visible(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deleted timestamptz;
  v_role text := public.current_user_role();
begin
  select deleted_at into v_deleted from public.contacts where id = p_id;
  if v_deleted is not null then return false; end if;
  if v_role in ('admin','ceo') then return true; end if;
  return exists (
    select 1 from public.contact_branches cb
      where cb.contact_id = p_id
        and public.current_user_can_access_branch(cb.branch)
  );
end;
$$;

-- =====================================================================
-- 7. Company RPCs
-- =====================================================================

create or replace function public.rpc_create_company(
  p_name      text,
  p_category  text,
  p_branches  text[] default '{}'::text[],
  p_website   text default null,
  p_phone     text default null,
  p_email     text default null,
  p_notes     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row companies;
  b text;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create companies' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if p_category is null or p_category not in (
    'supplier','contractor','landlord','government','agency','partner','customer','other'
  ) then
    raise exception 'invalid category %', p_category using errcode = '22023';
  end if;
  perform public._require_branches_assignable(p_branches);

  insert into companies(name, category, website, phone, email, notes, created_by, updated_by)
  values (btrim(p_name), p_category,
          nullif(btrim(p_website), ''), nullif(btrim(p_phone), ''),
          nullif(btrim(p_email), ''),   nullif(p_notes, ''),
          v_uid, v_uid)
  returning * into v_row;

  if p_branches is not null and array_length(p_branches, 1) is not null then
    foreach b in array p_branches loop
      insert into company_branches(company_id, branch) values (v_row.id, b)
        on conflict do nothing;
    end loop;
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'company_created', 'company', v_row.id,
          jsonb_build_object('name', v_row.name, 'category', v_row.category, 'branches', p_branches),
          'web');

  return public.rpc_get_company(v_row.id);
end;
$$;

grant execute on function public.rpc_create_company(text,text,text[],text,text,text,text) to authenticated;


create or replace function public.rpc_update_company(
  p_id      uuid,
  p_patches jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before companies;
  v_after  companies;
begin
  if not public._can_mutate() then
    raise exception 'role cannot update companies' using errcode = '42501';
  end if;
  if not public._company_visible(p_id) then
    raise exception 'company % not found or not accessible', p_id using errcode = 'P0002';
  end if;
  select * into v_before from companies where id = p_id and deleted_at is null;

  update companies set
    name     = coalesce(nullif(btrim(p_patches->>'name'), ''), name),
    category = coalesce(
      case when p_patches ? 'category'
             and p_patches->>'category' in
                 ('supplier','contractor','landlord','government','agency','partner','customer','other')
           then p_patches->>'category' end,
      category),
    website  = case when p_patches ? 'website'  then nullif(btrim(p_patches->>'website'), '')  else website end,
    phone    = case when p_patches ? 'phone'    then nullif(btrim(p_patches->>'phone'), '')    else phone end,
    email    = case when p_patches ? 'email'    then nullif(btrim(p_patches->>'email'), '')    else email end,
    notes    = case when p_patches ? 'notes'    then nullif(p_patches->>'notes', '')           else notes end,
    updated_by = v_uid
   where id = p_id
   returning * into v_after;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, after_state, source)
  values (v_uid, 'company_updated', 'company', p_id, to_jsonb(v_before), to_jsonb(v_after), 'web');

  return public.rpc_get_company(p_id);
end;
$$;

grant execute on function public.rpc_update_company(uuid, jsonb) to authenticated;


create or replace function public.rpc_set_company_branches(
  p_id       uuid,
  p_branches text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_role  text := public.current_user_role();
  v_before text[];
  b text;
begin
  if not public._can_mutate() then
    raise exception 'role cannot change company branches' using errcode = '42501';
  end if;
  if not public._company_visible(p_id) then
    raise exception 'company % not found or not accessible', p_id using errcode = 'P0002';
  end if;
  perform public._require_branches_assignable(p_branches);

  -- Non-admin/ceo cannot remove branches they don't have access to —
  -- they could only have touched ones they can see.
  if v_role not in ('admin','ceo') then
    select coalesce(array_agg(cb.branch) filter (
      where not public.current_user_can_access_branch(cb.branch)
    ), '{}')
      into v_before
     from company_branches cb where cb.company_id = p_id;
    if v_before is not null and array_length(v_before, 1) is not null then
      -- Preserve branches outside their access — append them silently.
      p_branches := (
        select array_agg(distinct x)
          from unnest(coalesce(p_branches,'{}'::text[]) || v_before) x
      );
    end if;
  end if;

  delete from company_branches where company_id = p_id;
  if p_branches is not null and array_length(p_branches, 1) is not null then
    foreach b in array p_branches loop
      insert into company_branches(company_id, branch) values (p_id, b)
        on conflict do nothing;
    end loop;
  end if;

  update companies set updated_by = v_uid where id = p_id;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'company_branches_updated', 'company', p_id,
          jsonb_build_object('branches', p_branches), 'web');

  return public.rpc_get_company(p_id);
end;
$$;

grant execute on function public.rpc_set_company_branches(uuid, text[]) to authenticated;


create or replace function public.rpc_archive_company(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public._require_auth();
begin
  if not public._can_mutate() then
    raise exception 'role cannot archive companies' using errcode = '42501';
  end if;
  if not public._company_visible(p_id) then
    raise exception 'company % not found', p_id using errcode = 'P0002';
  end if;
  update companies set active = false, updated_by = v_uid where id = p_id;
  insert into audit_log(user_id, action, entity_type, entity_id, source)
  values (v_uid, 'company_archived', 'company', p_id, 'web');
  return public.rpc_get_company(p_id);
end;
$$;

grant execute on function public.rpc_archive_company(uuid) to authenticated;


create or replace function public.rpc_unarchive_company(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public._require_auth();
begin
  if not public._can_mutate() then
    raise exception 'role cannot unarchive companies' using errcode = '42501';
  end if;
  if not public._company_visible(p_id) then
    raise exception 'company % not found', p_id using errcode = 'P0002';
  end if;
  update companies set active = true, updated_by = v_uid where id = p_id;
  insert into audit_log(user_id, action, entity_type, entity_id, source)
  values (v_uid, 'company_unarchived', 'company', p_id, 'web');
  return public.rpc_get_company(p_id);
end;
$$;

grant execute on function public.rpc_unarchive_company(uuid) to authenticated;


create or replace function public.rpc_get_company(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row companies;
  v_branches text[];
  v_contact_count int;
begin
  perform public._require_auth();
  if not public._company_visible(p_id) then
    return null;
  end if;
  select * into v_row from companies where id = p_id;
  select coalesce(array_agg(branch order by branch), '{}'::text[])
    into v_branches from company_branches where company_id = p_id;
  select count(*) into v_contact_count
    from contacts where company_id = p_id and deleted_at is null;
  return to_jsonb(v_row) || jsonb_build_object(
    'branches', v_branches,
    'contact_count', v_contact_count
  );
end;
$$;

grant execute on function public.rpc_get_company(uuid) to authenticated;


create or replace function public.rpc_list_companies(
  p_category text default null,
  p_branch   text default null,
  p_search   text default null,
  p_include_inactive boolean default false,
  p_limit    int default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public._require_auth();
  v_role text := public.current_user_role();
  v_lim  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  with eligible as (
    select c.*
      from companies c
     where c.deleted_at is null
       and (p_include_inactive or c.active = true)
       and (p_category is null or c.category = p_category)
       and (
         v_role in ('admin','ceo')
         or exists (
           select 1 from company_branches cb
            where cb.company_id = c.id
              and public.current_user_can_access_branch(cb.branch)
         )
       )
       and (p_branch is null or exists (
         select 1 from company_branches cb
          where cb.company_id = c.id and cb.branch = p_branch
       ))
       and (p_search is null or p_search = ''
            or c.name ilike '%' || p_search || '%'
            or coalesce(c.notes, '') ilike '%' || p_search || '%')
  ),
  shaped as (
    select c.*,
      coalesce(
        (select array_agg(cb.branch order by cb.branch)
           from company_branches cb where cb.company_id = c.id),
        '{}'::text[]
      ) as branches,
      (select count(*) from contacts ct
         where ct.company_id = c.id and ct.deleted_at is null) as contact_count
      from eligible c
     order by c.updated_at desc
     limit v_lim
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc), '[]'::jsonb)
    into v_result from shaped s;
  return v_result;
end;
$$;

grant execute on function public.rpc_list_companies(text,text,text,boolean,int) to authenticated;

-- =====================================================================
-- 8. Contact RPCs
-- =====================================================================

create or replace function public.rpc_create_contact(
  p_full_name       text,
  p_company_id      uuid    default null,
  p_branches        text[]  default '{}'::text[],
  p_role            text    default null,
  p_email           text    default null,
  p_phone           text    default null,
  p_whatsapp        text    default null,
  p_telegram_handle text    default null,
  p_notes           text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row contacts;
  v_default_branches text[];
  v_final_branches   text[];
  b text;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create contacts' using errcode = '42501';
  end if;
  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'full_name is required' using errcode = '22023';
  end if;

  -- Validate company if provided + caller must have access.
  if p_company_id is not null and not public._company_visible(p_company_id) then
    raise exception 'company % not accessible', p_company_id using errcode = '42501';
  end if;

  -- Default-copy company branches when caller passes an empty list AND a company.
  v_final_branches := coalesce(p_branches, '{}'::text[]);
  if (v_final_branches is null or array_length(v_final_branches, 1) is null)
     and p_company_id is not null then
    select coalesce(array_agg(branch), '{}'::text[])
      into v_default_branches from company_branches where company_id = p_company_id;
    v_final_branches := v_default_branches;
  end if;
  perform public._require_branches_assignable(v_final_branches);

  insert into contacts(full_name, company_id, role, email, phone, whatsapp,
                       telegram_handle, notes, created_by, updated_by)
  values (btrim(p_full_name), p_company_id,
          nullif(btrim(p_role), ''),
          nullif(btrim(p_email), ''),
          nullif(btrim(p_phone), ''),
          nullif(btrim(p_whatsapp), ''),
          nullif(btrim(p_telegram_handle), ''),
          nullif(p_notes, ''),
          v_uid, v_uid)
  returning * into v_row;

  if v_final_branches is not null and array_length(v_final_branches, 1) is not null then
    foreach b in array v_final_branches loop
      insert into contact_branches(contact_id, branch) values (v_row.id, b)
        on conflict do nothing;
    end loop;
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'contact_created', 'contact', v_row.id,
          jsonb_build_object(
            'full_name', v_row.full_name,
            'company_id', v_row.company_id,
            'branches', v_final_branches
          ),
          'web');

  return public.rpc_get_contact(v_row.id);
end;
$$;

grant execute on function public.rpc_create_contact(text,uuid,text[],text,text,text,text,text,text) to authenticated;


create or replace function public.rpc_update_contact(
  p_id      uuid,
  p_patches jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_before contacts;
  v_after  contacts;
  v_new_company_id uuid;
begin
  if not public._can_mutate() then
    raise exception 'role cannot update contacts' using errcode = '42501';
  end if;
  if not public._contact_visible(p_id) then
    raise exception 'contact % not found or not accessible', p_id using errcode = 'P0002';
  end if;
  select * into v_before from contacts where id = p_id and deleted_at is null;

  -- If company_id is being changed, verify caller can access the new one
  -- (null = detach is always allowed).
  if p_patches ? 'company_id' then
    v_new_company_id := nullif(p_patches->>'company_id', '')::uuid;
    if v_new_company_id is not null and not public._company_visible(v_new_company_id) then
      raise exception 'company % not accessible', v_new_company_id using errcode = '42501';
    end if;
  end if;

  update contacts set
    full_name = coalesce(nullif(btrim(p_patches->>'full_name'), ''), full_name),
    company_id = case when p_patches ? 'company_id'
                       then nullif(p_patches->>'company_id', '')::uuid
                       else company_id end,
    role             = case when p_patches ? 'role'            then nullif(btrim(p_patches->>'role'), '')             else role end,
    email            = case when p_patches ? 'email'           then nullif(btrim(p_patches->>'email'), '')            else email end,
    phone            = case when p_patches ? 'phone'           then nullif(btrim(p_patches->>'phone'), '')            else phone end,
    whatsapp         = case when p_patches ? 'whatsapp'        then nullif(btrim(p_patches->>'whatsapp'), '')         else whatsapp end,
    telegram_handle  = case when p_patches ? 'telegram_handle' then nullif(btrim(p_patches->>'telegram_handle'), '')  else telegram_handle end,
    notes            = case when p_patches ? 'notes'           then nullif(p_patches->>'notes', '')                   else notes end,
    updated_by = v_uid
   where id = p_id
   returning * into v_after;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, after_state, source)
  values (v_uid, 'contact_updated', 'contact', p_id, to_jsonb(v_before), to_jsonb(v_after), 'web');

  return public.rpc_get_contact(p_id);
end;
$$;

grant execute on function public.rpc_update_contact(uuid, jsonb) to authenticated;


create or replace function public.rpc_set_contact_branches(
  p_id       uuid,
  p_branches text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public._require_auth();
  v_role  text := public.current_user_role();
  v_preserved text[];
  b text;
begin
  if not public._can_mutate() then
    raise exception 'role cannot change contact branches' using errcode = '42501';
  end if;
  if not public._contact_visible(p_id) then
    raise exception 'contact % not found or not accessible', p_id using errcode = 'P0002';
  end if;
  perform public._require_branches_assignable(p_branches);

  if v_role not in ('admin','ceo') then
    select coalesce(array_agg(cb.branch) filter (
      where not public.current_user_can_access_branch(cb.branch)
    ), '{}')
      into v_preserved
     from contact_branches cb where cb.contact_id = p_id;
    if v_preserved is not null and array_length(v_preserved, 1) is not null then
      p_branches := (
        select array_agg(distinct x)
          from unnest(coalesce(p_branches,'{}'::text[]) || v_preserved) x
      );
    end if;
  end if;

  delete from contact_branches where contact_id = p_id;
  if p_branches is not null and array_length(p_branches, 1) is not null then
    foreach b in array p_branches loop
      insert into contact_branches(contact_id, branch) values (p_id, b)
        on conflict do nothing;
    end loop;
  end if;

  update contacts set updated_by = v_uid where id = p_id;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'contact_branches_updated', 'contact', p_id,
          jsonb_build_object('branches', p_branches), 'web');

  return public.rpc_get_contact(p_id);
end;
$$;

grant execute on function public.rpc_set_contact_branches(uuid, text[]) to authenticated;


create or replace function public.rpc_archive_contact(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public._require_auth();
begin
  if not public._can_mutate() then
    raise exception 'role cannot archive contacts' using errcode = '42501';
  end if;
  if not public._contact_visible(p_id) then
    raise exception 'contact % not found', p_id using errcode = 'P0002';
  end if;
  update contacts set active = false, updated_by = v_uid where id = p_id;
  insert into audit_log(user_id, action, entity_type, entity_id, source)
  values (v_uid, 'contact_archived', 'contact', p_id, 'web');
  return public.rpc_get_contact(p_id);
end;
$$;

grant execute on function public.rpc_archive_contact(uuid) to authenticated;


create or replace function public.rpc_unarchive_contact(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public._require_auth();
begin
  if not public._can_mutate() then
    raise exception 'role cannot unarchive contacts' using errcode = '42501';
  end if;
  if not public._contact_visible(p_id) then
    raise exception 'contact % not found', p_id using errcode = 'P0002';
  end if;
  update contacts set active = true, updated_by = v_uid where id = p_id;
  insert into audit_log(user_id, action, entity_type, entity_id, source)
  values (v_uid, 'contact_unarchived', 'contact', p_id, 'web');
  return public.rpc_get_contact(p_id);
end;
$$;

grant execute on function public.rpc_unarchive_contact(uuid) to authenticated;


create or replace function public.rpc_get_contact(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row contacts;
  v_branches text[];
  v_company jsonb;
begin
  perform public._require_auth();
  if not public._contact_visible(p_id) then
    return null;
  end if;
  select * into v_row from contacts where id = p_id;
  select coalesce(array_agg(branch order by branch), '{}'::text[])
    into v_branches from contact_branches where contact_id = p_id;
  if v_row.company_id is not null and public._company_visible(v_row.company_id) then
    select jsonb_build_object(
      'id', c.id, 'name', c.name, 'category', c.category
    ) into v_company from companies c where c.id = v_row.company_id;
  else
    v_company := null;
  end if;
  return to_jsonb(v_row) || jsonb_build_object(
    'branches', v_branches,
    'company', v_company
  );
end;
$$;

grant execute on function public.rpc_get_contact(uuid) to authenticated;


create or replace function public.rpc_list_contacts(
  p_company_id uuid    default null,
  p_branch     text    default null,
  p_search     text    default null,
  p_include_inactive boolean default false,
  p_limit      int     default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_lim  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  perform public._require_auth();
  with eligible as (
    select c.*
      from contacts c
     where c.deleted_at is null
       and (p_include_inactive or c.active = true)
       and (p_company_id is null or c.company_id = p_company_id)
       and (
         v_role in ('admin','ceo')
         or exists (
           select 1 from contact_branches cb
            where cb.contact_id = c.id
              and public.current_user_can_access_branch(cb.branch)
         )
       )
       and (p_branch is null or exists (
         select 1 from contact_branches cb
          where cb.contact_id = c.id and cb.branch = p_branch
       ))
       and (p_search is null or p_search = ''
            or c.full_name ilike '%' || p_search || '%'
            or coalesce(c.email, '') ilike '%' || p_search || '%'
            or coalesce(c.role,  '') ilike '%' || p_search || '%')
  ),
  shaped as (
    select c.*,
      coalesce(
        (select array_agg(cb.branch order by cb.branch)
           from contact_branches cb where cb.contact_id = c.id),
        '{}'::text[]
      ) as branches,
      (select jsonb_build_object('id', co.id, 'name', co.name, 'category', co.category)
         from companies co where co.id = c.company_id) as company
      from eligible c
     order by c.updated_at desc
     limit v_lim
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc), '[]'::jsonb)
    into v_result from shaped s;
  return v_result;
end;
$$;

grant execute on function public.rpc_list_contacts(uuid,text,text,boolean,int) to authenticated;

commit;
