-- Rabih Ops — Shared comments + attachments infrastructure (additive)
-- Replaces task_comments / task_attachments with polymorphic shared tables
-- that every module can write to. Storage moves to a single bucket
-- (rabih-ops-attachments) keyed by <entity_type>/<entity_id>/<file>.
--
-- This migration is ADDITIVE only:
--   1. Shared `comments` and `attachments` tables + indexes + RLS
--   2. _can_access_entity(entity_type, entity_id) helper
--   3. Internal write helpers _add_comment / _delete_comment /
--      _add_attachment / _remove_attachment
--   4. New rabih-ops-attachments bucket + path-aware storage policies
--   5. rpc_get_task rewritten to read from the shared tables
--   6. Task RPCs rewritten as thin wrappers around the helpers
--
-- The destructive cleanup (drop old bucket + tables) lives in the next
-- migration so we can verify _can_access_entity behaviour against the
-- transitional state before the legacy schema disappears.

begin;

-- =========================================================
-- 1. Shared comments table
-- =========================================================

create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  body         text not null check (length(body) between 1 and 5000),
  author_id    uuid not null references public.users(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table  public.comments is 'Polymorphic comments. Every module writes here via _add_comment(entity_type, entity_id, body).';
comment on column public.comments.entity_type is 'Module key: task | follow_up | inspection | purchase_request | … . No FK — entity tables are independent.';
comment on column public.comments.entity_id is 'UUID of the row in the entity_type table.';
comment on column public.comments.author_id is 'User who wrote the comment.';
comment on column public.comments.deleted_at is 'Soft-delete timestamp. Null = visible.';

create index if not exists idx_comments_entity
  on public.comments (entity_type, entity_id, created_at desc) where deleted_at is null;
create index if not exists idx_comments_author
  on public.comments (author_id, created_at desc);

drop trigger if exists trg_comments_updated_at on public.comments;
create trigger trg_comments_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

-- =========================================================
-- 2. Shared attachments table
-- =========================================================

create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     uuid not null,
  storage_path  text not null unique,
  file_name     text not null check (length(file_name) between 1 and 255),
  mime_type     text not null,
  file_size     int  not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by   uuid not null references public.users(id),
  created_at    timestamptz not null default now()
);

comment on table  public.attachments is 'Polymorphic attachments. storage_path lives in the rabih-ops-attachments bucket and follows <entity_type>/<entity_id>/<file>.';
comment on column public.attachments.entity_type is 'Module key matching comments.entity_type.';
comment on column public.attachments.storage_path is 'Format: <entity_type>/<entity_id>/<uuid>-<safe-filename>. Unique across the bucket.';
comment on column public.attachments.file_size is 'Bytes. Capped at 10 MB by CHECK and bucket file_size_limit.';

create index if not exists idx_attachments_entity
  on public.attachments (entity_type, entity_id, created_at desc);

-- =========================================================
-- 3. Polymorphic access helper
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
  -- Each module adds a branch lookup branch here as it ships.
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
    -- follow_ups allow null branch = visible to any authenticated user
    if v_found and v_branch is null then
      return true;
    end if;
  elsif p_entity_type = 'inspection' then
    select i.branch into v_branch
      from public.inspections i
     where i.id = p_entity_id and i.deleted_at is null;
    v_found := found;
  else
    return false;
  end if;

  if not v_found then
    return false;
  end if;
  return public.current_user_can_access_branch(v_branch);
end;
$$;

comment on function public._can_access_entity(text, uuid) is
  'Returns true if the calling user can access the parent entity. Add a branch in this CASE for each new module that has comments/attachments.';

-- =========================================================
-- RLS on the shared tables
-- =========================================================

alter table public.comments    enable row level security;
alter table public.attachments enable row level security;

drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible on public.comments
  for select to authenticated
  using (
    deleted_at is null
    and public._can_access_entity(entity_type, entity_id)
  );

drop policy if exists attachments_select_visible on public.attachments;
create policy attachments_select_visible on public.attachments
  for select to authenticated
  using (public._can_access_entity(entity_type, entity_id));

-- =========================================================
-- 4. Internal write helpers (called only from public RPCs)
-- =========================================================

create or replace function public._add_comment(
  p_entity_type text,
  p_entity_id   uuid,
  p_body        text
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
    raise exception 'role cannot comment' using errcode = '42501';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'comment body is required' using errcode = '22023';
  end if;

  insert into comments(entity_type, entity_id, body, author_id)
  values (p_entity_type, p_entity_id, btrim(p_body), v_uid)
  returning * into v_row;

  perform public._audit('comment', p_entity_type, p_entity_id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public._add_comment(text, uuid, text) is
  'Internal: insert a comment + write audit. Caller (a public RPC) must validate branch access before invoking.';

create or replace function public._delete_comment(
  p_comment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before comments;
  v_after  comments;
begin
  select * into v_before from comments where id = p_comment_id and deleted_at is null;
  if v_before is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  if v_before.author_id <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'only the author or admin/ceo can delete a comment' using errcode = '42501';
  end if;

  update comments set deleted_at = now() where id = p_comment_id
  returning * into v_after;

  perform public._audit('comment_delete', v_before.entity_type, v_before.entity_id, to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', p_comment_id);
end;
$$;

comment on function public._delete_comment(uuid) is
  'Internal: soft-delete a comment + write audit. Author or admin/ceo only.';

create or replace function public._add_attachment(
  p_entity_type  text,
  p_entity_id    uuid,
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
  if p_storage_path !~ ('^' || p_entity_type || '/' || p_entity_id::text || '/.+') then
    raise exception 'storage_path must be under %/%', p_entity_type, p_entity_id using errcode = '22023';
  end if;

  insert into attachments(entity_type, entity_id, storage_path, file_name, mime_type, file_size, uploaded_by)
  values (p_entity_type, p_entity_id, p_storage_path, p_file_name, p_mime_type, p_file_size, v_uid)
  returning * into v_row;

  perform public._audit('attach', p_entity_type, p_entity_id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public._add_attachment(text, uuid, text, text, text, int) is
  'Internal: record attachment metadata after Storage upload + write audit. Caller must validate branch access.';

create or replace function public._remove_attachment(
  p_attachment_id uuid
) returns jsonb
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
  if v_before.uploaded_by <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'only the uploader or admin/ceo can remove an attachment' using errcode = '42501';
  end if;

  delete from attachments where id = p_attachment_id;

  perform public._audit('detach', v_before.entity_type, v_before.entity_id, to_jsonb(v_before), null);
  return jsonb_build_object('success', true, 'id', p_attachment_id);
end;
$$;

comment on function public._remove_attachment(uuid) is
  'Internal: delete attachment metadata + write audit. Storage object becomes an orphan. Uploader or admin/ceo only.';

-- =========================================================
-- 5. New shared storage bucket
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rabih-ops-attachments',
  'rabih-ops-attachments',
  false,
  10485760,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rabih_ops_attachments_storage_select on storage.objects;
create policy rabih_ops_attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rabih-ops-attachments'
    and exists (
      select 1
        from public.attachments a
       where a.storage_path = name
         and public._can_access_entity(a.entity_type, a.entity_id)
    )
  );

drop policy if exists rabih_ops_attachments_storage_insert on storage.objects;
create policy rabih_ops_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rabih-ops-attachments'
    and array_length(string_to_array(name, '/'), 1) >= 3
    and public._can_access_entity(
      split_part(name, '/', 1),
      (split_part(name, '/', 2))::uuid
    )
  );

-- =========================================================
-- 6. Update rpc_get_task to read from the shared tables
-- =========================================================

create or replace function public.rpc_get_task(
  p_task_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_task        tasks;
  v_comments    jsonb;
  v_attachments jsonb;
  v_audit       jsonb;
begin
  perform public._require_auth();

  select * into v_task from tasks where id = p_task_id and deleted_at is null;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_task.branch);

  select coalesce(jsonb_agg(c order by c.created_at asc), '[]'::jsonb)
    into v_comments
  from (
    select cc.*, u.full_name as author_name
      from comments cc
      join users u on u.id = cc.author_id
     where cc.entity_type = 'task'
       and cc.entity_id = p_task_id
       and cc.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
    into v_attachments
  from (
    select aa.*, u.full_name as uploader_name
      from attachments aa
      join users u on u.id = aa.uploaded_by
     where aa.entity_type = 'task'
       and aa.entity_id = p_task_id
  ) a;

  select coalesce(jsonb_agg(al order by al.created_at desc), '[]'::jsonb)
    into v_audit
  from (
    select l.id, l.action, l.before_state, l.after_state,
           l.created_at, l.user_id,
           coalesce(u.full_name, 'system') as user_name
      from audit_log l
      left join users u on u.id = l.user_id
     where l.entity_type = 'task' and l.entity_id = p_task_id
     order by l.created_at desc
     limit 50
  ) al;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'comments', v_comments,
    'attachments', v_attachments,
    'audit', v_audit
  );
end;
$$;

-- =========================================================
-- 7. Tasks comment/attachment RPCs become thin wrappers
-- =========================================================

create or replace function public.rpc_add_task_comment(
  p_task_id uuid,
  p_body    text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks;
begin
  perform public._require_auth();
  select * into v_task from tasks where id = p_task_id and deleted_at is null;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_task.branch);
  return public._add_comment('task', p_task_id, p_body);
end;
$$;

comment on function public.rpc_add_task_comment(uuid, text) is
  'Adds a comment on a task. Wrapper over _add_comment.';

create or replace function public.rpc_delete_task_comment(
  p_comment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment comments;
  v_task    tasks;
begin
  perform public._require_auth();
  select * into v_comment
    from comments
   where id = p_comment_id and entity_type = 'task' and deleted_at is null;
  if v_comment is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  select * into v_task from tasks where id = v_comment.entity_id and deleted_at is null;
  perform public._require_branch_access(v_task.branch);
  return public._delete_comment(p_comment_id);
end;
$$;

comment on function public.rpc_delete_task_comment(uuid) is
  'Soft-deletes a comment on a task. Wrapper over _delete_comment.';

create or replace function public.rpc_attach_file_to_task(
  p_task_id      uuid,
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
  v_task tasks;
begin
  perform public._require_auth();
  select * into v_task from tasks where id = p_task_id and deleted_at is null;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_task.branch);
  return public._add_attachment('task', p_task_id, p_storage_path, p_file_name, p_mime_type, p_file_size);
end;
$$;

comment on function public.rpc_attach_file_to_task(uuid, text, text, text, int) is
  'Records an attachment on a task. Wrapper over _add_attachment.';

create or replace function public.rpc_remove_task_attachment(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment attachments;
  v_task       tasks;
begin
  perform public._require_auth();
  select * into v_attachment
    from attachments
   where id = p_attachment_id and entity_type = 'task';
  if v_attachment is null then
    raise exception 'attachment % not found', p_attachment_id using errcode = 'P0002';
  end if;
  select * into v_task from tasks where id = v_attachment.entity_id and deleted_at is null;
  perform public._require_branch_access(v_task.branch);
  return public._remove_attachment(p_attachment_id);
end;
$$;

comment on function public.rpc_remove_task_attachment(uuid) is
  'Removes an attachment metadata row on a task. Wrapper over _remove_attachment.';

-- =========================================================
-- Grants
-- =========================================================

-- Internal helpers are NOT granted to authenticated. Only public RPCs are.
-- The public task RPCs already had grants from the prior migration; their
-- signatures are unchanged so existing grants persist.

commit;
