-- Rabih Ops — Phase H3.1: Notes + Decisions + module taxonomy
-- =====================================================================
-- Two additions, both additive:
--   1. New `notes` table. Same visibility model as documents PLUS the
--      stricter "branch is null on a work note ⇒ admin/CEO only" rule
--      we use for companies. Decisions are notes with kind='decision'.
--   2. Nullable `module` column on tasks, follow_ups, purchase_requests
--      and documents. Voluntary adoption; no backfill; not an access-
--      control surface.
--
-- Visibility rule (strict):
--   * visibility='personal'  →  creator-only, NO admin/CEO bypass.
--   * visibility='work', branch IS NOT NULL  →  caller must have
--     branch access (or be admin/CEO).
--   * visibility='work', branch IS NULL  →  admin/CEO only.
--
-- This is stricter than the documents model on the third case (matches
-- companies: zero branch info → admin/CEO only) — by design, so a
-- general/uncategorised note doesn't quietly leak to every user.
--
-- record_links is NOT widened to accept 'note' in this migration —
-- that lands in H3.3.

begin;

-- =====================================================================
-- 1. notes
-- =====================================================================

create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),

  title           text,                                -- optional for "quick note"
  body_md         text not null,
  kind            text not null default 'note' check (kind in
    ('note','decision','meeting','idea','lesson','incident')),
  module          text not null default 'general' check (module in
    ('general','personal','finance','supplier','maintenance','hr',
     'operations','marketing','catering','knowledge')),
  visibility      text not null default 'work' check (visibility in ('work','personal')),
  branch          text references public.branches(code),

  -- Decision-specific fields (only meaningful when kind='decision').
  decision_reason  text,
  decision_impact  text,
  decided_at       date,
  decision_status  text check (decision_status in
    ('proposed','accepted','rejected','revisited','superseded')),

  created_by   uuid not null references public.users(id),
  updated_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,                            -- soft-archive (active vs archived)
  deleted_at   timestamptz,                            -- reserved for hard-delete admin cleanup

  -- Personal records are not branch-scoped. Enforced at the DB layer so
  -- a buggy RPC can't accidentally violate it.
  constraint notes_personal_no_branch check (
    visibility <> 'personal' or branch is null
  )
);

comment on table public.notes is
  'Phase H3.1 — unstructured memory: decisions, meetings, ideas, lessons, incidents, general notes. Visibility=personal is creator-only and admin/CEO do NOT bypass.';
comment on column public.notes.module is
  'Cross-cutting categorisation (operations, finance, hr, …). Distinct from visibility — "module=personal" does NOT imply "visibility=personal".';
comment on column public.notes.decision_status is
  'Only meaningful when kind=''decision''. Lifecycle: proposed → accepted/rejected → revisited/superseded.';

create index if not exists idx_notes_title_lower
  on public.notes (lower(coalesce(title, ''))) where deleted_at is null;
create index if not exists idx_notes_kind_module
  on public.notes (kind, module) where deleted_at is null;
create index if not exists idx_notes_updated_at
  on public.notes (updated_at desc) where deleted_at is null;
create index if not exists idx_notes_personal
  on public.notes (created_by)
  where visibility = 'personal' and deleted_at is null;

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. RLS — strict by design
-- =====================================================================

alter table public.notes enable row level security;
drop policy if exists notes_select_visible on public.notes;
create policy notes_select_visible on public.notes
  for select to authenticated using (
    deleted_at is null
    and (
      (visibility = 'personal' and created_by = auth.uid())
      or
      (visibility = 'work' and (
        public.current_user_role() in ('admin','ceo')
        or (branch is not null and public.current_user_can_access_branch(branch))
      ))
    )
  );

-- =====================================================================
-- 3. Helpers — visibility + writability for SECURITY DEFINER RPCs.
-- =====================================================================

create or replace function public._note_visible(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_branch     text;
  v_creator    uuid;
  v_role       text := public.current_user_role();
begin
  select visibility, branch, created_by
    into v_visibility, v_branch, v_creator
    from public.notes
   where id = p_id and deleted_at is null;
  if not found then return false; end if;
  if v_visibility = 'personal' then
    return v_creator = auth.uid();
  end if;
  -- visibility = 'work'
  if v_role in ('admin','ceo') then return true; end if;
  if v_branch is null then return false; end if;
  return public.current_user_can_access_branch(v_branch);
end;
$$;

-- Personal notes are writable ONLY by the creator (admin/CEO do not
-- bypass). Work notes are writable when the caller can access them and
-- has the mutator role.
create or replace function public._note_writable(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_creator    uuid;
begin
  if not public._can_mutate() then return false; end if;
  select visibility, created_by
    into v_visibility, v_creator
    from public.notes
   where id = p_id and deleted_at is null;
  if not found then return false; end if;
  if v_visibility = 'personal' then
    return v_creator = auth.uid();
  end if;
  return public._note_visible(p_id);
end;
$$;

-- =====================================================================
-- 4. RPCs
-- =====================================================================

create or replace function public.rpc_create_note(
  p_body_md         text,
  p_title           text default null,
  p_kind            text default 'note',
  p_module          text default 'general',
  p_visibility      text default 'work',
  p_branch          text default null,
  p_decision_reason text default null,
  p_decision_impact text default null,
  p_decided_at      date default null,
  p_decision_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public._require_auth();
  v_role text := public.current_user_role();
  v_row  notes;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create notes' using errcode = '42501';
  end if;
  if p_body_md is null or length(btrim(p_body_md)) = 0 then
    raise exception 'body_md is required' using errcode = '22023';
  end if;
  if p_kind not in ('note','decision','meeting','idea','lesson','incident') then
    raise exception 'invalid kind %', p_kind using errcode = '22023';
  end if;
  if p_module not in ('general','personal','finance','supplier','maintenance','hr',
                      'operations','marketing','catering','knowledge') then
    raise exception 'invalid module %', p_module using errcode = '22023';
  end if;
  if p_visibility not in ('work','personal') then
    raise exception 'invalid visibility %', p_visibility using errcode = '22023';
  end if;

  -- Validation gates:
  --   * personal requires branch IS NULL (also enforced by CHECK).
  --   * work + null branch is admin/CEO only.
  --   * work + set branch needs branch access for non-admin/CEO.
  if p_visibility = 'personal' and p_branch is not null then
    raise exception 'personal notes cannot be branch-scoped' using errcode = '22023';
  end if;
  if p_visibility = 'work' and p_branch is null
     and v_role not in ('admin','ceo') then
    raise exception 'only admin/CEO can create branchless work notes'
      using errcode = '42501';
  end if;
  if p_visibility = 'work' and p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  insert into notes(
    title, body_md, kind, module, visibility, branch,
    decision_reason, decision_impact, decided_at, decision_status,
    created_by, updated_by
  ) values (
    nullif(btrim(p_title), ''), p_body_md, p_kind, p_module, p_visibility, p_branch,
    nullif(p_decision_reason, ''), nullif(p_decision_impact, ''),
    p_decided_at,
    case when p_decision_status in
      ('proposed','accepted','rejected','revisited','superseded')
      then p_decision_status else null end,
    v_uid, v_uid
  ) returning * into v_row;

  insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
  values (v_uid, 'note_created', 'note', v_row.id,
          jsonb_build_object(
            'kind', v_row.kind, 'module', v_row.module,
            'visibility', v_row.visibility, 'branch', v_row.branch
          ),
          'web');

  -- Decisions: also log a decision_recorded row so the decision trail
  -- is queryable independently from generic note_created/updated.
  if v_row.kind = 'decision' then
    insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
    values (v_uid, 'decision_recorded', 'note', v_row.id,
            jsonb_build_object(
              'decision_status', v_row.decision_status,
              'decided_at',     v_row.decided_at
            ),
            'web');
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_create_note(text,text,text,text,text,text,text,text,date,text) to authenticated;


create or replace function public.rpc_update_note(
  p_id      uuid,
  p_patches jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before notes;
  v_after  notes;
  v_new_visibility text;
  v_new_branch     text;
  v_decision_changed boolean := false;
begin
  if not public._note_writable(p_id) then
    raise exception 'note % not writable', p_id using errcode = '42501';
  end if;
  select * into v_before from notes where id = p_id and deleted_at is null;

  v_new_visibility := coalesce(
    case when p_patches ? 'visibility' and (p_patches->>'visibility') in ('work','personal')
         then p_patches->>'visibility' end,
    v_before.visibility);

  v_new_branch := case
    when p_patches ? 'branch' then nullif(p_patches->>'branch', '')
    else v_before.branch
  end;

  -- Re-apply the same gates as create on the new (visibility, branch).
  if v_new_visibility = 'personal' and v_new_branch is not null then
    raise exception 'personal notes cannot be branch-scoped' using errcode = '22023';
  end if;
  if v_new_visibility = 'work' and v_new_branch is null
     and v_role not in ('admin','ceo') then
    raise exception 'only admin/CEO can leave work notes branchless'
      using errcode = '42501';
  end if;
  if v_new_visibility = 'work' and v_new_branch is not null
     and v_new_branch is distinct from v_before.branch then
    perform public._require_branch_access(v_new_branch);
  end if;

  update notes set
    title            = case when p_patches ? 'title' then nullif(btrim(p_patches->>'title'), '') else title end,
    body_md          = case when p_patches ? 'body_md' then p_patches->>'body_md' else body_md end,
    kind             = case when p_patches ? 'kind'
                              and (p_patches->>'kind') in ('note','decision','meeting','idea','lesson','incident')
                              then p_patches->>'kind' else kind end,
    module           = case when p_patches ? 'module'
                              and (p_patches->>'module') in
                                ('general','personal','finance','supplier','maintenance','hr',
                                 'operations','marketing','catering','knowledge')
                              then p_patches->>'module' else module end,
    visibility       = v_new_visibility,
    branch           = v_new_branch,
    decision_reason  = case when p_patches ? 'decision_reason'  then nullif(p_patches->>'decision_reason', '')  else decision_reason end,
    decision_impact  = case when p_patches ? 'decision_impact'  then nullif(p_patches->>'decision_impact', '')  else decision_impact end,
    decided_at       = case when p_patches ? 'decided_at'
                              then nullif(p_patches->>'decided_at', '')::date
                              else decided_at end,
    decision_status  = case when p_patches ? 'decision_status'
                              and (p_patches->>'decision_status') in
                                ('proposed','accepted','rejected','revisited','superseded')
                              then p_patches->>'decision_status' else decision_status end,
    updated_by       = v_uid
   where id = p_id
   returning * into v_after;

  -- Fire decision_recorded when:
  --   * kind transitioned to 'decision', OR
  --   * already a decision and decision_status changed (including initial set).
  if (v_after.kind = 'decision'
      and (v_before.kind <> 'decision'
           or v_after.decision_status is distinct from v_before.decision_status))
  then
    v_decision_changed := true;
  end if;

  insert into audit_log(user_id, action, entity_type, entity_id, before_state, after_state, source)
  values (v_uid, 'note_updated', 'note', p_id, to_jsonb(v_before), to_jsonb(v_after), 'web');

  if v_decision_changed then
    insert into audit_log(user_id, action, entity_type, entity_id, after_state, source)
    values (v_uid, 'decision_recorded', 'note', p_id,
            jsonb_build_object(
              'decision_status', v_after.decision_status,
              'decided_at',      v_after.decided_at,
              'previous_status', v_before.decision_status
            ),
            'web');
  end if;

  return to_jsonb(v_after);
end;
$$;

grant execute on function public.rpc_update_note(uuid, jsonb) to authenticated;


create or replace function public.rpc_archive_note(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row notes;
begin
  if not public._note_writable(p_id) then
    raise exception 'note % not writable', p_id using errcode = '42501';
  end if;
  update notes set archived_at = now(), updated_by = v_uid
    where id = p_id and archived_at is null
    returning * into v_row;
  if v_row.id is null then
    -- Already archived: idempotent return of the current row.
    select * into v_row from notes where id = p_id;
  end if;
  insert into audit_log(user_id, action, entity_type, entity_id, source)
  values (v_uid, 'note_archived', 'note', p_id, 'web');
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_archive_note(uuid) to authenticated;


create or replace function public.rpc_unarchive_note(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._require_auth();
  v_row notes;
begin
  if not public._note_writable(p_id) then
    raise exception 'note % not writable', p_id using errcode = '42501';
  end if;
  update notes set archived_at = null, updated_by = v_uid
    where id = p_id and archived_at is not null
    returning * into v_row;
  if v_row.id is null then
    select * into v_row from notes where id = p_id;
  end if;
  insert into audit_log(user_id, action, entity_type, entity_id, source)
  values (v_uid, 'note_unarchived', 'note', p_id, 'web');
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_unarchive_note(uuid) to authenticated;


create or replace function public.rpc_get_note(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row notes;
begin
  perform public._require_auth();
  if not public._note_visible(p_id) then
    return null;
  end if;
  select * into v_row from notes where id = p_id;
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.rpc_get_note(uuid) to authenticated;


create or replace function public.rpc_list_notes(
  p_kind             text default null,
  p_module           text default null,
  p_visibility       text default null,
  p_branch           text default null,
  p_search           text default null,
  p_include_archived boolean default false,
  p_limit            int default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_lim    int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  with eligible as (
    select n.*
      from notes n
     where n.deleted_at is null
       and (p_include_archived or n.archived_at is null)
       and (p_kind is null or n.kind = p_kind)
       and (p_module is null or n.module = p_module)
       and (p_visibility is null or n.visibility = p_visibility)
       and (p_branch is null or n.branch = p_branch)
       and (
         -- Mirror notes_select_visible inline (SECURITY DEFINER bypasses RLS).
         (n.visibility = 'personal' and n.created_by = v_uid)
         or
         (n.visibility = 'work' and (
           v_role in ('admin','ceo')
           or (n.branch is not null and public.current_user_can_access_branch(n.branch))
         ))
       )
       and (p_search is null or p_search = ''
            or coalesce(n.title, '') ilike '%' || p_search || '%'
            or n.body_md ilike '%' || p_search || '%')
  )
  select coalesce(jsonb_agg(to_jsonb(e) order by e.updated_at desc), '[]'::jsonb)
    into v_result
    from (select * from eligible order by updated_at desc limit v_lim) e;
  return v_result;
end;
$$;

grant execute on function public.rpc_list_notes(text,text,text,text,text,boolean,int) to authenticated;

-- =====================================================================
-- 5. Module column on existing entities (additive, nullable).
-- =====================================================================
-- Module is a categorisation tag; NOT an access-control surface. The
-- existing branch-based RLS on these tables is unchanged.

do $do$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tasks' and column_name='module'
  ) then
    alter table public.tasks
      add column module text
      check (module is null or module in
        ('general','personal','finance','supplier','maintenance','hr',
         'operations','marketing','catering','knowledge'));
    comment on column public.tasks.module is
      'Phase H3.1 — optional cross-cutting module tag (general/finance/hr/operations/etc.). Voluntary adoption; not an access-control field.';
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='follow_ups' and column_name='module'
  ) then
    alter table public.follow_ups
      add column module text
      check (module is null or module in
        ('general','personal','finance','supplier','maintenance','hr',
         'operations','marketing','catering','knowledge'));
    comment on column public.follow_ups.module is
      'Phase H3.1 — optional cross-cutting module tag. Voluntary adoption; not an access-control field.';
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='purchase_requests' and column_name='module'
  ) then
    alter table public.purchase_requests
      add column module text
      check (module is null or module in
        ('general','personal','finance','supplier','maintenance','hr',
         'operations','marketing','catering','knowledge'));
    comment on column public.purchase_requests.module is
      'Phase H3.1 — optional cross-cutting module tag. Voluntary adoption; not an access-control field.';
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='documents' and column_name='module'
  ) then
    alter table public.documents
      add column module text
      check (module is null or module in
        ('general','personal','finance','supplier','maintenance','hr',
         'operations','marketing','catering','knowledge'));
    comment on column public.documents.module is
      'Phase H3.1 — optional cross-cutting module tag. Voluntary adoption; not an access-control field. Distinct from documents.category which is the type of document.';
  end if;
end
$do$;

commit;
