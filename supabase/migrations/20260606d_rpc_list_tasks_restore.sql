-- Rabih Ops — rpc_list_tasks function restore (drift remediation)
-- =====================================================================
-- Restores rpc_list_tasks to its post-20260529 body, which orders the
-- inner truncating subquery by created_at DESC NULLS LAST BEFORE
-- applying LIMIT — so the newest rows always survive a LIMIT cap.
-- Observed on staging via pg_get_functiondef: the deployed body
-- applied `limit` directly to the inner subquery without any inner
-- ORDER BY, so Postgres truncated rows in heap order — the
-- pre-20260529 shape.
--
-- Impact: the Playwright `fixed-tasks.spec.ts` admin-happy-path test
-- creates a recurring template, redirects to /fixed-tasks/<id>, and
-- expects the title heading to be visible. The FixedTaskDetail page
-- reads the template via listTasks({ includeTemplates:true,
-- includeArchived:true, includeDone:true, limit:500 }) then JS-finds
-- by id. With the pre-fix body, staging's accumulated rows can push
-- the freshly-created template out of the heap-order 500-row slice,
-- so .find() returns null and the detail page renders "Template not
-- found." with no <h1>. The post-20260529 body fixes this.
--
-- Source of truth: 20260529_rpc_list_tasks_order_before_limit.sql.
-- Body below is a verbatim copy of that migration's function body.
--
-- Scope: CREATE OR REPLACE FUNCTION only. No DDL. No data writes.
-- No table / constraint changes. Idempotent — re-applying is a no-op
-- when the body is already at the post-20260529 state.

begin;

create or replace function public.rpc_list_tasks(
  p_branch             text    default null,
  p_status             text    default null,
  p_assigned_to        uuid    default null,
  p_due_before         date    default null,
  p_due_after          date    default null,
  p_search             text    default null,
  p_include_done       boolean default false,
  p_include_archived   boolean default false,
  p_include_templates  boolean default false,
  p_limit              int     default 100
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
                       and t.status not in ('finished','archived')
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
       and (p_include_done       or tt.status <> 'finished')
       and (p_include_archived   or tt.status <> 'archived')
       and (p_include_templates  or tt.is_template = false)
       and (p_search is null
            or tt.title ilike '%' || p_search || '%'
            or coalesce(tt.description,'') ilike '%' || p_search || '%')
     order by tt.created_at desc nulls last
     limit greatest(coalesce(p_limit, 100), 1)
  ) t;

  return v_result;
end;
$$;

comment on function public.rpc_list_tasks(text,text,uuid,date,date,text,boolean,boolean,boolean,int) is
  'Filtered tasks. Defaults exclude finished, archived, and templates. Inner truncation orders by created_at desc so the newest rows survive a LIMIT cap. Outer sort: overdue first, due_date asc, priority, created_at desc.';

commit;
