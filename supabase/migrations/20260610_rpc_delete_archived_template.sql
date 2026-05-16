-- Chunk X — admin/CEO-only force-delete of archived recurring templates.
--
-- Soft-delete via deleted_at (audit row preserved). Distinct from the
-- existing archive RPC which only sets status='archived' (row still
-- visible with show_archived=true). This RPC requires the template to
-- already be archived; you can't skip archive and delete directly.
--
-- Why a new RPC vs widening the existing archive: keeps semantics
-- separate — "archive" is a paused-but-recoverable state; "delete
-- permanently" is removal from every list view including
-- show_archived. Audit log distinguishes via the 'delete_archived'
-- action.

begin;

create or replace function public.rpc_delete_archived_template(
  p_template_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before tasks;
  v_after  tasks;
  v_role   text;
begin
  perform public._require_auth();

  -- Role gate: admin / CEO only. Mirrors useCanAdminInspect on the
  -- frontend. Managers can archive/unarchive but cannot force-delete.
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'ceo') then
    raise exception 'only admin or ceo can permanently delete templates'
      using errcode = '42501';
  end if;

  select * into v_before
    from tasks
   where id = p_template_id
     and is_template = true
     and deleted_at is null;
  if v_before is null then
    raise exception 'recurring template % not found', p_template_id
      using errcode = 'P0002';
  end if;

  -- Must already be archived. Forces operators to use the archive
  -- flow first (which a manager can do); the permanent delete is a
  -- second deliberate step by admin/CEO.
  if v_before.status <> 'archived' then
    raise exception 'template % is not archived (status=%); archive it first',
      p_template_id, v_before.status
      using errcode = '22023';
  end if;

  perform public._require_branch_access(v_before.branch);

  update tasks
     set deleted_at    = now(),
         next_spawn_at = null
   where id = p_template_id
  returning * into v_after;

  perform public._audit(
    'delete_archived', 'task', p_template_id,
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return to_jsonb(v_after);
end;
$$;

comment on function public.rpc_delete_archived_template(uuid) is
  'Soft-deletes an already-archived recurring template (sets deleted_at). Admin/CEO only. Requires status=''archived''; archive the template first if needed. Audits as ''delete_archived''. Existing spawned instances are NOT affected — their template_id becomes a dangling pointer by design (instances are independent task rows with their own lifecycle).';

grant execute on function public.rpc_delete_archived_template(uuid) to authenticated;

commit;
