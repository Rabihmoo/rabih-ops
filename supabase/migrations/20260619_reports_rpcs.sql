-- Rabih Ops — Report RPCs (Phase 9)
-- =====================================================================
-- Four read-only aggregate RPCs for the reports surface. Each is
-- STABLE, SECURITY DEFINER, and gated to admin/CEO role.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

begin;

-- =====================================================================
-- 1. Task velocity — created vs finished per ISO week
-- =====================================================================

create or replace function public.rpc_report_task_velocity(
  p_branch text default null,
  p_from   date default (current_date - 90),
  p_to     date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_result jsonb;
begin
  if v_role not in ('admin', 'ceo') then return null; end if;

  select coalesce(jsonb_agg(r order by r.week_start), '[]'::jsonb) into v_result
  from (
    select
      date_trunc('week', t.created_at)::date as week_start,
      count(*)::int as created,
      count(*) filter (where t.status in ('finished', 'done'))::int as finished
    from tasks t
    where t.deleted_at is null
      and coalesce(t.is_template, false) = false
      and t.created_at::date between p_from and p_to
      and (p_branch is null or t.branch = p_branch)
      and (p_branch is null or public.current_user_can_access_branch(t.branch))
    group by date_trunc('week', t.created_at)::date
  ) r;

  return v_result;
end;
$$;

comment on function public.rpc_report_task_velocity(text, date, date) is
  'Task velocity report: created vs finished per ISO week. Admin/CEO only.';
grant execute on function public.rpc_report_task_velocity(text, date, date) to authenticated;

-- =====================================================================
-- 2. Supplier spend — per supplier, with per-currency subtotals
-- =====================================================================

create or replace function public.rpc_report_supplier_spend(
  p_branch text default null,
  p_from   date default (current_date - 90),
  p_to     date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_result jsonb;
begin
  if v_role not in ('admin', 'ceo') then return null; end if;

  -- Return per-supplier rows with currency breakdown as a nested array.
  -- The client formats "primary total in MZN + tail of other currencies".
  select coalesce(jsonb_agg(r order by r.total_mzn desc nulls last), '[]'::jsonb) into v_result
  from (
    select
      pr.supplier_name,
      count(*)::int as order_count,
      -- MZN primary total
      coalesce(sum(pr.total_amount) filter (where pr.currency = 'MZN'), 0)::numeric(12,2) as total_mzn,
      coalesce(sum(pr.amount_paid) filter (where pr.currency = 'MZN'), 0)::numeric(12,2) as paid_mzn,
      -- Currency breakdown as nested array
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'currency', sub.currency,
          'total_amount', sub.total_amount,
          'amount_paid', sub.amount_paid,
          'count', sub.cnt
        ) order by sub.currency), '[]'::jsonb)
        from (
          select
            pr2.currency,
            coalesce(sum(pr2.total_amount), 0)::numeric(12,2) as total_amount,
            coalesce(sum(pr2.amount_paid), 0)::numeric(12,2) as amount_paid,
            count(*)::int as cnt
          from purchase_requests pr2
          where pr2.deleted_at is null
            and pr2.supplier_name = pr.supplier_name
            and pr2.created_at::date between p_from and p_to
            and (p_branch is null or pr2.branch = p_branch)
          group by pr2.currency
        ) sub
      ) as currency_breakdown
    from purchase_requests pr
    where pr.deleted_at is null
      and pr.created_at::date between p_from and p_to
      and (p_branch is null or pr.branch = p_branch)
      and (p_branch is null or public.current_user_can_access_branch(pr.branch))
    group by pr.supplier_name
  ) r;

  return v_result;
end;
$$;

comment on function public.rpc_report_supplier_spend(text, date, date) is
  'Supplier spend report: per-supplier totals with currency breakdown. Admin/CEO only. Does NOT sum across currencies — returns MZN primary + per-currency subtotals.';
grant execute on function public.rpc_report_supplier_spend(text, date, date) to authenticated;

-- =====================================================================
-- 3. Inspection pass rate — per ISO week
-- =====================================================================

create or replace function public.rpc_report_inspection_pass_rate(
  p_branch text default null,
  p_from   date default (current_date - 90),
  p_to     date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_result jsonb;
begin
  if v_role not in ('admin', 'ceo') then return null; end if;

  select coalesce(jsonb_agg(r order by r.week_start), '[]'::jsonb) into v_result
  from (
    select
      date_trunc('week', i.inspection_date)::date as week_start,
      count(*)::int as total,
      count(*) filter (where i.result = 'pass')::int as pass,
      count(*) filter (where i.result = 'issues_found')::int as issues_found,
      count(*) filter (where i.result = 'failed')::int as failed
    from inspections i
    where i.deleted_at is null
      and i.inspection_date between p_from and p_to
      and (p_branch is null or i.branch = p_branch)
      and (p_branch is null or public.current_user_can_access_branch(i.branch))
    group by date_trunc('week', i.inspection_date)::date
  ) r;

  return v_result;
end;
$$;

comment on function public.rpc_report_inspection_pass_rate(text, date, date) is
  'Inspection pass rate report: pass/issues_found/failed per ISO week. Admin/CEO only.';
grant execute on function public.rpc_report_inspection_pass_rate(text, date, date) to authenticated;

-- =====================================================================
-- 4. Follow-up close rate — opened vs closed per ISO week
-- =====================================================================

create or replace function public.rpc_report_follow_up_close_rate(
  p_branch text default null,
  p_from   date default (current_date - 90),
  p_to     date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_result jsonb;
begin
  if v_role not in ('admin', 'ceo') then return null; end if;

  select coalesce(jsonb_agg(r order by r.week_start), '[]'::jsonb) into v_result
  from (
    select
      w.week_start,
      coalesce(o.opened, 0)::int as opened,
      coalesce(c.closed, 0)::int as closed
    from (
      -- Generate all weeks that have either opened or closed
      select distinct date_trunc('week', d)::date as week_start
      from (
        select created_at as d from follow_ups
         where deleted_at is null
           and created_at::date between p_from and p_to
           and (p_branch is null or branch = p_branch)
        union all
        select updated_at as d from follow_ups
         where deleted_at is null
           and status in ('done', 'cancelled')
           and updated_at::date between p_from and p_to
           and (p_branch is null or branch = p_branch)
      ) combined
    ) w
    left join (
      select date_trunc('week', f.created_at)::date as week_start, count(*)::int as opened
      from follow_ups f
      where f.deleted_at is null
        and f.created_at::date between p_from and p_to
        and (p_branch is null or f.branch = p_branch)
        and (p_branch is null or public.current_user_can_access_branch(f.branch))
      group by date_trunc('week', f.created_at)::date
    ) o on o.week_start = w.week_start
    left join (
      select date_trunc('week', f.updated_at)::date as week_start, count(*)::int as closed
      from follow_ups f
      where f.deleted_at is null
        and f.status in ('done', 'cancelled')
        and f.updated_at::date between p_from and p_to
        and (p_branch is null or f.branch = p_branch)
        and (p_branch is null or public.current_user_can_access_branch(f.branch))
      group by date_trunc('week', f.updated_at)::date
    ) c on c.week_start = w.week_start
  ) r;

  return v_result;
end;
$$;

comment on function public.rpc_report_follow_up_close_rate(text, date, date) is
  'Follow-up close rate report: opened vs closed per ISO week. Admin/CEO only. Closed = status changed to done/cancelled (approximated by updated_at in range).';
grant execute on function public.rpc_report_follow_up_close_rate(text, date, date) to authenticated;

commit;
