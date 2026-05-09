// Smoke test for the Phase B reminder engine. Runs against staging.
const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;

async function q(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  console.log(`--- ${label}\n${text}\n`);
  return text;
}

// 1. Force the 5 pending reminders to fire_at=now-1min so the drain picks them up
await q('force-due', `update notifications_queue set fire_at = now() - interval '1 minute' where status = 'pending'`);

// 2. Run drain
await q('drain', 'select public._drain_reminders() as fired');

// 3. Verify
await q('queue-status', 'select status, count(*) from notifications_queue group by status order by status');
await q('log', 'select count(*) as log_rows from notification_log');
await q('audit', `select action, count(*) from audit_log where action like 'reminder_%' group by action order by action`);

// 4. Dedup: try to insert a duplicate of a sent row but as pending — should be blocked
//    by the partial unique index on pending only (sent rows are excluded from the index,
//    so this would actually succeed). To truly test, copy from an existing pending row.
//    Since the drain just promoted everything to sent, re-enqueue one pending duplicate
//    of an entity, then try to insert another pending with same key.
await q('insert-pending-1', `
  insert into notifications_queue(kind,entity_type,entity_id,recipient_id,channel,fire_at,status)
  select 'deadline_reminder','task',
         (select id from tasks where deleted_at is null and is_template=false limit 1),
         (select recipient_id from notifications_queue limit 1),
         'in_app', now() + interval '1 hour', 'pending'
  returning id
`);

await q('insert-pending-dup', `
  insert into notifications_queue(kind,entity_type,entity_id,recipient_id,channel,fire_at,status)
  select 'deadline_reminder','task',
         (select id from tasks where deleted_at is null and is_template=false limit 1),
         (select recipient_id from notifications_queue limit 1),
         'in_app', now() + interval '1 hour', 'pending'
  returning id
`);

// 5. Trigger test: set a deadline reminder on an existing task and verify a new pending row appears
await q('set-task-reminder', `
  update tasks
     set deadline_reminder_at = now() + interval '5 minutes'
   where deleted_at is null and is_template=false and status='not_started'
   and deadline_reminder_at is null
   limit 1
`);
await q('queue-after-trigger', `select kind, count(*) from notifications_queue where status='pending' group by kind order by kind`);

// 6. Cancel-on-close: close the task and verify pending row gets cancelled
await q('close-task', `
  update tasks set status='archived'
   where deleted_at is null and is_template=false and deadline_reminder_at is not null
   limit 1
`);
await q('queue-after-close', `select status, count(*) from notifications_queue group by status order by status`);
