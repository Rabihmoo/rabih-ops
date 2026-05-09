-- Demo seed for Purchasing module — covers every UI state the UAT review
-- needs to see. Idempotent only via re-runs creating duplicate rows.
-- Run via tsx scripts/seed-demo.ts after pointing it at this file, or send
-- the file contents to the Management API as a single query.

select set_config(
  'request.jwt.claims',
  '{"sub":"a2ffab6b-28aa-4df7-9be4-4caf42d8708b","role":"authenticated"}',
  false
);
set role authenticated;

do $$
declare
  v_p_submitted     uuid;
  v_p_overdue       uuid;
  v_p_partial       uuid;
  v_p_unpaid        uuid;
  v_p_reminder      uuid;
  v_p_cancelled     uuid;
  v_p_paid          uuid;
begin
  -- 1. Submitted request awaiting approval (no order date yet)
  select (rpc_create_purchase_request(
    p_title         => 'New oven thermocouples for SALT line',
    p_supplier_name => 'Restaurant Supplies Maputo',
    p_branch        => 'salt',
    p_priority      => 'normal',
    p_currency      => 'MZN',
    p_total_amount  => 18500,
    p_qty_ordered   => 4,
    p_expected_delivery_date => (current_date + 7)::date,
    p_payment_method         => 'bank_transfer',
    p_notes         => 'Two failed last service. Order spares to keep one rotating.'
  ) ->> 'id')::uuid into v_p_submitted;
  perform rpc_submit_purchase_request(v_p_submitted);

  -- 2. Ordered with overdue delivery + unpaid
  select (rpc_create_purchase_request(
    p_title         => 'Charcoal pallet — March delivery',
    p_supplier_name => 'Distribuidora Maputo',
    p_branch        => 'bbqhouse',
    p_priority      => 'urgent',
    p_currency      => 'MZN',
    p_total_amount  => 38000,
    p_qty_ordered   => 50,
    p_expected_delivery_date => (current_date - 5)::date,
    p_payment_method         => 'bank_transfer',
    p_notes         => 'Confirmed by phone. They missed the Friday window.'
  ) ->> 'id')::uuid into v_p_overdue;
  perform rpc_submit_purchase_request(v_p_overdue);
  perform rpc_approve_purchase_request(
    v_p_overdue,
    p_total_amount   => 38000,
    p_payment_method => 'bank_transfer',
    p_order_date     => (current_date - 8)::date
  );

  -- 3. Partially received (30 of 50 kg) — payment partial
  select (rpc_create_purchase_request(
    p_title         => 'Frozen seafood — weekly order',
    p_supplier_name => 'Frigo Tropicale',
    p_branch        => 'centralkitchen',
    p_priority      => 'normal',
    p_currency      => 'MZN',
    p_total_amount  => 75000,
    p_qty_ordered   => 50,
    p_expected_delivery_date => (current_date - 1)::date,
    p_payment_method         => 'bank_transfer',
    p_notes         => 'Standard weekly. Always invoice on receipt.'
  ) ->> 'id')::uuid into v_p_partial;
  perform rpc_submit_purchase_request(v_p_partial);
  perform rpc_approve_purchase_request(
    v_p_partial,
    p_order_date => (current_date - 3)::date
  );
  perform rpc_record_delivery(
    v_p_partial,
    p_qty_received  => 30,
    p_delivery_date => (current_date - 1)::date
  );
  perform rpc_record_payment(
    v_p_partial,
    p_amount_paid    => 30000,
    p_payment_method => 'bank_transfer'
  );

  -- 4. Fully received but UNPAID — accounts payable view
  select (rpc_create_purchase_request(
    p_title         => 'Linen rental — April',
    p_supplier_name => 'Lavandaria Sol',
    p_branch        => 'cleaning',
    p_priority      => 'normal',
    p_currency      => 'MZN',
    p_total_amount  => 8500,
    p_qty_ordered   => null,
    p_expected_delivery_date => (current_date - 14)::date,
    p_payment_method         => 'invoice',
    p_notes         => 'Monthly invoice. Pay by month-end.'
  ) ->> 'id')::uuid into v_p_unpaid;
  perform rpc_submit_purchase_request(v_p_unpaid);
  perform rpc_approve_purchase_request(
    v_p_unpaid,
    p_order_date => (current_date - 14)::date
  );
  perform rpc_record_delivery(
    v_p_unpaid,
    p_qty_received  => 0,
    p_status        => 'fully_received',
    p_delivery_date => (current_date - 14)::date
  );

  -- 5. Reminder today — LBP currency to exercise the multi-currency path
  select (rpc_create_purchase_request(
    p_title         => 'Olive oil — annual stock from Lebanon',
    p_supplier_name => 'Bekaa Mills Co.',
    p_branch        => 'salt',
    p_priority      => 'normal',
    p_currency      => 'LBP',
    p_total_amount  => 22000000,
    p_qty_ordered   => 200,
    p_expected_delivery_date => (current_date + 21)::date,
    p_reminder_date          => current_date,
    p_payment_method         => 'invoice',
    p_notes         => 'Wire transfer 50 percent on confirmation, balance on receipt.'
  ) ->> 'id')::uuid into v_p_reminder;
  perform rpc_submit_purchase_request(v_p_reminder);
  perform rpc_approve_purchase_request(
    v_p_reminder,
    p_order_date => (current_date - 2)::date
  );

  -- 6. Cancelled — for the All bucket
  select (rpc_create_purchase_request(
    p_title         => 'Replacement vacuum motor — old model',
    p_supplier_name => 'ECC Equipment',
    p_branch        => 'cleaning',
    p_priority      => 'low',
    p_currency      => 'MZN',
    p_total_amount  => 12500,
    p_qty_ordered   => 1,
    p_expected_delivery_date => (current_date + 5)::date,
    p_notes         => 'Model discontinued. Cancelling and ordering the new one.'
  ) ->> 'id')::uuid into v_p_cancelled;
  perform rpc_submit_purchase_request(v_p_cancelled);
  perform rpc_cancel_purchase_request(
    v_p_cancelled,
    p_reason => 'Discontinued model. Replaced by the new request below.'
  );

  -- 7. Fully paid + fully received — for the "all states" coverage
  select (rpc_create_purchase_request(
    p_title         => 'Service uniforms — restock',
    p_supplier_name => 'Confeções Maputo',
    p_branch        => 'bbqhouse',
    p_priority      => 'normal',
    p_currency      => 'MZN',
    p_total_amount  => 14000,
    p_qty_ordered   => 20,
    p_expected_delivery_date => (current_date - 7)::date,
    p_payment_method         => 'cash',
    p_notes         => 'Standard sizes mix. Receipt filed.'
  ) ->> 'id')::uuid into v_p_paid;
  perform rpc_submit_purchase_request(v_p_paid);
  perform rpc_approve_purchase_request(
    v_p_paid,
    p_order_date => (current_date - 10)::date
  );
  perform rpc_record_delivery(
    v_p_paid,
    p_qty_received  => 20,
    p_delivery_date => (current_date - 7)::date
  );
  perform rpc_record_payment(
    v_p_paid,
    p_amount_paid    => 14000,
    p_payment_method => 'cash'
  );

  raise notice 'Seeded: submitted=%, overdue=%, partial=%, unpaid=%, reminder=%, cancelled=%, paid=%',
    v_p_submitted, v_p_overdue, v_p_partial, v_p_unpaid, v_p_reminder, v_p_cancelled, v_p_paid;
end $$;
