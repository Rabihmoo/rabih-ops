// Wider cleanup than scripts/cleanup-staging.mjs. Targets rows created by:
//   (a) the e2e-admin@* / e2e-viewer@* Playwright fixture users
//   (b) any user, where the title/name matches a known test prefix from a
//       Playwright spec, smoke script, or H4.x visual-review seed
//
// Strictly conservative:
//   - read-only by default; run with `dry` to preview, `commit` to apply
//   - only matches obvious test prefixes (H4.2 / H4.4 / H4.5 / H4.7 /
//     E2E / Contact-Co / Contact-Person)
//   - never touches: branches, users, google_oauth_tokens, oauth_state,
//     telegram_chats, schema, audit_log
//   - soft-deletes (deleted_at) everywhere — every target table has the
//     column. comments/attachments/notifications keep their existing
//     handling from cleanup-staging.mjs (hard-delete + cancel).
//   - inspections has no title column, so it's only matched via
//     inspected_by IN (test users). Title-based inspection cleanup is
//     not in scope.
//
// Usage:
//   node --env-file=.env.local scripts/cleanup-test-data.mjs dry
//   node --env-file=.env.local scripts/cleanup-test-data.mjs commit

const mode = (process.argv[2] ?? 'dry').toLowerCase();
if (mode !== 'dry' && mode !== 'commit') {
  console.error('Usage: cleanup-test-data.mjs dry|commit');
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

// Test-prefix patterns. Anything starting with these is fair game. Keep
// this list narrow — drift here turns real rows into test rows.
const PATTERNS = `
with test_prefixes as (
  select unnest(array[
    'H4.2 review ',
    'H4.4 ',
    'H4.4/5 ',
    'H4.5 ',
    'H4.7 ',
    'E2E Smoke ',
    'E2E Test ',
    'Contact-Co ',
    'Contact-Person ',
    'Phase Z ',
    -- Second-pass extensions (user-approved 2026-05-15):
    'Smoke ',
    'remediation smoke ',
    'Inbox today ',
    'Inbox overdue ',
    'Inbox finished ',
    'Inbox FU ',
    'Linked-records target ',
    'Phase-A lifecycle ',
    -- Canonical prefix produced by tests/helpers/e2e-title.ts. New
    -- specs should adopt this; existing specs are still covered by
    -- the created_by IN (test_users) path.
    '[E2E] '
  ]) as p
),
test_users as (
  select id from users where email like 'e2e-%@%'
)
`;

const previewQuery = `
${PATTERNS}
select 'tasks_by_test_user'           as bucket, count(*)::int as n from tasks
  where deleted_at is null and created_by in (select id from test_users)
union all
select 'tasks_by_test_prefix',          count(*)::int from tasks
  where deleted_at is null
    and exists (select 1 from test_prefixes where tasks.title like p || '%')
union all
select 'follow_ups_by_test_user',       count(*)::int from follow_ups
  where deleted_at is null and created_by in (select id from test_users)
union all
select 'follow_ups_by_test_prefix',     count(*)::int from follow_ups
  where deleted_at is null
    and exists (select 1 from test_prefixes where follow_ups.title like p || '%')
union all
select 'inspections_by_test_user',      count(*)::int from inspections
  where deleted_at is null and inspected_by in (select id from test_users)
union all
select 'purchases_by_test_user',        count(*)::int from purchase_requests
  where deleted_at is null
    and (created_by in (select id from test_users)
         or requested_by in (select id from test_users))
union all
select 'purchases_by_test_prefix',      count(*)::int from purchase_requests
  where deleted_at is null
    and exists (select 1 from test_prefixes where purchase_requests.title like p || '%')
union all
select 'notes_by_test_user',            count(*)::int from notes
  where deleted_at is null and created_by in (select id from test_users)
union all
select 'notes_by_test_prefix',          count(*)::int from notes
  where deleted_at is null
    and exists (select 1 from test_prefixes where notes.title like p || '%')
union all
select 'documents_by_test_user',        count(*)::int from documents
  where deleted_at is null and created_by in (select id from test_users)
union all
select 'documents_by_test_prefix',      count(*)::int from documents
  where deleted_at is null
    and exists (select 1 from test_prefixes where documents.title like p || '%')
union all
select 'companies_by_test_prefix',      count(*)::int from companies
  where deleted_at is null
    and exists (select 1 from test_prefixes where companies.name like p || '%')
union all
select 'contacts_by_test_prefix',       count(*)::int from contacts
  where deleted_at is null
    and exists (select 1 from test_prefixes where contacts.full_name like p || '%')
union all
select 'reminders_pending_for_test_users', count(*)::int from notifications_queue
  where status in ('pending','sent') and recipient_id in (select id from test_users)
order by bucket;
`;

// Samples: 5 most-recent matches per kind. One statement per kind because
// the Management API only returns the last statement's resultset.
function sampleStatement(kind, table, titleCol, userCol) {
  return `
${PATTERNS}
select '${kind}'::text as kind, ${titleCol} as title, created_at::text from ${table}
  where deleted_at is null and (
    ${userCol} in (select id from test_users)
    or exists (select 1 from test_prefixes where ${table}.${titleCol} like p || '%'))
  order by created_at desc limit 5;`;
}

const samples = [
  sampleStatement('task',      'tasks',             'title',     'created_by'),
  sampleStatement('follow_up', 'follow_ups',        'title',     'created_by'),
  sampleStatement('note',      'notes',             'title',     'created_by'),
  // Inspections has no title — show area + inspected_by-scope only.
  `${PATTERNS}
   select 'inspection'::text as kind, area as title, created_at::text from inspections
    where deleted_at is null and inspected_by in (select id from test_users)
    order by created_at desc limit 5;`,
  // Purchases: created_by OR requested_by, plus title prefix.
  `${PATTERNS}
   select 'purchase'::text as kind, title, created_at::text from purchase_requests
    where deleted_at is null and (
      created_by in (select id from test_users)
      or requested_by in (select id from test_users)
      or exists (select 1 from test_prefixes where purchase_requests.title like p || '%'))
    order by created_at desc limit 5;`,
  sampleStatement('document',  'documents',         'title',     'created_by'),
  // Companies / contacts have no e2e-admin user-scope path — prefix only.
  `${PATTERNS}
   select 'company'::text as kind, name as title, created_at::text from companies
    where deleted_at is null
      and exists (select 1 from test_prefixes where companies.name like p || '%')
    order by created_at desc limit 5;`,
  `${PATTERNS}
   select 'contact'::text as kind, full_name as title, created_at::text from contacts
    where deleted_at is null
      and exists (select 1 from test_prefixes where contacts.full_name like p || '%')
    order by created_at desc limit 5;`,
];

const closer = mode === 'dry' ? 'rollback;' : 'commit;';

// One transaction. Captures the affected ids in TEMP tables (which are
// dropped on commit/rollback), then mutates, then surfaces a 1-row delta
// summary as the LAST statement of the txn — that's what the API returns.
const cleanupTxn = `
begin;

create temp table _test_users on commit drop as
  select id from users where email like 'e2e-%@%';
-- Belt-and-braces: every fixture user must match the e2e-* pattern. If a
-- future spec introduces a new fixture user that doesn't, this stays
-- correct because the prefix-based matchers below still catch their data.
-- _test_users is intentionally narrower than "all non-Rabih users" — we
-- never want to delete data created by humans.

-- The temp-table matchers below use the same prefix array as PATTERNS
-- above. Kept inline (not via CTE) because the cleanup txn needs them
-- across multiple statements, where a single CTE would only be visible
-- inside one statement.
create temp table _test_prefixes on commit drop as
  select unnest(array[
    'H4.2 review ', 'H4.4 ', 'H4.4/5 ', 'H4.5 ', 'H4.7 ',
    'E2E Smoke ', 'E2E Test ', 'Contact-Co ', 'Contact-Person ', 'Phase Z ',
    'Smoke ', 'remediation smoke ',
    'Inbox today ', 'Inbox overdue ', 'Inbox finished ', 'Inbox FU ',
    'Linked-records target ', 'Phase-A lifecycle ',
    '[E2E] '
  ]) as p;

-- Subset matchers per table — some prefixes don't make sense everywhere
-- (e.g. 'Phase-A lifecycle ' is a task; 'Linked-records target ' is a note).
-- Errs on the safe side by sharing the full list — a non-matching prefix
-- just costs a few extra string comparisons.
create temp table _test_tasks on commit drop as
  select id from tasks where deleted_at is null and (
    created_by in (select id from _test_users)
    or exists (select 1 from _test_prefixes where tasks.title like p || '%'));

create temp table _test_follow_ups on commit drop as
  select id from follow_ups where deleted_at is null and (
    created_by in (select id from _test_users)
    or exists (select 1 from _test_prefixes where follow_ups.title like p || '%'));

-- Inspections: no title column, user-scope only.
create temp table _test_inspections on commit drop as
  select id from inspections where deleted_at is null
    and inspected_by in (select id from _test_users);

create temp table _test_purchases on commit drop as
  select id from purchase_requests where deleted_at is null and (
    created_by in (select id from _test_users)
    or requested_by in (select id from _test_users)
    or exists (select 1 from _test_prefixes where purchase_requests.title like p || '%'));

create temp table _test_notes on commit drop as
  select id from notes where deleted_at is null and (
    created_by in (select id from _test_users)
    or exists (select 1 from _test_prefixes where notes.title like p || '%'));

create temp table _test_documents on commit drop as
  select id from documents where deleted_at is null and (
    created_by in (select id from _test_users)
    or exists (select 1 from _test_prefixes where documents.title like p || '%'));

-- Companies / contacts: prefix-only path (no fixture-user link). 'H4.2 review '
-- added in second pass after the first run left a 'H4.2 review … supplier
-- contact' row behind.
create temp table _test_companies on commit drop as
  select id from companies where deleted_at is null
    and exists (select 1 from _test_prefixes where companies.name like p || '%');

create temp table _test_contacts on commit drop as
  select id from contacts where deleted_at is null
    and exists (select 1 from _test_prefixes where contacts.full_name like p || '%');

-- 1. Soft-delete link rows touching any test entity. record_links is
-- polymorphic so we filter per entity_type. email_links and document_links
-- have the same soft-delete column.
update record_links set deleted_at = now() where deleted_at is null and (
     (from_entity_type = 'task'             and from_entity_id in (select id from _test_tasks))
  or (to_entity_type   = 'task'             and to_entity_id   in (select id from _test_tasks))
  or (from_entity_type = 'follow_up'        and from_entity_id in (select id from _test_follow_ups))
  or (to_entity_type   = 'follow_up'        and to_entity_id   in (select id from _test_follow_ups))
  or (from_entity_type = 'inspection'       and from_entity_id in (select id from _test_inspections))
  or (to_entity_type   = 'inspection'       and to_entity_id   in (select id from _test_inspections))
  or (from_entity_type = 'purchase_request' and from_entity_id in (select id from _test_purchases))
  or (to_entity_type   = 'purchase_request' and to_entity_id   in (select id from _test_purchases))
  or (from_entity_type = 'note'             and from_entity_id in (select id from _test_notes))
  or (to_entity_type   = 'note'             and to_entity_id   in (select id from _test_notes))
  or (from_entity_type = 'document'         and from_entity_id in (select id from _test_documents))
  or (to_entity_type   = 'document'         and to_entity_id   in (select id from _test_documents))
  or (from_entity_type = 'company'          and from_entity_id in (select id from _test_companies))
  or (to_entity_type   = 'company'          and to_entity_id   in (select id from _test_companies))
  or (from_entity_type = 'contact'          and from_entity_id in (select id from _test_contacts))
  or (to_entity_type   = 'contact'          and to_entity_id   in (select id from _test_contacts)));

update email_links set deleted_at = now() where deleted_at is null and (
     (entity_type = 'task'      and entity_id in (select id from _test_tasks))
  or (entity_type = 'follow_up' and entity_id in (select id from _test_follow_ups)));

update document_links set deleted_at = now() where deleted_at is null and (
     (entity_type = 'task'             and entity_id in (select id from _test_tasks))
  or (entity_type = 'follow_up'        and entity_id in (select id from _test_follow_ups))
  or (entity_type = 'inspection'       and entity_id in (select id from _test_inspections))
  or (entity_type = 'purchase_request' and entity_id in (select id from _test_purchases))
  or document_id in (select id from _test_documents));

-- 2. Hard-delete child rows (comments / attachments) for soon-deleted parents.
delete from comments where
     (entity_type = 'task'             and entity_id in (select id from _test_tasks))
  or (entity_type = 'follow_up'        and entity_id in (select id from _test_follow_ups))
  or (entity_type = 'inspection'       and entity_id in (select id from _test_inspections))
  or (entity_type = 'purchase_request' and entity_id in (select id from _test_purchases))
  or (entity_type = 'note'             and entity_id in (select id from _test_notes))
  or (entity_type = 'document'         and entity_id in (select id from _test_documents));

delete from attachments where
     (entity_type = 'task'             and entity_id in (select id from _test_tasks))
  or (entity_type = 'follow_up'        and entity_id in (select id from _test_follow_ups))
  or (entity_type = 'inspection'       and entity_id in (select id from _test_inspections))
  or (entity_type = 'purchase_request' and entity_id in (select id from _test_purchases))
  or (entity_type = 'note'             and entity_id in (select id from _test_notes))
  or (entity_type = 'document'         and entity_id in (select id from _test_documents));

-- 3. Cancel pending/sent reminders pointing at any test entity, plus any
-- reminder whose recipient is a Playwright fixture user.
update notifications_queue
   set status        = 'cancelled',
       cancelled_at  = coalesce(cancelled_at, now()),
       cancel_reason = 'cleanup-test-data'
 where status in ('pending','sent') and (
       (entity_type = 'task'             and entity_id in (select id from _test_tasks))
    or (entity_type = 'follow_up'        and entity_id in (select id from _test_follow_ups))
    or (entity_type = 'inspection'       and entity_id in (select id from _test_inspections))
    or (entity_type = 'purchase_request' and entity_id in (select id from _test_purchases))
    or recipient_id in (select id from _test_users)
 );

-- 4. Soft-delete the parents themselves.
update tasks             set deleted_at = now() where id in (select id from _test_tasks);
update follow_ups        set deleted_at = now() where id in (select id from _test_follow_ups);
update inspections       set deleted_at = now() where id in (select id from _test_inspections);
update purchase_requests set deleted_at = now() where id in (select id from _test_purchases);
update notes             set deleted_at = now() where id in (select id from _test_notes);
update documents         set deleted_at = now() where id in (select id from _test_documents);
update companies         set deleted_at = now() where id in (select id from _test_companies);
update contacts          set deleted_at = now() where id in (select id from _test_contacts);

-- 5. Delta summary — last statement, so the API returns this resultset.
select bucket, n from (
  values
    ('tasks_touched',         (select count(*)::int from _test_tasks)),
    ('follow_ups_touched',    (select count(*)::int from _test_follow_ups)),
    ('inspections_touched',   (select count(*)::int from _test_inspections)),
    ('purchases_touched',     (select count(*)::int from _test_purchases)),
    ('notes_touched',         (select count(*)::int from _test_notes)),
    ('documents_touched',     (select count(*)::int from _test_documents)),
    ('companies_touched',     (select count(*)::int from _test_companies)),
    ('contacts_touched',      (select count(*)::int from _test_contacts))
) as t(bucket, n)
order by bucket;

${closer}
`;

// ---------- run ----------
console.log(`\nMode: ${mode.toUpperCase()}\n`);

console.log('=== PREVIEW: counts of in-scope rows ===');
const preview = await sql('preview', previewQuery);
console.table(preview);

console.log('\n=== SAMPLES: 5 most-recent matches per kind ===');
for (const stmt of samples) {
  const rows = await sql('sample', stmt);
  if (rows.length === 0) continue;
  console.log(`\n--- ${rows[0].kind ?? '?'}`);
  console.table(rows);
}

console.log('\n=== APPLYING CLEANUP TXN ===');
const result = await sql('cleanup', cleanupTxn);
console.table(result);

if (mode === 'dry') {
  console.log('\nDry run rolled back. No changes committed.');
  console.log('Run with `commit` to apply.');
} else {
  console.log('\n✅ Cleanup committed.');
}
