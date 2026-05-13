-- Rabih Ops — fix rpc_list_purchase_dashboard 400.
-- =====================================================================
-- Each of the three inner subqueries in rpc_list_purchase_dashboard
-- projects a specific subset of purchase_requests columns. The outer
-- `jsonb_agg(p order by ..., p.created_at desc)` then references
-- p.created_at — which was NOT projected, hence:
--
--   ERROR 42703: column p.created_at does not exist
--
-- Symptom: every Dashboard load logged a 400 in DevTools / network
-- without visibly breaking the page (the failing query returned no
-- data; the purchase dashboard sections silently stayed empty).
--
-- Fix: add pp.created_at to each subquery's select list so the
-- outer order-by resolves. Three identical one-line additions.
-- Frontend types (PendingDelivery / UnpaidPurchase / PurchaseReminder
-- in src/lib/purchase-requests.ts) don't declare created_at —
-- adding it to the returned rows is harmless (TypeScript ignores
-- excess keys on RPC results).
--
-- Idempotent: CREATE OR REPLACE FUNCTION of the same signature.
-- No schema change, no policy change.

begin;

create or replace function public.rpc_list_purchase_dashboard(
  p_limit int default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today            date := current_date;
  v_pending_delivery jsonb;
  v_unpaid           jsonb;
  v_reminders        jsonb;
begin
  perform public._require_auth();

  -- Overdue or upcoming deliveries (ordered / partially_received), nearest first.
  select coalesce(jsonb_agg(p order by p.expected_delivery_date nulls last, p.created_at desc), '[]'::jsonb)
    into v_pending_delivery
  from (
    select pp.id, pp.title, pp.supplier_name, pp.branch, pp.status,
           pp.expected_delivery_date, pp.qty_ordered, pp.qty_received,
           pp.currency, pp.total_amount,
           pp.created_at,
           (pp.expected_delivery_date is not null
              and pp.expected_delivery_date < v_today) as is_overdue
      from purchase_requests pp
     where pp.deleted_at is null
       and pp.status in ('ordered','partially_received')
       and public.current_user_can_access_branch(pp.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) p;

  -- Unpaid or partially-paid (any non-cancelled status).
  select coalesce(jsonb_agg(p order by p.order_date desc nulls last, p.created_at desc), '[]'::jsonb)
    into v_unpaid
  from (
    select pp.id, pp.title, pp.supplier_name, pp.branch, pp.status,
           pp.payment_status, pp.payment_method,
           pp.currency, pp.total_amount, pp.amount_paid,
           pp.order_date,
           pp.created_at
      from purchase_requests pp
     where pp.deleted_at is null
       and pp.status <> 'cancelled'
       and pp.payment_status in ('unpaid','partial')
       and (pp.total_amount is not null or pp.amount_paid is not null)
       and public.current_user_can_access_branch(pp.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) p;

  -- Reminders due today.
  select coalesce(jsonb_agg(p order by p.reminder_date asc, p.created_at desc), '[]'::jsonb)
    into v_reminders
  from (
    select pp.id, pp.title, pp.supplier_name, pp.branch, pp.status,
           pp.reminder_date, pp.expected_delivery_date,
           pp.currency, pp.total_amount,
           pp.created_at
      from purchase_requests pp
     where pp.deleted_at is null
       and pp.reminder_date = v_today
       and pp.status not in ('cancelled','fully_received')
       and public.current_user_can_access_branch(pp.branch)
     limit greatest(coalesce(p_limit, 20), 1)
  ) p;

  return jsonb_build_object(
    'pending_deliveries', v_pending_delivery,
    'unpaid',             v_unpaid,
    'reminders_today',    v_reminders
  );
end;
$$;

comment on function public.rpc_list_purchase_dashboard(int) is
  'Single round-trip for the three dashboard purchase sections: pending deliveries, unpaid/partial purchases, reminders due today. Inner subqueries include created_at so the outer jsonb_agg order-by can reference it.';

commit;
