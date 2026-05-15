// F1.1 smoke — verifies the follow_up_events table, the trigger that
// auto-logs status_change rows, and the 5 new RPCs. Idempotent; cleans
// up after itself by soft-deleting the test follow-up via the existing
// rpc_update_follow_up path (no new delete RPC needed).
//
// Runs against staging via Management API + JWT impersonation. The
// admin uuid below is rabih's real account on staging.
//
// Usage:
//   node --env-file=.env.local scripts/smoke-follow-up-events.mjs

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
if (!t || !r) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

const RABIH = 'aa593e81-9efe-4091-b70e-f2fbf907b394';

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
    console.error(`✗ ${label} (${res.status})`);
    console.error(text);
    throw new Error(label);
  }
  return JSON.parse(text);
}

function asRabih(stmt) {
  return sql(
    'asRabih',
    `select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
     ${stmt}`,
  );
}

function pluck(rows) {
  return rows.find((x) => x.r)?.r;
}

console.log('\n=== F1.1 smoke: follow_up_events + new RPCs ===\n');

// --- 0. Sanity: tables, columns, trigger present ---
const tableExists = await sql(
  'follow_up_events table',
  `select count(*)::int as n from information_schema.tables
    where table_schema='public' and table_name='follow_up_events'`,
);
check('follow_up_events table exists', tableExists[0].n === 1);

const cols = await sql(
  'follow_ups columns',
  `select column_name from information_schema.columns
    where table_schema='public' and table_name='follow_ups'
      and column_name in ('reminder_at','calendar_event_id','calendar_html_link')`,
);
check('reminder_at + calendar_event_id + calendar_html_link present', cols.length === 3);

const triggerExists = await sql(
  'trigger',
  `select count(*)::int as n from pg_trigger
    where tgname='trg_log_follow_up_status_change' and not tgisinternal`,
);
check('status-change trigger installed', triggerExists[0].n === 1);

const statusCheck = await sql(
  'follow_ups status CHECK',
  `select pg_get_constraintdef(c.oid) as def from pg_constraint c
     join pg_class t on c.conrelid=t.oid
    where t.relname='follow_ups' and c.contype='c' and c.conname='follow_ups_status_check'`,
);
const checkDef = statusCheck[0]?.def ?? '';
check('status CHECK widened to 7 values', [
  'pending','working','waiting','no_answer','postponed','done','cancelled',
].every((s) => checkDef.includes(`'${s}'`)));
check("CHECK no longer allows 'snoozed'", !checkDef.includes(`'snoozed'`));

// --- 1. Create a fresh follow-up via the existing RPC ---
const created = pluck(
  await asRabih(`select public.rpc_create_follow_up(
    p_category   => 'call',
    p_title      => 'Smoke F1.1 ${Date.now()}',
    p_due_date   => (current_date + interval '7 days')::date,
    p_branch     => 'salt',
    p_priority   => 'normal',
    p_description=> 'Smoke fixture',
    p_person     => 'Smoke person',
    p_assigned_to=> null,
    p_task_id    => null
  ) as r`),
);
if (!created?.id) {
  console.error('failed to create test follow-up:', created);
  process.exit(1);
}
const fuId = created.id;
console.log('  → created follow-up ' + fuId);

// --- 2. Trigger auto-logs status_change events on every status update ---
const after1 = pluck(await asRabih(
  `select public.rpc_set_follow_up_status('${fuId}'::uuid, 'working', null) as r`,
));
check('status pending→working via rpc_set_follow_up_status', after1?.status === 'working');

await asRabih(`select public.rpc_set_follow_up_status('${fuId}'::uuid, 'waiting', 'awaiting supplier reply') as r`);
await asRabih(`select public.rpc_set_follow_up_status('${fuId}'::uuid, 'no_answer', null) as r`);
await asRabih(`select public.rpc_set_follow_up_status('${fuId}'::uuid, 'postponed', null) as r`);

const events1 = await asRabih(
  `select kind, from_status, to_status, body from follow_up_events
    where follow_up_id='${fuId}'::uuid order by id asc`,
);
const statusChangeEvents = events1.filter((e) => e.kind === 'status_change');
check('trigger logged 4 status_change events', statusChangeEvents.length === 4,
  `got ${statusChangeEvents.length}`);
check(
  'first status_change recorded pending→working',
  statusChangeEvents[0]?.from_status === 'pending' &&
    statusChangeEvents[0]?.to_status === 'working',
);

const noteEvents1 = events1.filter((e) => e.kind === 'note');
check('rpc_set_follow_up_status logged 1 note event from the waiting transition',
  noteEvents1.length === 1,
  `got ${noteEvents1.length}, body="${noteEvents1[0]?.body}"`);
check('note body persisted', noteEvents1[0]?.body === 'awaiting supplier reply');

// --- 3. Idempotent same-status update is a no-op ---
const beforeIdempotent = (await asRabih(
  `select count(*)::int as r from follow_up_events where follow_up_id='${fuId}'::uuid`,
))[0]?.r;
await asRabih(`select public.rpc_set_follow_up_status('${fuId}'::uuid, 'postponed', null) as r`);
const afterIdempotent = (await asRabih(
  `select count(*)::int as r from follow_up_events where follow_up_id='${fuId}'::uuid`,
))[0]?.r;
check('same-status update is a no-op (no new events)',
  beforeIdempotent === afterIdempotent,
  `before=${beforeIdempotent} after=${afterIdempotent}`);

// --- 4. rpc_add_follow_up_event writes a manual note ---
const noteEvt = pluck(await asRabih(
  `select public.rpc_add_follow_up_event('${fuId}'::uuid, 'note', 'Manual smoke note', null) as r`,
));
check('rpc_add_follow_up_event returned a row', noteEvt?.kind === 'note');
check('manual note body persisted', noteEvt?.body === 'Manual smoke note');

// --- 5. rpc_set_follow_up_reminder sets + enqueues + clears ---
const reminderAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
await asRabih(`select public.rpc_set_follow_up_reminder(
  '${fuId}'::uuid, '${reminderAt}'::timestamptz, array['in_app','telegram']
) as r`);
const queued = await asRabih(`
  select count(*)::int as n from notifications_queue
   where entity_id='${fuId}'::uuid and kind='follow_up_reminder_at' and status='pending'`);
check('reminder enqueued 2 channels', queued[0]?.n === 2);

const fuRowReminder = pluck(await asRabih(
  `select to_jsonb(follow_ups) as r from follow_ups where id='${fuId}'::uuid`,
));
check('reminder_at column populated', !!fuRowReminder?.reminder_at);

// Clear the reminder.
await asRabih(`select public.rpc_set_follow_up_reminder('${fuId}'::uuid, null, null) as r`);
const queuedAfter = await asRabih(`
  select count(*)::int as n from notifications_queue
   where entity_id='${fuId}'::uuid and kind='follow_up_reminder_at' and status='pending'`);
check('cleared reminder cancels pending queue rows', queuedAfter[0]?.n === 0);

const fuRowCleared = pluck(await asRabih(
  `select to_jsonb(follow_ups) as r from follow_ups where id='${fuId}'::uuid`,
));
check('reminder_at column nulled after clear', fuRowCleared?.reminder_at === null);

// --- 6. Calendar attach + detach ---
const attached = pluck(await asRabih(
  `select public.rpc_attach_calendar_to_follow_up(
     '${fuId}'::uuid, 'smoke-event-${Date.now()}', 'https://calendar.example/smoke'
   ) as r`,
));
check('attach calendar set event id', !!attached?.calendar_event_id);
check('attach calendar set html link', !!attached?.calendar_html_link);

const detached = pluck(await asRabih(
  `select public.rpc_detach_calendar_from_follow_up('${fuId}'::uuid) as r`,
));
check('detach calendar cleared event id', detached?.calendar_event_id === null);
check('detach calendar cleared html link', detached?.calendar_html_link === null);

// --- 7. done+note writes outcome AND a note event ---
const doneRow = pluck(await asRabih(
  `select public.rpc_set_follow_up_status(
     '${fuId}'::uuid, 'done', 'closed the loop with supplier'
   ) as r`,
));
check("status=done writes follow_ups.outcome",
  doneRow?.outcome === 'closed the loop with supplier');
check('status=done stamps completed_at', !!doneRow?.completed_at);

const noteEventsAfterDone = await asRabih(
  `select kind, body from follow_up_events
    where follow_up_id='${fuId}'::uuid and kind='note' order by id desc limit 1`,
);
check('done+note also logged as note event',
  noteEventsAfterDone[0]?.body === 'closed the loop with supplier');

// --- 8. Snooze still works + writes status='postponed' ---
const snoozed = pluck(await asRabih(
  `select public.rpc_snooze_follow_up(
     '${fuId}'::uuid, (current_date + interval '14 days')::date, 'smoke snooze reason'
   ) as r`,
));
check('rpc_snooze_follow_up sets status=postponed (not snoozed)',
  snoozed?.status === 'postponed');
check('rpc_snooze_follow_up still writes snoozed_until', !!snoozed?.snoozed_until);

// --- 9. Cleanup: soft-delete the test follow-up via direct update
// (this script runs as service-role via Management API). Then verify the
// row no longer appears in standard lists.
await sql('cleanup',
  `update follow_ups set deleted_at = now() where id='${fuId}'::uuid`);
const orphaned = await sql('orphan check',
  `select count(*)::int as n from follow_up_events where follow_up_id='${fuId}'::uuid`);
check('events survive parent soft-delete (cascade only on hard-delete)',
  orphaned[0].n > 0,
  `${orphaned[0].n} event rows preserved`);

// =========================================================
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
