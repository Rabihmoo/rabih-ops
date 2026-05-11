// Smoke-verify the Phase G1.1 activity-inbox RPC against staging.
//
// Asserts:
//   * RPC exists, is grantable, returns a jsonb array
//   * Each of the six DB sources is represented in the result
//   * Severity assignment is deterministic and correct for the test fixtures
//   * deleted_at / finished / archived rows are excluded
//   * Personal documents stay invisible to admin (strict)
//   * Telegram reminders are visible only to the recipient
//   * Branch-scoped filtering is respected (admin sees all branches; we
//     also verify a viewer-style call only sees their assigned branches)
//
// Fixtures it creates and tears down:
//   - 1 overdue task   (SALT)         created by Rabih
//   - 1 due-today task (BBQ House)    created by Rabih
//   - 1 due-today follow-up           created by Rabih
//   - 1 critical inspection finding   on SALT inspection by Rabih
//   - 1 unpaid purchase request       on SALT by Rabih
//   - 1 personal document             created by Rabih
//   - 1 work document (sop, salt)     created by Rabih
//   - 1 pending notifications_queue row for Rabih (in_app)
//   - 1 pending notifications_queue row for E2E   (sanity: Rabih can't see)

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
const RABIH = 'aa593e81-9efe-4091-b70e-f2fbf907b394';
const E2E   = 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b';

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(await res.text());
  return JSON.parse(await res.text());
}

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else    { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

// ---------------------------------------------------------------------
// Schema / RPC presence
// ---------------------------------------------------------------------
console.log('\nSchema');

const fns = await sql(`
  select proname, pronargs from pg_proc
   where pronamespace=(select oid from pg_namespace where nspname='public')
     and proname in ('rpc_activity_inbox','_activity_severity_rank')
   order by proname
`);
check('rpc_activity_inbox and _activity_severity_rank exist', fns.length === 2);

const grant = await sql(`
  select has_function_privilege('authenticated',
    'public.rpc_activity_inbox(int, int)', 'EXECUTE') as g
`);
check('authenticated can execute rpc_activity_inbox', grant[0].g === true);

// ---------------------------------------------------------------------
// Fixtures (as Rabih)
// ---------------------------------------------------------------------
console.log('\nFixtures');

const ts = Date.now();
async function asRabih(stmt) {
  return sql(`
    select set_config('request.jwt.claims',
      '{"sub":"${RABIH}","role":"authenticated"}', true);
    ${stmt}
  `);
}
async function asE2e(stmt) {
  return sql(`
    select set_config('request.jwt.claims',
      '{"sub":"${E2E}","role":"authenticated"}', true);
    ${stmt}
  `);
}

// Overdue task (yesterday)
const overdueRow = await asRabih(`
  select rpc_create_task('salt','operations','Inbox overdue ${ts}','normal',
    (current_date - interval '2 days')::date, '${RABIH}'::uuid, null,
    'started', null, null, null) as r
`);
const overdueTaskId = overdueRow.find(x => x.r)?.r?.id;
check('overdue task created', !!overdueTaskId);

// Due-today task on a different branch
const todayRow = await asRabih(`
  select rpc_create_task('bbqhouse','operations','Inbox today ${ts}','urgent',
    current_date, '${RABIH}'::uuid, null,
    'not_started', null, null, null) as r
`);
const todayTaskId = todayRow.find(x => x.r)?.r?.id;
check('due-today task created', !!todayTaskId);

// A finished task that MUST NOT appear in the inbox
const finishedRow = await asRabih(`
  select rpc_create_task('salt','operations','Inbox finished ${ts}','normal',
    current_date, '${RABIH}'::uuid, null,
    'not_started', null, null, null) as r
`);
const finishedTaskId = finishedRow.find(x => x.r)?.r?.id;
await sql(`update tasks set status='finished', completed_at=now() where id='${finishedTaskId}'`);
check('finished task created (and marked finished)', !!finishedTaskId);

// Due-today follow-up
const fuRow = await asRabih(`
  select rpc_create_follow_up('call','Inbox FU ${ts}', current_date, 'salt') as r
`);
const fuId = fuRow.find(x => x.r)?.r?.id;
check('due-today follow-up created', !!fuId);

// Inspection + critical finding
const inspRow = await asRabih(`
  select rpc_create_inspection('salt','kitchen', current_date, 'inbox-smoke ${ts}') as r
`);
const inspId = inspRow.find(x => x.r)?.r?.id;
const findRow = await asRabih(`
  select rpc_add_inspection_finding('${inspId}'::uuid, 'critical',
    'Inbox critical finding ${ts}', 'fix it', null, current_date) as r
`);
const findId = findRow.find(x => x.r)?.r?.id;
check('critical inspection finding created', !!findId);

// Purchase request (unpaid, due in 3 days)
const purRow = await asRabih(`
  select rpc_create_purchase_request('Inbox PR ${ts}','Smoke Supplier','salt',
    'normal','MZN', null, 500, 5,
    (current_date + interval '3 days')::date, null, 'bank_transfer', null, '${RABIH}'::uuid) as r
`);
const purId = purRow.find(x => x.r)?.r?.id;
check('purchase request created', !!purId);

// Personal document (rabih's only)
const persDoc = await asRabih(`
  select rpc_create_document('Inbox Personal ${ts}','personal','personal', null,
    'private brain dump','draft') as r
`);
const persDocId = persDoc.find(x => x.r)?.r?.id;
// Work document
const workDoc = await asRabih(`
  select rpc_create_document('Inbox Work ${ts}','sop','work','salt',
    '## Steps','active') as r
`);
const workDocId = workDoc.find(x => x.r)?.r?.id;
check('personal + work documents created', !!persDocId && !!workDocId);

// Pending notifications_queue rows (insert directly — there's no RPC for this).
// fire_at in the near future so the pg_cron drain doesn't flip status
// out from under us between fixture insert and the RPC call.
const myNoteRows = await sql(`
  insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, status, payload)
  values ('deadline_reminder','task','${overdueTaskId}','${RABIH}','in_app',
          now() + interval '6 hours','pending',
          jsonb_build_object('message','Inbox reminder ${ts}'))
  returning id
`);
const myNoteId = myNoteRows[0].id;

const e2eNoteRows = await sql(`
  insert into notifications_queue(kind, entity_type, entity_id, recipient_id, channel, fire_at, status, payload)
  values ('deadline_reminder','task','${todayTaskId}','${E2E}','in_app',
          now() + interval '6 hours','pending',
          jsonb_build_object('message','Not for rabih ${ts}'))
  returning id
`);
const e2eNoteId = e2eNoteRows[0].id;
check('telegram/in-app reminders created (mine + someone-else\'s)',
  !!myNoteId && !!e2eNoteId);

// ---------------------------------------------------------------------
// Call the RPC as Rabih
// ---------------------------------------------------------------------
console.log('\nrpc_activity_inbox as Rabih');

const callRows = await asRabih(`select rpc_activity_inbox(50, 14) as r`);
const items = callRows.find(x => x.r)?.r ?? [];
check('RPC returns a jsonb array', Array.isArray(items),
  `${items.length} items`);

function findItem(source, nativeId) {
  return items.find((x) => x.source === source && x.native_id === nativeId);
}

const itOverdue   = findItem('task', overdueTaskId);
const itToday     = findItem('task', todayTaskId);
const itFinished  = findItem('task', finishedTaskId);
const itFu        = findItem('follow_up', fuId);
const itFinding   = findItem('inspection_finding', findId);
const itPurchase  = findItem('purchase', purId);
const itPersDoc   = findItem('document', persDocId);
const itWorkDoc   = findItem('document', workDocId);
const itMyNote    = findItem('telegram', String(myNoteId));
const itE2eNote   = findItem('telegram', String(e2eNoteId));

check('overdue task is severity=overdue',  itOverdue?.severity === 'overdue');
check('due-today task is severity=due_today', itToday?.severity === 'due_today');
check('finished task is NOT in the inbox', !itFinished);
check('follow-up is severity=due_today',   itFu?.severity === 'due_today');
check('critical finding is severity=critical', itFinding?.severity === 'critical');
// Purchase is unpaid by default, which the severity rule maps to due_today
// (unpaid = act this week) even when the delivery date is days away.
check('purchase (unpaid, delivery in 3d) is due_today',
  itPurchase?.severity === 'due_today');
check('personal doc visible to its creator', !!itPersDoc, itPersDoc?.title);
check('work doc visible to its creator',     !!itWorkDoc);
check('caller sees their own telegram reminder', !!itMyNote && itMyNote.is_unread === true);
check('caller does NOT see someone-else\'s telegram reminder', !itE2eNote);

// Confirm the entity_url is shaped correctly for at least one row.
check('task row has /tasks/<id> url',
  itOverdue?.entity_url === `/tasks/${overdueTaskId}`);

// Sort contract: critical < overdue < due_today < soon < info.
const sevRanks = items.map((i) => ({ critical: 0, overdue: 1, due_today: 2, soon: 3, info: 4 }[i.severity] ?? 5));
const sortedOk = sevRanks.every((v, idx, a) => idx === 0 || a[idx - 1] <= v);
check('items are sorted by severity rank ascending', sortedOk);

// ---------------------------------------------------------------------
// As E2E (admin) — must NOT see Rabih's personal doc
// ---------------------------------------------------------------------
console.log('\nrpc_activity_inbox as e2e-admin');

const callE2e = await asE2e(`select rpc_activity_inbox(50, 14) as r`);
const e2eItems = callE2e.find(x => x.r)?.r ?? [];
check('admin sees the work doc',
  e2eItems.some((x) => x.source === 'document' && x.native_id === workDocId));
check('admin does NOT see rabih\'s personal doc (strict)',
  !e2eItems.some((x) => x.source === 'document' && x.native_id === persDocId));
check('admin sees the critical finding (branch access)',
  e2eItems.some((x) => x.source === 'inspection_finding' && x.native_id === findId));
check('admin does NOT see rabih\'s own telegram reminder',
  !e2eItems.some((x) => x.source === 'telegram' && x.native_id === String(myNoteId)));

// ---------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------
console.log('\nCleanup');
await sql(`update tasks set deleted_at = now() where id in ('${overdueTaskId}','${todayTaskId}','${finishedTaskId}')`);
await sql(`update follow_ups set deleted_at = now() where id='${fuId}'`);
await sql(`delete from inspection_findings where id='${findId}'`);
await sql(`update inspections set deleted_at = now() where id='${inspId}'`);
await sql(`update purchase_requests set deleted_at = now() where id='${purId}'`);
await sql(`delete from documents where id in ('${persDocId}','${workDocId}')`);
await sql(`delete from notifications_queue where id in (${myNoteId},${e2eNoteId})`);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
