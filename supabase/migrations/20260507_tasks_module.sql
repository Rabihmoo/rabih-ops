-- Rabih Ops — Tasks module
-- Adds:
--   * task_comments, task_attachments tables
--   * storage bucket "task-attachments" + storage.objects policies
--   * SELECT-only RLS on the new tables (writes go through RPCs)
--   * 6 new RPCs: rpc_list_tasks, rpc_get_task,
--                 rpc_add_task_comment, rpc_delete_task_comment,
--                 rpc_attach_file_to_task, rpc_remove_task_attachment
-- Existing rpc_create_task / rpc_update_task / rpc_complete_task / rpc_delete_task are unchanged.

begin;

-- =========================================================
-- task_comments
-- =========================================================

create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid not null references public.users(id),
  body        text not null check (length(body) between 1 and 5000),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.task_comments is 'Comments on tasks. Soft-deletable by author or admin/ceo.';
comment on column public.task_comments.task_id is 'Parent task. Cascade-deleted when the task row is hard-deleted (rare).';
comment on column public.task_comments.author_id is 'User who wrote the comment.';
comment on column public.task_comments.body is 'Plain text, 1..5000 chars.';
comment on column public.task_comments.deleted_at is 'Soft-delete timestamp. Null = visible.';

create index if not exists idx_task_comments_task_created
  on public.task_comments (task_id, created_at desc) where deleted_at is null;

drop trigger if exists trg_task_comments_updated_at on public.task_comments;
create trigger trg_task_comments_updated_at
before update on public.task_comments
for each row execute function public.set_updated_at();

-- =========================================================
-- task_attachments
-- =========================================================

create table if not exists public.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  uploaded_by   uuid not null references public.users(id),
  storage_path  text not null unique,
  file_name     text not null check (length(file_name) between 1 and 255),
  mime_type     text not null,
  file_size     int  not null check (file_size > 0 and file_size <= 10485760),
  created_at    timestamptz not null default now()
);

comment on table  public.task_attachments is 'File attachments on tasks. Storage object lives in the task-attachments bucket; storage_path is the canonical key.';
comment on column public.task_attachments.task_id is 'Parent task. Cascade-deleted when the task row is hard-deleted.';
comment on column public.task_attachments.uploaded_by is 'User who uploaded the file.';
comment on column public.task_attachments.storage_path is 'Format: tasks/<task_id>/<uuid>-<safe-filename>. Unique across the bucket.';
comment on column public.task_attachments.file_size is 'Bytes. Capped at 10 MB by CHECK constraint and bucket file_size_limit.';

create index if not exists idx_task_attachments_task_created
  on public.task_attachments (task_id, created_at desc);

-- =========================================================
-- RLS on new tables (SELECT-only — writes via RPCs)
-- =========================================================

alter table public.task_comments    enable row level security;
alter table public.task_attachments enable row level security;

drop policy if exists task_comments_select_visible on public.task_comments;
create policy task_comments_select_visible on public.task_comments
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and t.deleted_at is null
        and public.current_user_can_access_branch(t.branch)
    )
  );

drop policy if exists task_attachments_select_visible on public.task_attachments;
create policy task_attachments_select_visible on public.task_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_attachments.task_id
        and t.deleted_at is null
        and public.current_user_can_access_branch(t.branch)
    )
  );

-- =========================================================
-- Storage bucket — REMOVED in 20260508/20260509 refactor
-- =========================================================
-- The task-attachments bucket and its storage.objects policies have been
-- replaced by the polymorphic rabih-ops-attachments bucket (see migration
-- 20260508_shared_comments_attachments.sql). The original CREATE for the
-- task-attachments bucket was removed from this file so re-runs of db:push
-- don't resurrect it; the bucket itself was deleted via Storage REST API.

-- =========================================================
-- RPC: rpc_list_tasks
-- =========================================================

create or replace function public.rpc_list_tasks(
  p_branch        text    default null,
  p_status        text    default null,
  p_assigned_to   uuid    default null,
  p_due_before    date    default null,
  p_due_after     date    default null,
  p_search        text    default null,
  p_include_done  boolean default false,
  p_limit         int     default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date := current_date;
  v_result jsonb;
begin
  perform public._require_auth();
  if p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;

  select coalesce(jsonb_agg(t order by
            (case when t.due_date is not null
                       and t.due_date < v_today
                       and t.status not in ('done','cancelled')
                  then 0 else 1 end),
            t.due_date nulls last,
            (case t.priority when 'urgent' then 0 when 'normal' then 1 else 2 end),
            t.created_at desc
          ), '[]'::jsonb)
    into v_result
  from (
    select tt.*
      from tasks tt
     where tt.deleted_at is null
       and public.current_user_can_access_branch(tt.branch)
       and (p_branch       is null or tt.branch       = p_branch)
       and (p_status       is null or tt.status       = p_status)
       and (p_assigned_to  is null or tt.assigned_to  = p_assigned_to)
       and (p_due_before   is null or tt.due_date    <= p_due_before)
       and (p_due_after    is null or tt.due_date    >= p_due_after)
       and (p_include_done or tt.status <> 'done')
       and (p_search is null
            or tt.title ilike '%' || p_search || '%'
            or coalesce(tt.description,'') ilike '%' || p_search || '%')
     limit greatest(coalesce(p_limit, 100), 1)
  ) t;

  return v_result;
end;
$$;

comment on function public.rpc_list_tasks(text,text,uuid,date,date,text,boolean,int) is
  'Filtered jsonb array of tasks the caller can access. Sort: overdue first, then due_date asc, priority. p_include_done=false hides done.';

-- =========================================================
-- RPC: rpc_get_task
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
      from task_comments cc
      join users u on u.id = cc.author_id
     where cc.task_id = p_task_id and cc.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
    into v_attachments
  from (
    select aa.*, u.full_name as uploader_name
      from task_attachments aa
      join users u on u.id = aa.uploaded_by
     where aa.task_id = p_task_id
  ) a;

  -- audit_log read here under SECURITY DEFINER so managers see history without
  -- needing direct SELECT access on audit_log.
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

comment on function public.rpc_get_task(uuid) is
  'Returns a task with nested comments, attachments, and recent (50) audit entries.';

-- =========================================================
-- RPC: rpc_add_task_comment
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
  v_uid  uuid := public._require_auth();
  v_task tasks;
  v_row  task_comments;
begin
  if not public._can_mutate() then
    raise exception 'role cannot comment on tasks' using errcode = '42501';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'comment body is required' using errcode = '22023';
  end if;

  select * into v_task from tasks where id = p_task_id and deleted_at is null;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_task.branch);

  insert into task_comments(task_id, author_id, body)
  values (p_task_id, v_uid, btrim(p_body))
  returning * into v_row;

  perform public._audit('comment','task', p_task_id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_add_task_comment(uuid, text) is
  'Adds a comment to a task. Audited as action=comment entity_type=task.';

-- =========================================================
-- RPC: rpc_delete_task_comment
-- =========================================================

create or replace function public.rpc_delete_task_comment(
  p_comment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before task_comments;
  v_after  task_comments;
  v_task   tasks;
begin
  select * into v_before from task_comments where id = p_comment_id and deleted_at is null;
  if v_before is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  if v_before.author_id <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'only the author or admin/ceo can delete a comment' using errcode = '42501';
  end if;
  select * into v_task from tasks where id = v_before.task_id and deleted_at is null;
  perform public._require_branch_access(v_task.branch);

  update task_comments set deleted_at = now() where id = p_comment_id
  returning * into v_after;

  perform public._audit('comment_delete','task', v_before.task_id, to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('success', true, 'id', p_comment_id);
end;
$$;

comment on function public.rpc_delete_task_comment(uuid) is
  'Soft-deletes a comment. Author or admin/ceo only.';

-- =========================================================
-- RPC: rpc_attach_file_to_task
-- =========================================================

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
  v_uid  uuid := public._require_auth();
  v_task tasks;
  v_row  task_attachments;
begin
  if not public._can_mutate() then
    raise exception 'role cannot attach files' using errcode = '42501';
  end if;

  select * into v_task from tasks where id = p_task_id and deleted_at is null;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  perform public._require_branch_access(v_task.branch);

  -- storage_path must be tasks/<task_id>/<anything>
  if p_storage_path !~ ('^tasks/' || p_task_id::text || '/.+') then
    raise exception 'storage_path must be under tasks/%/', p_task_id using errcode = '22023';
  end if;

  insert into task_attachments(task_id, uploaded_by, storage_path, file_name, mime_type, file_size)
  values (p_task_id, v_uid, p_storage_path, p_file_name, p_mime_type, p_file_size)
  returning * into v_row;

  perform public._audit('attach','task', p_task_id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_attach_file_to_task(uuid, text, text, text, int) is
  'Records an attachment metadata row after the file is uploaded to storage. Validates path prefix and file_size cap.';

-- =========================================================
-- RPC: rpc_remove_task_attachment
-- =========================================================

create or replace function public.rpc_remove_task_attachment(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public._require_auth();
  v_role   text := public.current_user_role();
  v_before task_attachments;
  v_task   tasks;
begin
  select * into v_before from task_attachments where id = p_attachment_id;
  if v_before is null then
    raise exception 'attachment % not found', p_attachment_id using errcode = 'P0002';
  end if;
  if v_before.uploaded_by <> v_uid and v_role not in ('admin','ceo') then
    raise exception 'only the uploader or admin/ceo can remove an attachment' using errcode = '42501';
  end if;
  select * into v_task from tasks where id = v_before.task_id and deleted_at is null;
  perform public._require_branch_access(v_task.branch);

  delete from task_attachments where id = p_attachment_id;

  perform public._audit('detach','task', v_before.task_id, to_jsonb(v_before), null);
  return jsonb_build_object('success', true, 'id', p_attachment_id);
end;
$$;

comment on function public.rpc_remove_task_attachment(uuid) is
  'Removes an attachment metadata row. Storage object is left as an orphan (Phase 9 sweep). Uploader or admin/ceo only.';

-- =========================================================
-- Grants
-- =========================================================

grant execute on function public.rpc_list_tasks(text,text,uuid,date,date,text,boolean,int) to authenticated;
grant execute on function public.rpc_get_task(uuid)                                          to authenticated;
grant execute on function public.rpc_add_task_comment(uuid, text)                            to authenticated;
grant execute on function public.rpc_delete_task_comment(uuid)                               to authenticated;
grant execute on function public.rpc_attach_file_to_task(uuid, text, text, text, int)        to authenticated;
grant execute on function public.rpc_remove_task_attachment(uuid)                            to authenticated;

commit;
