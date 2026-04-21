-- Rabih Ops V1 — RLS policies
-- Mirrors Part 9 of PLAN.md.
--
-- Rule: every mutation goes through a SECURITY DEFINER RPC. Tables therefore
-- expose SELECT policies only; direct INSERT/UPDATE/DELETE from the anon/
-- authenticated roles is denied by default (no policy = no access).

begin;

-- =========================================================
-- Helper: branch access check used by policies and RPCs.
-- =========================================================

create or replace function public.current_user_can_access_branch(p_branch text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_branch is null then
    return true;
  end if;
  select role, branches into r from public.users where id = auth.uid();
  if r is null then
    return false;
  end if;
  if r.role in ('admin','ceo') then
    return true;
  end if;
  if 'all' = any(r.branches) then
    return true;
  end if;
  return p_branch = any(r.branches);
end;
$$;

comment on function public.current_user_can_access_branch(text) is
  'Returns true if the calling auth.uid() may access rows for the given branch code. Admin/CEO bypass branch array.';

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

comment on function public.current_user_role() is 'Convenience accessor for the caller''s role.';

-- =========================================================
-- Enable RLS everywhere.
-- =========================================================

alter table public.users               enable row level security;
alter table public.branches            enable row level security;
alter table public.tasks               enable row level security;
alter table public.follow_ups          enable row level security;
alter table public.inspections         enable row level security;
alter table public.inspection_findings enable row level security;
alter table public.audit_log           enable row level security;
alter table public.whatsapp_messages   enable row level security;

-- =========================================================
-- users
-- =========================================================

drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_user_role() in ('admin','ceo')
  );

-- =========================================================
-- branches — readable to any authenticated user.
-- =========================================================

drop policy if exists branches_select_authenticated on public.branches;
create policy branches_select_authenticated on public.branches
  for select to authenticated
  using (true);

-- =========================================================
-- tasks
-- =========================================================

drop policy if exists tasks_select_by_branch on public.tasks;
create policy tasks_select_by_branch on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and public.current_user_can_access_branch(branch)
  );

-- =========================================================
-- follow_ups
-- =========================================================

drop policy if exists follow_ups_select_by_branch on public.follow_ups;
create policy follow_ups_select_by_branch on public.follow_ups
  for select to authenticated
  using (
    deleted_at is null
    and (
      branch is null
      or public.current_user_can_access_branch(branch)
    )
  );

-- =========================================================
-- inspections + findings
-- =========================================================

drop policy if exists inspections_select_by_branch on public.inspections;
create policy inspections_select_by_branch on public.inspections
  for select to authenticated
  using (
    deleted_at is null
    and public.current_user_can_access_branch(branch)
  );

drop policy if exists findings_select_parent_visible on public.inspection_findings;
create policy findings_select_parent_visible on public.inspection_findings
  for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_findings.inspection_id
        and i.deleted_at is null
        and public.current_user_can_access_branch(i.branch)
    )
  );

-- =========================================================
-- audit_log — admins / CEO only.
-- =========================================================

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (public.current_user_role() in ('admin','ceo'));

-- =========================================================
-- whatsapp_messages — admins / CEO only.
-- =========================================================

drop policy if exists whatsapp_select_admin on public.whatsapp_messages;
create policy whatsapp_select_admin on public.whatsapp_messages
  for select to authenticated
  using (public.current_user_role() in ('admin','ceo'));

commit;
