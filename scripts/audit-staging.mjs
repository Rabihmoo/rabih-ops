// Read-only audit of staging data ahead of solo-use cleanup. No writes.
const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
async function q(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  console.log(`\n=== ${label}\n${await res.text()}`);
}

// 1. Users
await q(
  'users',
  `select id, full_name, email, role, branches, created_at::date as created_on
     from users order by role, full_name`,
);

// 2. Tasks by status (real vs demo, where demo = created_by IN (e2e-admin uuids))
await q(
  'tasks-by-status',
  `select status,
          count(*) filter (where deleted_at is null) as live,
          count(*) filter (where deleted_at is not null) as deleted,
          count(*) filter (where is_template = true) as templates
     from tasks
    group by status
    order by status`,
);
await q(
  'tasks-by-creator',
  `select u.full_name, count(*) as n,
          count(*) filter (where t.is_template) as templates,
          count(*) filter (where t.template_id is not null) as instances
     from tasks t
     left join users u on u.id = t.created_by
    group by u.full_name
    order by n desc`,
);

// 3. Follow-ups by status
await q(
  'followups-by-status',
  `select status, count(*) as n,
          count(*) filter (where deleted_at is null) as live
     from follow_ups
    group by status
    order by status`,
);
await q(
  'followups-by-creator',
  `select u.full_name, count(*) as n
     from follow_ups f
     left join users u on u.id = f.created_by
    group by u.full_name
    order by n desc`,
);

// 4. Inspections + findings
await q(
  'inspections',
  `select i.result, count(*) as n
     from inspections i
    where i.deleted_at is null
    group by i.result
    order by i.result`,
);
await q(
  'inspections-by-creator',
  `select u.full_name, count(*) as inspections,
          (select count(*) from inspection_findings f
            where f.inspection_id in (select id from inspections where inspected_by = u.id)) as findings
     from users u
     join inspections i on i.inspected_by = u.id
    group by u.full_name
    order by inspections desc`,
);
await q(
  'findings-by-status-severity',
  `select status, severity, count(*) as n
     from inspection_findings
    group by status, severity
    order by status, severity`,
);

// 5. Purchases
await q(
  'purchases-by-status',
  `select status, payment_status, count(*) as n
     from purchase_requests
    where deleted_at is null
    group by status, payment_status
    order by status, payment_status`,
);
await q(
  'purchases-by-creator',
  `select u.full_name, count(*) as n, sum(p.total_amount) as total
     from purchase_requests p
     left join users u on u.id = p.requested_by
    where p.deleted_at is null
    group by u.full_name
    order by n desc`,
);

// 6. Comments + attachments + audit + reminders
await q(
  'comments',
  `select entity_type, count(*) as n,
          count(*) filter (where deleted_at is null) as live
     from comments
    group by entity_type
    order by entity_type`,
);
await q(
  'attachments',
  `select entity_type, count(*) as n
     from attachments
    group by entity_type
    order by entity_type`,
);
await q(
  'reminders-queue',
  `select status, kind, count(*) as n
     from notifications_queue
    group by status, kind
    order by status, kind`,
);
await q(
  'reminders-log',
  `select count(*) as n from notification_log`,
);
await q(
  'audit-by-action',
  `select action, count(*) as n
     from audit_log
    group by action
    order by n desc
    limit 25`,
);

// 7. Demo provenance — anything created_by the e2e-admin uuids is demo seed.
//    Compare to rabih's account.
await q(
  'demo-vs-real',
  `with creators as (
     select 'tasks' as table_name, created_by as uid, count(*) as n from tasks where deleted_at is null group by created_by
     union all
     select 'follow_ups', created_by, count(*) from follow_ups where deleted_at is null group by created_by
     union all
     select 'inspections', inspected_by, count(*) from inspections where deleted_at is null group by inspected_by
     union all
     select 'purchase_requests', requested_by, count(*) from purchase_requests where deleted_at is null group by requested_by
   )
   select c.table_name, u.full_name, c.n
     from creators c
     left join users u on u.id = c.uid
    order by c.table_name, n desc`,
);

// 8. Tasks/follow-ups linked to my real account (rabih)
await q(
  'rabih-owned',
  `select 'tasks-created' as kind, count(*) from tasks
      where created_by = (select id from users where email like 'rabih%' limit 1) and deleted_at is null
   union all
   select 'tasks-assigned',  count(*) from tasks
      where assigned_to = (select id from users where email like 'rabih%' limit 1) and deleted_at is null
   union all
   select 'follow_ups-created', count(*) from follow_ups
      where created_by = (select id from users where email like 'rabih%' limit 1) and deleted_at is null
   union all
   select 'inspections', count(*) from inspections
      where inspected_by = (select id from users where email like 'rabih%' limit 1) and deleted_at is null
   union all
   select 'purchase_requests', count(*) from purchase_requests
      where requested_by = (select id from users where email like 'rabih%' limit 1) and deleted_at is null`,
);
