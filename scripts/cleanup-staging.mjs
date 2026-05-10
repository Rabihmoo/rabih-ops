// Solo-use cleanup. Wipes demo content + rabih's 3 exploratory rows + the
// duplicate .test user rows. Audit log is preserved.
//
// Usage:
//   node --env-file=.env.local scripts/cleanup-staging.mjs dry
//   node --env-file=.env.local scripts/cleanup-staging.mjs commit
//
// Dry-run wraps everything in a transaction and ROLLBACKs at the end so we
// can see the post-cleanup snapshot without touching real state. `commit`
// re-runs the same statements with COMMIT instead of ROLLBACK.

const mode = (process.argv[2] ?? 'dry').toLowerCase();
if (mode !== 'dry' && mode !== 'commit') {
  console.error('Usage: cleanup-staging.mjs dry|commit');
  process.exit(2);
}

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
if (!t || !r) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

async function sql(label, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label} (${res.status})`);
    console.error(text);
    process.exit(1);
  }
  return JSON.parse(text);
}

// ---------- BEFORE snapshot (always read-only) ----------
const before = await sql(
  'before',
  `select 'tasks_live'                              as metric, (select count(*) from tasks where deleted_at is null) as v
   union all select 'follow_ups_live',                (select count(*) from follow_ups where deleted_at is null)
   union all select 'inspections_live',               (select count(*) from inspections where deleted_at is null)
   union all select 'purchase_requests_live',         (select count(*) from purchase_requests where deleted_at is null)
   union all select 'comments_live',                  (select count(*) from comments where deleted_at is null)
   union all select 'attachments_total',              (select count(*) from attachments)
   union all select 'notifications_queue_total',      (select count(*) from notifications_queue)
   union all select 'notifications_queue_pending',    (select count(*) from notifications_queue where status='pending')
   union all select 'notifications_queue_sent',       (select count(*) from notifications_queue where status='sent')
   union all select 'notifications_queue_dismissed',  (select count(*) from notifications_queue where status='dismissed')
   union all select 'notifications_queue_cancelled',  (select count(*) from notifications_queue where status='cancelled')
   union all select 'users_total',                    (select count(*) from users)
   union all select 'audit_log_total',                (select count(*) from audit_log)`,
);

// ---------- the cleanup transaction ----------
const closer = mode === 'dry' ? 'rollback;' : 'commit;';

const cleanup = `
begin;

-- Phase 1 — soft-delete demo tasks (e2e-admin both .test and @example)
update tasks set deleted_at = now()
 where deleted_at is null
   and created_by in (select id from users where email like 'e2e-admin@%');

-- Phase 1 — soft-delete demo follow-ups
update follow_ups set deleted_at = now()
 where deleted_at is null
   and created_by in (select id from users where email like 'e2e-admin@%');

-- Phase 1 — soft-delete demo inspections
update inspections set deleted_at = now()
 where deleted_at is null
   and inspected_by in (select id from users where email like 'e2e-admin@%');

-- Phase 1 — soft-delete demo purchases
update purchase_requests set deleted_at = now()
 where deleted_at is null
   and (created_by   in (select id from users where email like 'e2e-admin@%')
     or requested_by in (select id from users where email like 'e2e-admin@%'));

-- Phase 1 — cancel still-active reminders addressed to e2e-admin
update notifications_queue
   set status        = 'cancelled',
       cancelled_at  = coalesce(cancelled_at, now()),
       cancel_reason = 'cleanup'
 where status in ('pending','sent')
   and recipient_id in (select id from users where email like 'e2e-admin@%');

-- Phase 1 — hard-delete demo comments + attachments (their parents are gone)
delete from comments
 where author_id in (select id from users where email like 'e2e-admin@%');

delete from attachments
 where uploaded_by in (select id from users where email like 'e2e-admin@%');

-- Phase 2 — rabih's exploratory rows
update tasks set deleted_at = now()
 where deleted_at is null
   and title in ('TEST 1','CUCCLA UNIFORM')
   and created_by in (select id from users where email = 'rabih.moughabat12@gmail.com');

update purchase_requests set deleted_at = now()
 where deleted_at is null
   and title = 'COCA COLA'
   and requested_by in (select id from users where email = 'rabih.moughabat12@gmail.com');

-- Phase 2 — cancel any reminders for those entities
update notifications_queue
   set status        = 'cancelled',
       cancelled_at  = coalesce(cancelled_at, now()),
       cancel_reason = 'cleanup'
 where status in ('pending','sent')
   and (
        (entity_type = 'task' and entity_id in (
            select id from tasks where deleted_at is not null and title in ('TEST 1','CUCCLA UNIFORM')))
     or (entity_type = 'purchase_request' and entity_id in (
            select id from purchase_requests where deleted_at is not null and title = 'COCA COLA'))
   );

-- Phase 2.5 — orphan sweep. Anything (comment / attachment) whose parent
-- entity is now soft-deleted goes. Storage objects in the bucket are
-- left to a future sweep.
delete from comments where
     (entity_type = 'task'             and entity_id in (select id from tasks where deleted_at is not null))
  or (entity_type = 'follow_up'        and entity_id in (select id from follow_ups where deleted_at is not null))
  or (entity_type = 'purchase_request' and entity_id in (select id from purchase_requests where deleted_at is not null));

delete from attachments where
     (entity_type = 'task'             and entity_id in (select id from tasks where deleted_at is not null))
  or (entity_type = 'follow_up'        and entity_id in (select id from follow_ups where deleted_at is not null))
  or (entity_type = 'purchase_request' and entity_id in (select id from purchase_requests where deleted_at is not null));

-- Phase 3 — drop the duplicate .test public.users rows
delete from users where email in ('e2e-admin@rabihos.test','e2e-viewer@rabihos.test');

-- Snapshot AFTER (returned as the API response)
select 'tasks_live'                              as metric, (select count(*) from tasks where deleted_at is null) as v
union all select 'follow_ups_live',                (select count(*) from follow_ups where deleted_at is null)
union all select 'inspections_live',               (select count(*) from inspections where deleted_at is null)
union all select 'purchase_requests_live',         (select count(*) from purchase_requests where deleted_at is null)
union all select 'comments_live',                  (select count(*) from comments where deleted_at is null)
union all select 'attachments_total',              (select count(*) from attachments)
union all select 'notifications_queue_total',      (select count(*) from notifications_queue)
union all select 'notifications_queue_pending',    (select count(*) from notifications_queue where status='pending')
union all select 'notifications_queue_sent',       (select count(*) from notifications_queue where status='sent')
union all select 'notifications_queue_dismissed',  (select count(*) from notifications_queue where status='dismissed')
union all select 'notifications_queue_cancelled',  (select count(*) from notifications_queue where status='cancelled')
union all select 'users_total',                    (select count(*) from users)
union all select 'audit_log_total',                (select count(*) from audit_log);

${closer}
`;

const after = await sql(mode, cleanup);

// ---------- delta print ----------
const beforeMap = Object.fromEntries(before.map((r) => [r.metric, Number(r.v)]));
const afterMap = Object.fromEntries(after.map((r) => [r.metric, Number(r.v)]));

console.log(`\n=== ${mode === 'dry' ? 'DRY RUN' : 'COMMITTED'} delta ===\n`);
const rows = [];
for (const m of Object.keys(beforeMap)) {
  const b = beforeMap[m];
  const a = afterMap[m];
  const d = a - b;
  rows.push({ metric: m, before: b, after: a, delta: d });
}
console.table(rows);

if (mode === 'dry') {
  console.log('\nDry run rolled back. No changes committed.');
  console.log('Run with `commit` to apply.');
} else {
  console.log('\n✅ Cleanup committed.');
}
