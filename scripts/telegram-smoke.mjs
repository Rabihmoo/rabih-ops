// Production smoke test for the Telegram bot. Read-only against the
// app surface where possible; exercises every command path via RPC and
// verifies side-effects in the database.
//
// Usage: node --env-file=.env.local scripts/telegram-smoke.mjs

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
const TG = process.env.TELEGRAM_BOT_TOKEN;
const INTERNAL = process.env.TELEGRAM_INTERNAL_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;

if (!t || !r || !TG || !INTERNAL || !SUPABASE_URL) {
  console.error('Missing env: need SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, TELEGRAM_BOT_TOKEN, TELEGRAM_INTERNAL_SECRET, SUPABASE_URL');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const issues = [];

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL: ${text}`);
  return JSON.parse(text);
}
async function tg(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TG}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? '  — ' + detail : ''}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}${detail ? '  — ' + detail : ''}`);
    failed += 1;
    issues.push(`${label}${detail ? ': ' + detail : ''}`);
  }
}
function header(title) { console.log(`\n${title}`); }

// --------- 1. Link state ---------
header('1. LINK STATE');

const link = (await sql(
  `select tg_chat_id, tg_username, is_active, linked_at::text, last_seen_at::text, last_list_ids
     from telegram_chats where is_active = true`,
))[0];
check('exactly one active telegram_chats row', !!link);
const CHAT_ID = link?.tg_chat_id;
check('chat_id resolves to a Telegram user', !!CHAT_ID, `chat=${CHAT_ID} @${link?.tg_username}`);

const ACTIVE = (await sql(`select count(*)::int as n from telegram_chats where is_active=true`))[0].n;
check('only one active link in the table', ACTIVE === 1);

// Reject unlinked chat
try {
  await sql(`select rpc_telegram_today(99999::bigint)`);
  check('unlinked chat is rejected', false, 'expected error, none thrown');
} catch (e) {
  check('unlinked chat is rejected', /not linked/i.test(e.message));
}

// --------- 2. Commands via RPC ---------
header('2. COMMAND RPCs');

const today = (await sql(`select rpc_telegram_today(${CHAT_ID}::bigint)`))[0].rpc_telegram_today;
check('/today returns text', typeof today === 'string' && today.length > 0);
check('/today header present', /Your open tasks|Your tasks|Nothing open/.test(today));

const overdue = (await sql(`select rpc_telegram_overdue(${CHAT_ID}::bigint)`))[0].rpc_telegram_overdue;
check('/overdue returns text', typeof overdue === 'string');
const waiting = (await sql(`select rpc_telegram_waiting(${CHAT_ID}::bigint)`))[0].rpc_telegram_waiting;
check('/waiting returns text', typeof waiting === 'string');
const purchases = (await sql(`select rpc_telegram_purchases(${CHAT_ID}::bigint)`))[0].rpc_telegram_purchases;
check('/purchases returns text', typeof purchases === 'string');

// /task — create
const created = (await sql(
  `select rpc_telegram_create_task(${CHAT_ID}::bigint, 'Smoke test task', 'bbqhouse', 'normal', null) as r`,
))[0].r;
check('/task creates and replies', /Task created/.test(created), 'reply ok');

// Verify in tasks table
const taskRows = await sql(
  `select id, title, branch, status, created_by from tasks where title='Smoke test task' and deleted_at is null`,
);
check('task is in DB', taskRows.length === 1);
check('audit row exists', (await sql(
  `select count(*)::int as n from audit_log where action='create' and entity_type='task' and entity_id='${taskRows[0].id}' and source='telegram'`,
))[0].n === 1);

const SHORT = taskRows[0].id.substring(0, 8);

// /today again, this should now include the smoke task and remember the list
const today2 = (await sql(`select rpc_telegram_today(${CHAT_ID}::bigint)`))[0].rpc_telegram_today;
check('/today includes new task', today2.includes('Smoke test task'));

const last = (await sql(
  `select last_list_ids from telegram_chats where tg_chat_id=${CHAT_ID}`,
))[0].last_list_ids;
check('last_list_ids was set after /today', Array.isArray(last) && last.includes(taskRows[0].id));

// Resolve task #1 in the last list (find smoke task position)
const pos = (last || []).indexOf(taskRows[0].id) + 1;
check('smoke task has a positional number', pos > 0, `position #${pos}`);

// /note via short-id
const noted = (await sql(
  `select rpc_telegram_add_note(${CHAT_ID}::bigint, '${SHORT}', 'Smoke test note via Telegram') as r`,
))[0].r;
check('/note replies success', /Note added/.test(noted));
const commentRows = await sql(
  `select count(*)::int as n from comments where entity_type='task' and entity_id='${taskRows[0].id}' and body like 'Smoke test note%'`,
);
check('comment landed in comments table', commentRows[0].n === 1);

// /done via positional number
const done = (await sql(
  `select rpc_telegram_complete_task(${CHAT_ID}::bigint, '${pos}', 'Smoke pass') as r`,
))[0].r;
check('/done <pos> replies success', /finished/i.test(done));
const post = await sql(`select status, completed_at, outcome from tasks where id='${taskRows[0].id}'`);
check('task moved to finished', post[0].status === 'finished');
check('outcome captured', post[0].outcome === 'Smoke pass');

// --------- 3. Reminder delivery (Telegram channel) ---------
header('3. REMINDER DELIVERY');

// Create a fresh task assigned to the same user, with deadline 2 minutes in past
// (so the cron will pick it up immediately on the next tick).
const reminderTask = (await sql(
  `select rpc_telegram_create_task(${CHAT_ID}::bigint, 'Reminder smoke task', 'salt', 'normal', null) as r`,
))[0].r;
check('reminder host task created', /Task created/.test(reminderTask));

const rTaskId = (await sql(
  `select id from tasks where title='Reminder smoke task' and deleted_at is null order by created_at desc limit 1`,
))[0].id;

// Set deadline_reminder_at = now() - 30s so the trigger enqueues a "ready to fire" row.
await sql(
  `update tasks set deadline_reminder_at = now() - interval '30 seconds' where id='${rTaskId}'`,
);

const queueRows = await sql(
  `select id, channel, status, fire_at::text from notifications_queue where entity_id='${rTaskId}' order by id`,
);
check('two rows enqueued (in_app + telegram)', queueRows.length === 2);
check('one row is channel=in_app', queueRows.some((q) => q.channel === 'in_app'));
check('one row is channel=telegram', queueRows.some((q) => q.channel === 'telegram'));

// Force-fire the in_app one (drained by the existing pg_cron job — wait one tick or call directly).
await sql(`select public._drain_reminders()`);

// Force-fire the telegram one by hitting the tick Edge Function directly.
const tickRes = await fetch(`${SUPABASE_URL}/functions/v1/telegram-tick`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${INTERNAL}`, 'Content-Type': 'application/json' },
  body: '{}',
});
const tickBody = await tickRes.json();
check('telegram-tick responds 200', tickRes.ok, JSON.stringify(tickBody));

const queueAfter = await sql(
  `select id, channel, status, fired_at::text, last_error from notifications_queue where entity_id='${rTaskId}' order by id`,
);
check(
  'in_app row marked sent',
  queueAfter.some((q) => q.channel === 'in_app' && q.status === 'sent'),
);
check(
  'telegram row marked sent',
  queueAfter.some((q) => q.channel === 'telegram' && q.status === 'sent'),
  queueAfter.find((q) => q.channel === 'telegram')?.last_error ?? '',
);

const logRows = await sql(
  `select count(*)::int as n from notification_log where queue_id in (${queueAfter.map((q) => q.id).join(',')})`,
);
check('notification_log has both', logRows[0].n === 2);

const auditRows = await sql(
  `select action, count(*)::int as n from audit_log
    where entity_id='${rTaskId}' and source in ('trigger','cron','telegram')
    group by action order by action`,
);
check(
  'reminder_enqueued audited (≥2 — one per channel)',
  auditRows.find((r) => r.action === 'reminder_enqueued')?.n >= 2,
);
check(
  'reminder_sent audited (≥2)',
  auditRows.find((r) => r.action === 'reminder_sent')?.n >= 2,
);

// --------- 4. Daily summary ---------
header('4. DAILY SUMMARY');

const cron = await sql(`select jobname, schedule, active from cron.job where jobname='telegram-tick'`);
check('telegram-tick cron is active', cron.length === 1 && cron[0].active);

// Build the summary text (the Edge Function would call this internally at 08:00 Maputo).
const summary = (await sql(`select rpc_telegram_daily_summary(${CHAT_ID}::bigint)`))[0].rpc_telegram_daily_summary;
check('daily summary builds', typeof summary === 'string' && summary.length > 0);

// Send it once now so we can confirm delivery via Telegram.
const sent = await tg('sendMessage', {
  chat_id: CHAT_ID,
  text: '🧪 (smoke) Daily summary preview\n\n' + summary,
  disable_web_page_preview: true,
});
check('daily summary delivered to Telegram', sent.ok === true);

// Confirm only admin/CEO are in the active-chats list.
const activeChats = (await sql(`select rpc_list_active_telegram_chats() as r`))[0].r;
check(
  'only admin/CEO chats are listed',
  Array.isArray(activeChats) && activeChats.every((c) => ['admin', 'ceo'].includes(c.role)),
  `roles=${activeChats.map((c) => c.role).join(',')}`,
);

// --------- 5. Cleanup ---------
header('5. CLEANUP');

// Soft-delete the smoke tasks (they're already in audit history; we just hide them).
const cleaned = await sql(
  `update tasks set deleted_at = now() where title in ('Smoke test task','Reminder smoke task') and deleted_at is null returning id`,
);
check(`soft-deleted ${cleaned.length} smoke task(s)`, cleaned.length >= 2);

// Cancel any leftover telegram_messages that piled up during testing? Keep them as history.
const msgs = (await sql(
  `select count(*)::int as n from telegram_messages where created_at >= now() - interval '2 hours'`,
))[0].n;
console.log(`  · ${msgs} telegram_messages logged in the last 2h (kept as audit)`);

// --------- summary ---------
console.log('');
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Issues:');
  for (const i of issues) console.log(`  - ${i}`);
  process.exit(1);
}
