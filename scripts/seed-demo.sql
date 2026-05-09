-- One-shot demo seed for the visual QA pass.
-- Run from the Management API SQL endpoint. Impersonates e2e-admin so the
-- SECURITY DEFINER RPCs can authenticate via auth.uid().
-- Idempotency: not built in. Re-running will create more rows. Wipe via the
-- companion `wipe-demo.sql` if you want to start over.

select set_config(
  'request.jwt.claims',
  '{"sub":"a2ffab6b-28aa-4df7-9be4-4caf42d8708b","role":"authenticated"}',
  false
);
set role authenticated;

do $$
declare
  v_task1      uuid;
  v_task2      uuid;
  v_task3      uuid;
  v_task4      uuid;
  v_task5      uuid;
  v_task6      uuid;
  v_task7      uuid;
  v_template   uuid;
  v_followup1  uuid;
  v_followup2  uuid;
  v_followup3  uuid;
  v_inspection1 uuid;
  v_inspection2 uuid;
  v_finding1   uuid;
  v_finding2   uuid;
  v_finding3   uuid;
begin
  -- =========================================================
  -- Tasks
  -- =========================================================

  -- Task 1: overdue urgent (3 days late)
  select (rpc_create_task(
    p_branch       => 'salt',
    p_category     => 'operations',
    p_title        => 'Restock dry storage — flour, oil, sugar',
    p_priority     => 'urgent',
    p_due_date     => (current_date - 3)::date,
    p_assigned_to  => 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b'::uuid,
    p_description  => 'Min levels triggered overnight. Need delivery before Saturday rush.'
  ) ->> 'id')::uuid into v_task1;

  -- Task 2: due today, normal priority
  select (rpc_create_task(
    p_branch       => 'bbqhouse',
    p_category     => 'hr',
    p_title        => 'Brief weekend service staff on the new beverage menu',
    p_priority     => 'normal',
    p_due_date     => current_date,
    p_assigned_to  => null,
    p_description  => 'Use the printed cards. 15 min before service. Cover Aperol + the SALT collab.'
  ) ->> 'id')::uuid into v_task2;

  -- Task 3: due tomorrow, assigned to admin (populates "My tasks")
  select (rpc_create_task(
    p_branch       => 'salt',
    p_category     => 'operations',
    p_title        => 'Review new menu pricing with Carla',
    p_priority     => 'normal',
    p_due_date     => (current_date + 1)::date,
    p_assigned_to  => 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b'::uuid,
    p_description  => 'Carla has the cost spreadsheet. Decide on weekend specials and confirm wholesale margins.'
  ) ->> 'id')::uuid into v_task3;

  -- Task 4: completed
  select (rpc_create_task(
    p_branch       => 'centralkitchen',
    p_category     => 'operations',
    p_title        => 'Approve produce supplier list for May',
    p_priority     => 'normal',
    p_due_date     => (current_date - 1)::date,
    p_assigned_to  => null,
    p_description  => 'List from Carlos. Decide who stays after April performance review.'
  ) ->> 'id')::uuid into v_task4;
  perform rpc_complete_task(
    v_task4,
    'Approved 3 of 4. Removed Frutas Mocambique — three late deliveries last month.'
  );

  -- Task 5: waiting on a supplier — exercises waiting_for_someone state
  select (rpc_create_task(
    p_branch       => 'cleaning',
    p_category     => 'maintenance',
    p_title        => 'Replace the broken ECC vacuum motor',
    p_priority     => 'urgent',
    p_due_date     => (current_date + 2)::date,
    p_assigned_to  => null,
    p_description  => 'On hold pending parts from the supplier. ETA Wednesday.'
  ) ->> 'id')::uuid into v_task5;
  perform rpc_mark_waiting(
    v_task5,
    null,
    'ECC Equipment',
    'They confirmed shipment via WhatsApp on Monday. Awaiting tracking number.'
  );

  -- Task 6: delayed — exercises the delayed state with a reason
  select (rpc_create_task(
    p_branch       => 'centralkitchen',
    p_category     => 'training',
    p_title        => 'Run knife-skills refresher with new line cooks',
    p_priority     => 'normal',
    p_due_date     => (current_date - 2)::date,
    p_assigned_to  => 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b'::uuid,
    p_description  => 'Booked for Tuesday; rescheduled to next week.'
  ) ->> 'id')::uuid into v_task6;
  perform rpc_mark_delayed(
    v_task6,
    'Two of the three trainees called out sick. Rescheduled for next Tuesday.'
  );

  -- Task 7: finished and then sent back — exercises needs_repeat
  select (rpc_create_task(
    p_branch       => 'bbqhouse',
    p_category     => 'social_media',
    p_title        => 'Schedule weekend Instagram posts',
    p_priority     => 'low',
    p_due_date     => (current_date - 1)::date,
    p_assigned_to  => null,
    p_description  => 'Three posts: Friday DJ night, Saturday brunch, Sunday family lunch.'
  ) ->> 'id')::uuid into v_task7;
  perform rpc_complete_task(
    v_task7,
    p_completion_note => 'Posts queued in Buffer for the weekend.',
    p_outcome         => 'Three posts scheduled.'
  );
  perform rpc_request_repeat(
    v_task7,
    'Hashtags missing on the brunch post and the cover image is portrait — needs landscape.'
  );

  -- Recurring template: weekly inventory count — exercises is_template visibility
  -- Default list excludes templates; instances show up with the recurring badge.
  select (rpc_create_recurring_task(
    p_branch          => 'centralkitchen',
    p_category        => 'operations',
    p_title           => 'Weekly inventory count',
    p_recurrence      => 'weekly',
    p_recurrence_time => '09:00'::time,
    p_priority        => 'normal',
    p_assigned_to     => null,
    p_description     => 'Walk every shelf with the count sheet. Reconcile against the POS.',
    p_recurrence_dow  => array[1]::int[]   -- Mondays
  ) ->> 'id')::uuid into v_template;
  -- Spawn one due-today instance from the template so the seed shows the badge.
  perform rpc_spawn_recurring_instance(v_template, current_date);

  -- =========================================================
  -- Follow-ups
  -- =========================================================

  -- Follow-up 1: due today
  select (rpc_create_follow_up(
    p_category     => 'call',
    p_title        => 'Call linen supplier about laundry pickup',
    p_due_date     => current_date,
    p_branch       => 'cleaning',
    p_priority     => 'normal',
    p_description  => 'They missed Tuesday. Need pickup confirmed by EOD.',
    p_person       => 'Marco @ Lavandaria Sol',
    p_assigned_to  => 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b'::uuid,
    p_task_id      => null
  ) ->> 'id')::uuid into v_followup1;

  -- Follow-up 2: snoozed (was due yesterday, snoozed to +2 days)
  select (rpc_create_follow_up(
    p_category     => 'whatsapp',
    p_title        => 'Confirm Easter delivery slot with frigo',
    p_due_date     => (current_date - 1)::date,
    p_branch       => 'salt',
    p_priority     => 'normal',
    p_description  => null,
    p_person       => 'Ana @ Frigo Tropicale',
    p_assigned_to  => null,
    p_task_id      => null
  ) ->> 'id')::uuid into v_followup2;
  perform rpc_snooze_follow_up(
    v_followup2,
    (current_date + 2)::date,
    'They are closed today. Try Friday morning.'
  );

  -- Follow-up 3: linked to Task 1 (the overdue dry-storage task)
  select (rpc_create_follow_up(
    p_category     => 'whatsapp',
    p_title        => 'Chase the dry storage delivery',
    p_due_date     => current_date,
    p_branch       => 'salt',
    p_priority     => 'urgent',
    p_description  => 'Distribuidora hasn''t responded to the morning message.',
    p_person       => 'Distribuidora Maputo',
    p_assigned_to  => 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b'::uuid,
    p_task_id      => v_task1
  ) ->> 'id')::uuid into v_followup3;

  -- =========================================================
  -- Inspections + findings
  -- =========================================================

  -- Inspection 1: BBQ House kitchen, issues found, with one OPEN critical
  select (rpc_create_inspection(
    p_branch        => 'bbqhouse',
    p_area          => 'kitchen',
    p_date          => (current_date - 1)::date,
    p_general_notes => 'Routine walkthrough. Two findings, one critical (cooler temp).'
  ) ->> 'id')::uuid into v_inspection1;

  select (rpc_add_inspection_finding(
    p_inspection_id   => v_inspection1,
    p_severity        => 'critical',
    p_description     => 'Walk-in cooler running at 8.5°C — should be at or below 4°C.',
    p_action_required => 'Call HVAC technician same-day. Move time-sensitive stock to backup unit until fixed.',
    p_responsible     => 'Carlos (kitchen lead)',
    p_follow_up_date  => current_date
  ) ->> 'id')::uuid into v_finding1;

  select (rpc_add_inspection_finding(
    p_inspection_id   => v_inspection1,
    p_severity        => 'major',
    p_description     => 'Two of the dedicated serving spoons missing from the line.',
    p_action_required => 'Replace from stock; track in weekly count.',
    p_responsible     => null,
    p_follow_up_date  => (current_date + 7)::date
  ) ->> 'id')::uuid into v_finding2;

  perform rpc_complete_inspection(v_inspection1, 'issues_found');

  -- Inspection 2: SALT full-branch, passed, with one RESOLVED critical finding
  select (rpc_create_inspection(
    p_branch        => 'salt',
    p_area          => 'full_branch',
    p_date          => (current_date - 7)::date,
    p_general_notes => 'Monthly hygiene + safety walkthrough. One critical at the time, resolved same day.'
  ) ->> 'id')::uuid into v_inspection2;

  select (rpc_add_inspection_finding(
    p_inspection_id   => v_inspection2,
    p_severity        => 'critical',
    p_description     => 'Hand sanitizer station at front entrance was empty.',
    p_action_required => 'Refill immediately and add to daily open checklist.',
    p_responsible     => 'Joana (FOH supervisor)',
    p_follow_up_date  => null
  ) ->> 'id')::uuid into v_finding3;

  perform rpc_resolve_finding(
    v_finding3,
    'Refilled within 15 minutes. Added to FOH daily open checklist; reviewed with Joana.'
  );
  perform rpc_complete_inspection(v_inspection2, 'pass');

  raise notice
    'Seeded: tasks(5)=[%, %, %, % done, % blocked], follow_ups(3)=[%, % snoozed, % linked], inspections(2)=[% issues, % pass]',
    v_task1, v_task2, v_task3, v_task4, v_task5,
    v_followup1, v_followup2, v_followup3,
    v_inspection1, v_inspection2;
end $$;
