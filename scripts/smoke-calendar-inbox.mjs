// C1 smoke — Calendar Inbox foundation.
//
// Verifies the calendar_event_dismissals table, the _has_calendar_connection
// helper (active-only), and the four new RPCs:
//   rpc_calendar_dismiss_event
//   rpc_calendar_undismiss_event
//   rpc_list_calendar_dismissals
//   rpc_list_calendar_links_for_user
//
// Runs against staging via Management API + JWT impersonation. Idempotent;
// cleans up its own dismissal rows + the seeded calendar_event_links rows.
//
// Usage:
//   node --env-file=.env.local scripts/smoke-calendar-inbox.mjs

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
if (!t || !r) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

// Seeded users on staging.
const RABIH   = 'aa593e81-9efe-4091-b70e-f2fbf907b394'; // admin, ACTIVE calendar token
const MANAGER = '5984aba2-577c-4a2c-af40-21be89bdf9bd'; // manager, NO calendar token
const VIEWER  = '645aca0d-62d0-4f70-bd15-56d6b35faaa8'; // viewer, blocked by _can_mutate

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log('  ✓ ' + label + (detail ? '  — ' + detail : ''));
    pass++;
  } else {
    console.log('  ✗ ' + label + (detail ? '  — ' + detail : ''));
    fail++;
  }
}

async function sql(label, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true, rows: JSON.parse(text) };
}

async function expectErr(label, query, errcode) {
  const out = await sql(label, query);
  if (out.ok) {
    check(label, false, 'expected error but query succeeded');
    return;
  }
  check(label, out.error.includes(errcode), `code ${errcode}: got ${out.error.slice(0, 120)}`);
}

function asUser(uid, stmt) {
  return sql(
    `as ${uid}`,
    `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
     ${stmt}`,
  );
}

function pluck(rows) {
  return rows.find((x) => x.r)?.r;
}

console.log('\n=== C1 smoke: Calendar Inbox foundation ===\n');

// ------------------------------------------------------------------
// 0. Schema sanity
// ------------------------------------------------------------------
const tableOut = await sql(
  'table',
  `select count(*)::int as n from information_schema.tables
    where table_schema='public' and table_name='calendar_event_dismissals'`,
);
check('calendar_event_dismissals table exists', tableOut.rows[0].n === 1);

const colsOut = await sql(
  'columns',
  `select column_name from information_schema.columns
    where table_schema='public' and table_name='calendar_event_dismissals'
    order by ordinal_position`,
);
const colNames = colsOut.rows.map((c) => c.column_name);
const expectedCols = [
  'user_id','google_calendar_id','google_event_id',
  'recurring_event_id','is_series_dismiss',
  'summary','event_start','event_end','all_day','html_link','rrule','note',
  'dismissed_at','updated_at',
];
check(
  'columns match expected set',
  expectedCols.every((c) => colNames.includes(c)),
  `${colNames.length} present`,
);

const policyOut = await sql(
  'policy',
  `select policyname, cmd from pg_policies
    where schemaname='public' and tablename='calendar_event_dismissals'`,
);
check(
  'exactly one SELECT-own policy',
  policyOut.rows.length === 1
    && policyOut.rows[0].policyname === 'calendar_dismissals_select_own'
    && policyOut.rows[0].cmd === 'SELECT',
);

const triggerOut = await sql(
  'trigger',
  `select count(*)::int as n from pg_trigger
    where tgname='trg_calendar_dismissals_updated_at' and not tgisinternal`,
);
check('updated_at trigger installed', triggerOut.rows[0].n === 1);

const helperOut = await sql(
  'helper',
  `select count(*)::int as n from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public' and p.proname='_has_calendar_connection'`,
);
check('_has_calendar_connection helper exists', helperOut.rows[0].n === 1);

const rpcOut = await sql(
  'rpcs',
  `select proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public' and proname in (
      'rpc_calendar_dismiss_event','rpc_calendar_undismiss_event',
      'rpc_list_calendar_dismissals','rpc_list_calendar_links_for_user'
    )`,
);
check('all 4 new RPCs registered', rpcOut.rows.length === 4);

// ------------------------------------------------------------------
// 1. Permission gating
// ------------------------------------------------------------------

// VIEWER blocked at _can_mutate
await expectErr(
  'viewer: dismiss rejected by _can_mutate (42501)',
  `select set_config('request.jwt.claims', '{"sub":"${VIEWER}","role":"authenticated"}', true);
   select rpc_calendar_dismiss_event('primary','smoke-c1-viewer') as r`,
  '42501',
);

// MANAGER (no calendar token) blocked at _has_calendar_connection
await expectErr(
  'manager without calendar token: blocked by _has_calendar_connection (42501)',
  `select set_config('request.jwt.claims', '{"sub":"${MANAGER}","role":"authenticated"}', true);
   select rpc_calendar_dismiss_event('primary','smoke-c1-manager') as r`,
  '42501',
);

// ------------------------------------------------------------------
// 2. Input validation as RABIH (active calendar)
// ------------------------------------------------------------------

await expectErr(
  'empty google_event_id rejected (22023)',
  `select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
   select rpc_calendar_dismiss_event('primary','') as r`,
  '22023',
);

await expectErr(
  'series dismiss without recurring_event_id rejected (22023)',
  `select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
   select rpc_calendar_dismiss_event('primary','smoke-c1-series', true, null) as r`,
  '22023',
);

// ------------------------------------------------------------------
// 3. Happy path: dismiss instance, dismiss series, list, undismiss
// ------------------------------------------------------------------

const INSTANCE_ID = `smoke-c1-instance-${Date.now()}`;
const MASTER_ID   = `smoke-c1-master-${Date.now()}`;

// Dismiss instance with snapshot fields
const dismiss1 = await asUser(
  RABIH,
  `select rpc_calendar_dismiss_event(
     'primary', '${INSTANCE_ID}', false, null,
     'Smoke instance', '2026-06-01T10:00:00+02:00'::timestamptz,
     '2026-06-01T11:00:00+02:00'::timestamptz, false,
     'https://calendar.google.com/x', null, 'just noise'
   ) as r`,
);
const r1 = pluck(dismiss1.rows);
check(
  'instance dismiss writes row',
  !!r1 && r1.google_event_id === INSTANCE_ID && r1.is_series_dismiss === false,
);

// Audit row written
const audit1 = await sql(
  'audit instance',
  `select count(*)::int as n from audit_log
    where action='calendar_event_dismissed'
      and user_id='${RABIH}' and after_state->>'google_event_id'='${INSTANCE_ID}'`,
);
check('audit_log row written for instance dismiss', audit1.rows[0].n === 1);

// Re-dismiss: idempotent upsert
await new Promise((res) => setTimeout(res, 10));
const redismiss = await asUser(
  RABIH,
  `select rpc_calendar_dismiss_event(
     'primary', '${INSTANCE_ID}', false, null,
     null, null, null, null, null, null, 'note updated'
   ) as r`,
);
const r2 = pluck(redismiss.rows);
check(
  're-dismiss preserves snapshot (note overwritten only when passed)',
  r2 && r2.summary === 'Smoke instance' && r2.note === 'note updated',
);
check('re-dismiss advances updated_at', r2 && new Date(r2.updated_at) > new Date(r1.updated_at));

const dupCount = await sql(
  'no dup',
  `select count(*)::int as n from calendar_event_dismissals
    where user_id='${RABIH}' and google_event_id='${INSTANCE_ID}'`,
);
check('no duplicate row after re-dismiss', dupCount.rows[0].n === 1);

// Dismiss series
const dismiss2 = await asUser(
  RABIH,
  `select rpc_calendar_dismiss_event(
     'primary', '${MASTER_ID}', true, '${MASTER_ID}',
     'Smoke series', null, null, false, null,
     'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'series ignored'
   ) as r`,
);
const r3 = pluck(dismiss2.rows);
check('series dismiss writes row', r3 && r3.is_series_dismiss === true && r3.rrule.includes('RRULE'));

// List returns both, ordered newest-first
const listOut = await asUser(RABIH, 'select rpc_list_calendar_dismissals() as r');
const listRows = pluck(listOut.rows);
const ours = (listRows || []).filter((x) =>
  x.google_event_id === INSTANCE_ID || x.google_event_id === MASTER_ID,
);
check(
  'rpc_list_calendar_dismissals returns the two new rows',
  ours.length === 2,
  `${ours.length} found`,
);

// Undismiss instance
const undo1 = await asUser(
  RABIH,
  `select rpc_calendar_undismiss_event('primary', '${INSTANCE_ID}') as r`,
);
const u1 = pluck(undo1.rows);
check('undismiss instance returns removed=true', u1?.removed === true);

const audit2 = await sql(
  'audit undismiss',
  `select count(*)::int as n from audit_log
    where action='calendar_event_undismissed'
      and user_id='${RABIH}' and before_state->>'google_event_id'='${INSTANCE_ID}'`,
);
check('audit_log row written for undismiss', audit2.rows[0].n === 1);

const undo2 = await asUser(
  RABIH,
  `select rpc_calendar_undismiss_event('primary', '${INSTANCE_ID}') as r`,
);
const u2 = pluck(undo2.rows);
check('undismissing missing row returns removed=false', u2?.removed === false);

// ------------------------------------------------------------------
// 4. rpc_list_calendar_links_for_user — input + window + entity-title join
// ------------------------------------------------------------------

await expectErr(
  'null window rejected (22023)',
  `select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
   select rpc_list_calendar_links_for_user(null, now()) as r`,
  '22023',
);

await expectErr(
  'to < from rejected (22023)',
  `select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
   select rpc_list_calendar_links_for_user(now() + interval '1 day', now()) as r`,
  '22023',
);

// Seed a task + a calendar_event_link row inside the window
const taskCreate = await asUser(
  RABIH,
  `select rpc_create_task('salt','operations','Smoke C1 link target ${Date.now()}','normal',
     null, '${RABIH}'::uuid, null, 'not_started', null, null, null) as r`,
);
const taskRow = pluck(taskCreate.rows);
const taskId = taskRow?.id;
check('seed task created', !!taskId);

const SEED_EVENT_IN  = `smoke-c1-link-in-${Date.now()}`;
const SEED_EVENT_OUT = `smoke-c1-link-out-${Date.now()}`;

await sql(
  'seed link in window',
  `insert into calendar_event_links
     (entity_type, entity_id, user_id, google_calendar_id, google_event_id,
      event_title, event_start, event_end, event_html_link)
   values ('task', '${taskId}'::uuid, '${RABIH}'::uuid, 'primary', '${SEED_EVENT_IN}',
           'Smoke link in',
           '2026-06-15T10:00:00+02:00'::timestamptz,
           '2026-06-15T11:00:00+02:00'::timestamptz,
           'https://x.example/in')`,
);
await sql(
  'seed link out of window',
  `insert into calendar_event_links
     (entity_type, entity_id, user_id, google_calendar_id, google_event_id,
      event_title, event_start, event_end, event_html_link)
   values ('task', '${taskId}'::uuid, '${RABIH}'::uuid, 'primary', '${SEED_EVENT_OUT}',
           'Smoke link out',
           '2027-01-01T10:00:00+02:00'::timestamptz,
           '2027-01-01T11:00:00+02:00'::timestamptz,
           'https://x.example/out')`,
);

const winRes = await asUser(
  RABIH,
  `select rpc_list_calendar_links_for_user(
     '2026-06-01T00:00:00+02:00'::timestamptz,
     '2026-06-30T23:59:59+02:00'::timestamptz
   ) as r`,
);
const winRows = pluck(winRes.rows) || [];
const inIds = winRows.map((x) => x.google_event_id);
check('in-window link returned', inIds.includes(SEED_EVENT_IN));
check('out-of-window link NOT returned', !inIds.includes(SEED_EVENT_OUT));
const inRow = winRows.find((x) => x.google_event_id === SEED_EVENT_IN);
check(
  'entity_title joined from tasks',
  !!inRow && typeof inRow.entity_title === 'string' && inRow.entity_title.startsWith('Smoke C1 link target'),
);
check('mine flag is true', !!inRow && inRow.mine === true);

// ------------------------------------------------------------------
// 5. Cleanup
// ------------------------------------------------------------------
await asUser(
  RABIH,
  `select rpc_calendar_undismiss_event('primary', '${MASTER_ID}') as r`,
);
await sql(
  'cleanup links',
  `delete from calendar_event_links
    where google_event_id in ('${SEED_EVENT_IN}','${SEED_EVENT_OUT}')`,
);
await asUser(
  RABIH,
  `select rpc_delete_task('${taskId}'::uuid) as r`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
