-- Rabih Ops — Follow-ups module
-- Schema deltas + new and rewritten RPCs to bring follow_ups up to spec.
--
-- Schema:
--   ALTER follow_ups
--     + description text                       (replaces former `notes`)
--     + snoozed_until date                     (effective-due override)
--     + task_id uuid → tasks(id) ON DELETE SET NULL  (optional link to a task)
--     - notes                                  (renamed/dropped — no rows in staging)
--     ~ person → nullable                      (was NOT NULL)
--   New indexes:
--     idx_follow_ups_task_id            (lookup follow-ups for a task)
--     idx_follow_ups_effective_due      (sort by coalesce(snoozed_until, due_date))
--
-- RPCs:
--   rpc_create_follow_up                       drop old signature + recreate
--   rpc_update_follow_up                       NEW (jsonb-patch like rpc_update_task)
--   rpc_list_follow_ups                        NEW
--   rpc_get_follow_up                          NEW (record + shared comments/attachments + audit)
--   rpc_mark_follow_up_done                    REPLACE — add _can_mutate gate
--   rpc_snooze_follow_up                       REPLACE — sets snoozed_until; original due_date preserved.
--                                              If p_reason given, also adds a system comment via _add_comment.
--   rpc_add_follow_up_comment / rpc_delete_follow_up_comment / rpc_attach_file_to_follow_up
--   rpc_remove_follow_up_attachment            NEW thin wrappers over the shared helpers
--
-- _can_access_entity already has the 'follow_up' branch (deployed in 20260508).

begin;

-- =========================================================
-- 1. Schema changes
-- =========================================================

alter table public.follow_ups
  add column if not exists description text,
  add column if not exists snoozed_until date,
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

alter table public.follow_ups alter column person drop not null;

-- Preserve any existing notes content into description before dropping the
-- column. Defensive: zero rows on staging today, but makes this migration
-- safe to re-run on any environment that did accumulate data.
update public.follow_ups
   set description = coalesce(description, notes)
 where description is null and notes is not null;

alter table public.follow_ups drop column if exists notes;

comment on column public.follow_ups.description is 'Free-text description (replaces former `notes` column).';
comment on column public.follow_ups.snoozed_until is 'Effective-due override. List/dashboard sort uses coalesce(snoozed_until, due_date). Original due_date is preserved across snoozes.';
comment on column public.follow_ups.task_id is 'Optional FK to a parent task. Set when a follow-up is created from a task detail view.';
comment on column public.follow_ups.person is 'External contact name (nullable). Captured for follow-ups that target a person outside the RabihOS user list.';

create index if not exists idx_follow_ups_task_id
  on public.follow_ups (task_id) where deleted_at is null and task_id is not null;

create index if not exists idx_follow_ups_effective_due
  on public.follow_ups (coalesce(snoozed_until, due_date))
  where deleted_at is null and status not in ('done','cancelled');

-- =========================================================
-- 2. rpc_create_follow_up — drop old signature, recreate
-- =========================================================

drop function if exists public.rpc_create_follow_up(text, text, text, text, date, text, text);

create or replace function public.rpc_create_follow_up(
  p_category     text,
  p_title        text,
  p_due_date     date,
  p_branch       text  default null,
  p_priority     text  default 'normal',
  p_description  text  default null,
  p_person       text  default null,
  p_assigned_to  uuid  default null,
  p_task_id      uuid  default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public._require_auth();
  v_row  follow_ups;
  v_task tasks;
begin
  if not public._can_mutate() then
    raise exception 'role cannot create follow-ups' using errcode = '42501';
  end if;
  if p_branch is not null then
    perform public._require_branch_access(p_branch);
  end if;
  -- If linked to a task, the task must exist and the caller must be able to
  -- access its branch. An explicit load prevents the silent NULL-branch pass
  -- that a subquery returning no rows would cause.
  if p_task_id is not null then
    select * into v_task from public.tasks where id = p_task_id and deleted_at is null;
    if v_task is null then
      raise exception 'task % not found', p_task_id using errcode = 'P0002';
    end if;
    perform public._require_branch_access(v_task.branch);
  end if;

  insert into follow_ups(
    title, description, person, branch, category, due_date,
    priority, assigned_to, created_by, task_id
  )
  values (
    p_title, p_description, p_person, p_branch, p_category, p_due_date,
    coalesce(p_priority,'normal'), p_assigned_to, v_uid, p_task_id
  )
  returning * into v_row;

  perform public._audit('create','follow_up', v_row.id, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

comment on function public.rpc_create_follow_up(text,text,date,text,text,text,text,uuid,uuid) is
  'Creates a follow-up. Optional p_task_id links it to a parent task; branch access is checked for both the follow-up branch and the task branch.';

-- =========================================================
-- 3. rpc_update_follow_up — new (jsonb-patch)
-- =========================================================

create or replace function public.rpc_update_follow_up(
  p_follow_up_id uuid,
  p_updates      jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before  follow_ups;
  v_after   follow_ups;
  v_task    tasks;
  v_task_id uuid;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot update follow-ups' using errcode = '42501';
  end if;

  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;
  -- If branch is being changed, require access to the new branch too.
  if (p_updates ? 'branch') and (p_updates->>'branch') is not null
     and p_updates->>'branch' <> coalesce(v_before.branch,'') then
    perform public._require_branch_access(p_updates->>'branch');
  end if;
  -- If task_id is being set to a non-null value, the task must exist and the
  -- caller must be able to access its branch. Prevents linking a follow-up
  -- to a task in a branch the caller cannot otherwise reach.
  if (p_updates ? 'task_id') and nullif(p_updates->>'task_id','') is not null then
    v_task_id := (p_updates->>'task_id')::uuid;
    select * into v_task from public.tasks where id = v_task_id and deleted_at is null;
    if v_task is null then
      raise exception 'task % not found', v_task_id using errcode = 'P0002';
    end if;
    perform public._require_branch_access(v_task.branch);
  end if;

  update follow_ups
     set title         = coalesce(p_updates->>'title',        title),
         description   = coalesce(p_updates->>'description',  description),
         person        = case when p_updates ? 'person'
                               then nullif(p_updates->>'person','')
                               else person end,
         branch        = case when p_updates ? 'branch'
                               then nullif(p_updates->>'branch','')
                               else branch end,
         category      = coalesce(p_updates->>'category',     category),
         priority      = coalesce(p_updates->>'priority',     priority),
         status        = coalesce(p_updates->>'status',       status),
         due_date      = case when p_updates ? 'due_date'
                               then nullif(p_updates->>'due_date','')::date
                               else due_date end,
         snoozed_until = case when p_updates ? 'snoozed_until'
                               then nullif(p_updates->>'snoozed_until','')::date
                               else snoozed_until end,
         assigned_to   = case when p_updates ? 'assigned_to'
                               then nullif(p_updates->>'assigned_to','')::uuid
                               else assigned_to end,
         task_id       = case when p_updates ? 'task_id'
                               then nullif(p_updates->>'task_id','')::uuid
                               else task_id end,
         outcome       = coalesce(p_updates->>'outcome',      outcome)
   where id = p_follow_up_id
  returning * into v_after;

  perform public._audit('update','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_update_follow_up(uuid, jsonb) is
  'Patches a follow-up with a jsonb of updates (mirrors rpc_update_task). Use rpc_mark_follow_up_done / rpc_snooze_follow_up for completion / snooze flows.';

-- =========================================================
-- 4. rpc_list_follow_ups — new
-- =========================================================

create or replace function public.rpc_list_follow_ups(
  p_branch        text    default null,
  p_status        text    default null,
  p_category      text    default null,
  p_assigned_to   uuid    default null,
  p_due_before    date    default null,
  p_due_after     date    default null,
  p_task_id       uuid    default null,
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

  select coalesce(jsonb_agg(f order by
            (case when coalesce(f.snoozed_until, f.due_date) < v_today
                       and f.status not in ('done','cancelled') then 0 else 1 end),
            coalesce(f.snoozed_until, f.due_date) nulls last,
            (case f.priority when 'urgent' then 0 when 'normal' then 1 else 2 end),
            f.created_at desc
          ), '[]'::jsonb)
    into v_result
  from (
    select ff.*
      from follow_ups ff
     where ff.deleted_at is null
       and (ff.branch is null or public.current_user_can_access_branch(ff.branch))
       and (p_branch       is null or ff.branch       = p_branch)
       and (p_status       is null or ff.status       = p_status)
       and (p_category     is null or ff.category     = p_category)
       and (p_assigned_to  is null or ff.assigned_to  = p_assigned_to)
       and (p_task_id      is null or ff.task_id      = p_task_id)
       and (p_due_before   is null or coalesce(ff.snoozed_until, ff.due_date) <= p_due_before)
       and (p_due_after    is null or coalesce(ff.snoozed_until, ff.due_date) >= p_due_after)
       and (p_include_done or ff.status not in ('done','cancelled'))
       and (p_search is null
            or ff.title ilike '%' || p_search || '%'
            or coalesce(ff.description,'') ilike '%' || p_search || '%'
            or coalesce(ff.person,'')      ilike '%' || p_search || '%')
     limit greatest(coalesce(p_limit, 100), 1)
  ) f;

  return v_result;
end;
$$;

comment on function public.rpc_list_follow_ups(text,text,text,uuid,date,date,uuid,text,boolean,int) is
  'Filtered jsonb array of follow-ups the caller can access. Sort: overdue first by effective due, then by effective due, then priority. Effective due = coalesce(snoozed_until, due_date).';

-- =========================================================
-- 5. rpc_get_follow_up — new
-- =========================================================

create or replace function public.rpc_get_follow_up(
  p_follow_up_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_record      follow_ups;
  v_comments    jsonb;
  v_attachments jsonb;
  v_audit       jsonb;
begin
  perform public._require_auth();

  select * into v_record from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_record is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_record.branch is not null then
    perform public._require_branch_access(v_record.branch);
  end if;

  select coalesce(jsonb_agg(c order by c.created_at asc), '[]'::jsonb)
    into v_comments
  from (
    select cc.*, u.full_name as author_name
      from comments cc
      join users u on u.id = cc.author_id
     where cc.entity_type = 'follow_up'
       and cc.entity_id = p_follow_up_id
       and cc.deleted_at is null
  ) c;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
    into v_attachments
  from (
    select aa.*, u.full_name as uploader_name
      from attachments aa
      join users u on u.id = aa.uploaded_by
     where aa.entity_type = 'follow_up'
       and aa.entity_id = p_follow_up_id
  ) a;

  select coalesce(jsonb_agg(al order by al.created_at desc), '[]'::jsonb)
    into v_audit
  from (
    select l.id, l.action, l.before_state, l.after_state,
           l.created_at, l.user_id,
           coalesce(u.full_name, 'system') as user_name
      from audit_log l
      left join users u on u.id = l.user_id
     where l.entity_type = 'follow_up' and l.entity_id = p_follow_up_id
     order by l.created_at desc
     limit 50
  ) al;

  return jsonb_build_object(
    'follow_up', to_jsonb(v_record),
    'comments', v_comments,
    'attachments', v_attachments,
    'audit', v_audit
  );
end;
$$;

comment on function public.rpc_get_follow_up(uuid) is
  'Returns a follow-up with nested shared-table comments, attachments, and recent (50) audit entries.';

-- =========================================================
-- 6. rpc_mark_follow_up_done — replace (add _can_mutate gate)
-- =========================================================

create or replace function public.rpc_mark_follow_up_done(
  p_follow_up_id uuid,
  p_outcome      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before follow_ups;
  v_after  follow_ups;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot complete follow-ups' using errcode = '42501';
  end if;
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set status       = 'done',
         outcome      = p_outcome,
         completed_at = now()
   where id = p_follow_up_id
  returning * into v_after;

  perform public._audit('complete','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

-- =========================================================
-- 7. rpc_snooze_follow_up — replace (uses snoozed_until)
-- =========================================================

create or replace function public.rpc_snooze_follow_up(
  p_follow_up_id uuid,
  p_new_due_date date,
  p_reason       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before follow_ups;
  v_after  follow_ups;
begin
  perform public._require_auth();
  if not public._can_mutate() then
    raise exception 'role cannot snooze follow-ups' using errcode = '42501';
  end if;
  select * into v_before from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_before is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_before.branch is not null then
    perform public._require_branch_access(v_before.branch);
  end if;

  update follow_ups
     set status        = 'snoozed',
         snoozed_until = p_new_due_date
   where id = p_follow_up_id
  returning * into v_after;

  -- Reason captured as a system comment on the follow-up so it shows up in
  -- the activity timeline alongside user comments.
  if p_reason is not null and length(btrim(p_reason)) > 0 then
    perform public._add_comment(
      'follow_up',
      p_follow_up_id,
      '[snoozed to ' || to_char(p_new_due_date, 'YYYY-MM-DD') || '] ' || btrim(p_reason)
    );
  end if;

  perform public._audit('snooze','follow_up', p_follow_up_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

-- =========================================================
-- 8. Comment + attachment wrappers for follow_up entity
-- =========================================================

create or replace function public.rpc_add_follow_up_comment(
  p_follow_up_id uuid,
  p_body         text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record follow_ups;
begin
  perform public._require_auth();
  select * into v_record from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_record is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_record.branch is not null then
    perform public._require_branch_access(v_record.branch);
  end if;
  return public._add_comment('follow_up', p_follow_up_id, p_body);
end;
$$;

create or replace function public.rpc_delete_follow_up_comment(
  p_comment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment comments;
  v_record  follow_ups;
begin
  perform public._require_auth();
  select * into v_comment
    from comments
   where id = p_comment_id and entity_type = 'follow_up' and deleted_at is null;
  if v_comment is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  select * into v_record from follow_ups where id = v_comment.entity_id and deleted_at is null;
  if v_record.branch is not null then
    perform public._require_branch_access(v_record.branch);
  end if;
  return public._delete_comment(p_comment_id);
end;
$$;

create or replace function public.rpc_attach_file_to_follow_up(
  p_follow_up_id uuid,
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
  v_record follow_ups;
begin
  perform public._require_auth();
  select * into v_record from follow_ups where id = p_follow_up_id and deleted_at is null;
  if v_record is null then
    raise exception 'follow-up % not found', p_follow_up_id using errcode = 'P0002';
  end if;
  if v_record.branch is not null then
    perform public._require_branch_access(v_record.branch);
  end if;
  return public._add_attachment('follow_up', p_follow_up_id, p_storage_path, p_file_name, p_mime_type, p_file_size);
end;
$$;

create or replace function public.rpc_remove_follow_up_attachment(
  p_attachment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment attachments;
  v_record     follow_ups;
begin
  perform public._require_auth();
  select * into v_attachment
    from attachments
   where id = p_attachment_id and entity_type = 'follow_up';
  if v_attachment is null then
    raise exception 'attachment % not found', p_attachment_id using errcode = 'P0002';
  end if;
  select * into v_record from follow_ups where id = v_attachment.entity_id and deleted_at is null;
  if v_record.branch is not null then
    perform public._require_branch_access(v_record.branch);
  end if;
  return public._remove_attachment(p_attachment_id);
end;
$$;

-- =========================================================
-- 9. Grants
-- =========================================================

grant execute on function public.rpc_create_follow_up(text,text,date,text,text,text,text,uuid,uuid)        to authenticated;
grant execute on function public.rpc_update_follow_up(uuid, jsonb)                                          to authenticated;
grant execute on function public.rpc_list_follow_ups(text,text,text,uuid,date,date,uuid,text,boolean,int)   to authenticated;
grant execute on function public.rpc_get_follow_up(uuid)                                                    to authenticated;
grant execute on function public.rpc_add_follow_up_comment(uuid, text)                                      to authenticated;
grant execute on function public.rpc_delete_follow_up_comment(uuid)                                         to authenticated;
grant execute on function public.rpc_attach_file_to_follow_up(uuid, text, text, text, int)                  to authenticated;
grant execute on function public.rpc_remove_follow_up_attachment(uuid)                                      to authenticated;
-- rpc_mark_follow_up_done and rpc_snooze_follow_up keep their existing grants from 20260421_rpcs.sql.

commit;
