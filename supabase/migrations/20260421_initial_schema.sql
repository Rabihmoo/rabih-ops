-- Rabih Ops V1 — initial schema
-- Mirrors Part 7 of PLAN.md. 8 tables:
-- users, branches, tasks, follow_ups, inspections, inspection_findings,
-- audit_log, whatsapp_messages.

begin;

-- extensions
create extension if not exists "pgcrypto";

-- =========================================================
-- Shared utilities
-- =========================================================

-- Keeps updated_at fresh on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper that bumps updated_at to NOW() on every UPDATE.';

-- =========================================================
-- users
-- =========================================================

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        text not null check (role in ('admin','ceo','manager','viewer')),
  branches    text[] not null default '{}',
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.users is 'Internal users with role-based access. Row is created by rpc_bootstrap_user after first magic-link login.';
comment on column public.users.id is 'Mirror of auth.users.id';
comment on column public.users.role is 'One of admin|ceo|manager|viewer';
comment on column public.users.branches is 'Array of branch codes user can access. Admins/CEOs ignore this (they see everything).';
comment on column public.users.phone is 'E.164 phone for WhatsApp bot matching. Optional.';

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- =========================================================
-- branches
-- =========================================================

create table if not exists public.branches (
  code        text primary key,
  name        text not null,
  color       text not null,
  created_at  timestamptz not null default now()
);

comment on table  public.branches is 'Operating branches. Seeded once — see supabase/seed.sql.';
comment on column public.branches.code is 'Short machine code used across all tables (bbqhouse, salt, centralkitchen, cleaning).';
comment on column public.branches.color is 'Hex colour used for UI badges.';

-- =========================================================
-- tasks
-- =========================================================

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  branch           text not null references public.branches(code),
  category         text not null check (category in ('operations','hr','training','maintenance','social_media','follow_up','other')),
  priority         text not null default 'normal' check (priority in ('urgent','normal','low')),
  status           text not null default 'todo' check (status in ('todo','in_progress','done','blocked','cancelled')),
  due_date         date,
  assigned_to      uuid references public.users(id),
  created_by       uuid not null references public.users(id),
  completed_at     timestamptz,
  completion_note  text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  public.tasks is 'Operational tasks across branches.';
comment on column public.tasks.deleted_at is 'Soft-delete timestamp. Null = active row.';

create index if not exists idx_tasks_branch_status on public.tasks (branch, status) where deleted_at is null;
create index if not exists idx_tasks_assigned_to on public.tasks (assigned_to) where deleted_at is null;
create index if not exists idx_tasks_due_date on public.tasks (due_date) where deleted_at is null and status <> 'done';

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- =========================================================
-- follow_ups
-- =========================================================

create table if not exists public.follow_ups (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  person        text not null,
  branch        text references public.branches(code),
  category      text not null check (category in ('call','whatsapp','email','meeting','check_in_person')),
  due_date      date not null,
  priority      text not null default 'normal' check (priority in ('urgent','normal','low')),
  status        text not null default 'pending' check (status in ('pending','done','snoozed','cancelled')),
  notes         text,
  outcome       text,
  assigned_to   uuid references public.users(id),
  created_by    uuid not null references public.users(id),
  completed_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.follow_ups is 'Follow-up reminders keyed to a specific person.';

create index if not exists idx_follow_ups_due_status on public.follow_ups (due_date, status) where deleted_at is null;
create index if not exists idx_follow_ups_assigned_to on public.follow_ups (assigned_to) where deleted_at is null;

drop trigger if exists trg_follow_ups_updated_at on public.follow_ups;
create trigger trg_follow_ups_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();

-- =========================================================
-- inspections + findings
-- =========================================================

create table if not exists public.inspections (
  id               uuid primary key default gen_random_uuid(),
  branch           text not null references public.branches(code),
  area             text not null check (area in ('kitchen','storage','service_area','cold_room','dry_store','staff_area','full_branch')),
  inspection_date  date not null,
  result           text not null default 'pending' check (result in ('pending','pass','issues_found','failed')),
  general_notes    text,
  inspected_by     uuid not null references public.users(id),
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.inspections is 'Branch inspections. Must work offline — inserted via queued RPC when reconnected.';

create index if not exists idx_inspections_branch_date on public.inspections (branch, inspection_date desc) where deleted_at is null;

drop trigger if exists trg_inspections_updated_at on public.inspections;
create trigger trg_inspections_updated_at
before update on public.inspections
for each row execute function public.set_updated_at();

create table if not exists public.inspection_findings (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.inspections(id) on delete cascade,
  severity          text not null check (severity in ('minor','major','critical')),
  description       text not null,
  action_required   text,
  responsible       text,
  follow_up_date    date,
  status            text not null default 'open' check (status in ('open','in_progress','resolved','escalated')),
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.inspection_findings is 'Individual findings discovered during an inspection.';

create index if not exists idx_findings_inspection on public.inspection_findings (inspection_id);
create index if not exists idx_findings_status on public.inspection_findings (status);

drop trigger if exists trg_findings_updated_at on public.inspection_findings;
create trigger trg_findings_updated_at
before update on public.inspection_findings
for each row execute function public.set_updated_at();

-- =========================================================
-- audit_log
-- =========================================================

create table if not exists public.audit_log (
  id           bigserial primary key,
  user_id      uuid references public.users(id),
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  before_state jsonb,
  after_state  jsonb,
  ip_address   text,
  source       text check (source in ('web','whatsapp','api')),
  created_at   timestamptz not null default now()
);

comment on table public.audit_log is 'Append-only audit trail. Written by every RPC; never deleted.';
create index if not exists idx_audit_log_entity on public.audit_log (entity_type, entity_id);
create index if not exists idx_audit_log_user on public.audit_log (user_id, created_at desc);

-- =========================================================
-- whatsapp_messages
-- =========================================================

create table if not exists public.whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null,
  direction       text not null check (direction in ('inbound','outbound')),
  message_text    text not null,
  parsed_command  text,
  parsed_params   jsonb,
  response_text   text,
  error           text,
  created_at      timestamptz not null default now()
);

comment on table public.whatsapp_messages is 'Debug log of every inbound/outbound WhatsApp message.';
create index if not exists idx_whatsapp_phone on public.whatsapp_messages (phone, created_at desc);

commit;
