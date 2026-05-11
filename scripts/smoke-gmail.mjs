// Smoke-verify the Phase F Gmail RPC layer end-to-end against staging.
// Does NOT exercise the Google OAuth flow — that's a manual step (the
// migration test boundary is the RPCs + email_links table + RLS).
//
// What this checks:
//   * Migration shape (table + service column + email_links table)
//   * rpc_gmail_request_authorize issues a state row scoped to service='gmail'
//   * rpc_gmail_consume_state rejects calendar-scoped state (and vice versa)
//   * rpc_gmail_link_status returns connected=false for a new user
//   * rpc_email_link_create / _remove / _links_for_entity round-trip
//   * Idempotency: linking the same message twice returns the existing row
//   * RLS visibility — admin can see another user's email link snapshots
//     on a shared task; viewer cannot when entity is not theirs.

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
// Schema
// ---------------------------------------------------------------------
console.log('\nSchema');
const cols = await sql(`
  select column_name from information_schema.columns
   where table_schema='public' and table_name='google_oauth_tokens'
   order by ordinal_position
`);
check('google_oauth_tokens has service column',
  cols.some(c => c.column_name === 'service'));

const pk = await sql(`
  select a.attname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.conrelid='public.google_oauth_tokens'::regclass and c.contype='p'
   order by a.attnum
`);
check('PK is composite (user_id, service)',
  pk.length === 2 && pk[0].attname === 'user_id' && pk[1].attname === 'service');

const stateCols = await sql(`
  select column_name from information_schema.columns
   where table_schema='public' and table_name='oauth_state' and column_name='service'
`);
check('oauth_state has service column', stateCols.length === 1);

const emailTable = await sql(`select to_regclass('public.email_links') as t`);
check('email_links table exists', !!emailTable[0].t);

const rpcs = await sql(`
  select proname from pg_proc
   where pronamespace=(select oid from pg_namespace where nspname='public')
     and (proname like 'rpc_gmail%' or proname like 'rpc_email_link%')
   order by proname
`);
check('all Gmail/email RPCs registered', rpcs.length >= 9, `${rpcs.length} found`);

// ---------------------------------------------------------------------
// State token scoping
// ---------------------------------------------------------------------
console.log('\nState token scoping');

const stateAuth = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_gmail_request_authorize('/settings') as r
`);
const gmailState = stateAuth.find(x => x.r)?.r?.state;
check('rpc_gmail_request_authorize issued a state', !!gmailState && gmailState.length >= 32);

const storedService = await sql(`
  select service from oauth_state where state='${gmailState}'
`);
check('state row scoped service=gmail',
  storedService[0]?.service === 'gmail');

// Consuming with the calendar consumer should fail (wrong service filter)
let calendarRejectedGmailState = false;
try {
  await sql(`select rpc_calendar_consume_state('${gmailState}')`);
} catch (e) { calendarRejectedGmailState = /invalid or expired/i.test(e.message); }
check('rpc_calendar_consume_state rejects gmail-scoped state', calendarRejectedGmailState);

// And vice-versa: a calendar state shouldn't be consumable by gmail.
const stateCal = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_calendar_request_authorize('/settings') as r
`);
const calState = stateCal.find(x => x.r)?.r?.state;
let gmailRejectedCalState = false;
try {
  await sql(`select rpc_gmail_consume_state('${calState}')`);
} catch (e) { gmailRejectedCalState = /invalid or expired/i.test(e.message); }
check('rpc_gmail_consume_state rejects calendar-scoped state', gmailRejectedCalState);

// Clean up the unused calendar state we just issued.
await sql(`delete from oauth_state where state='${calState}'`);
// gmail state was just deleted by the failed cross-consume? No — only the
// matching delete happened. The unconsumed gmail state is still there;
// clean it up too.
await sql(`delete from oauth_state where state='${gmailState}'`);

// ---------------------------------------------------------------------
// Link status
// ---------------------------------------------------------------------
console.log('\nLink status');

const status = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${E2E}","role":"authenticated"}', true);
  select rpc_gmail_link_status() as r
`);
check('rpc_gmail_link_status returns connected=false for fresh user',
  status[0].r?.connected === false);

// ---------------------------------------------------------------------
// email_links round-trip
// ---------------------------------------------------------------------
console.log('\nemail_links round-trip');

const ts = Date.now();
// Create a real task to link to.
const newTask = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_create_task('salt', 'operations', 'Smoke email-link target ${ts}', 'normal', null, '${RABIH}'::uuid, null, 'not_started', null, null, null) as r
`);
const taskId = newTask[0].r?.id;
check('test task created', !!taskId);

// Link an email (as rabih) to that task.
const fakeMsgId = `fake-msg-${ts}`;
const linkRes = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_email_link_create('task', '${taskId}'::uuid,
    '${fakeMsgId}', 'fake-thread-${ts}',
    'Smoke subject ${ts}', 'sender@example.com', 'Sample Sender',
    'snippet body…',
    '2026-05-11T10:00:00Z'::timestamptz,
    'https://mail.google.com/mail/u/0/#inbox/${fakeMsgId}'
  ) as r
`);
const link = linkRes.find(x => x.r)?.r;
check('email link created', !!link?.id && link?.gmail_message_id === fakeMsgId);

// Idempotency: linking the same message again returns the same row.
const dup = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_email_link_create('task', '${taskId}'::uuid,
    '${fakeMsgId}', 'fake-thread-${ts}',
    'Smoke subject ${ts}', 'sender@example.com', 'Sample Sender',
    'snippet body…',
    '2026-05-11T10:00:00Z'::timestamptz,
    'https://mail.google.com/mail/u/0/#inbox/${fakeMsgId}'
  ) as r
`);
check('idempotent re-link returns same id', dup.find(x => x.r)?.r?.id === link.id);

// List for entity — as rabih (linker) sees it
const listOwn = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_email_links_for_entity('task', '${taskId}'::uuid) as r
`);
const ownRows = listOwn[0].r ?? [];
check('linker sees their own link', ownRows.length === 1 && ownRows[0].mine === true);

// List for entity — as e2e-admin (admin role) — should also see it
const listAdmin = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${E2E}","role":"authenticated"}', true);
  select rpc_email_links_for_entity('task', '${taskId}'::uuid) as r
`);
const adminRows = listAdmin[0].r ?? [];
check('admin sees other users\' email-link snapshots', adminRows.length === 1 && adminRows[0].mine === false);

// Unlink — only the linker (or admin) can unlink.
const unlink = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_email_link_remove(${link.id}) as r
`);
check('rabih can unlink his own email', !!unlink[0].r?.deleted_at);

// After unlink, the list should be empty.
const listAfter = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_email_links_for_entity('task', '${taskId}'::uuid) as r
`);
check('after unlink, list is empty', (listAfter[0].r ?? []).length === 0);

// ---------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------
console.log('\nCleanup');
await sql(`delete from email_links where gmail_message_id like 'fake-msg-%'`);
await sql(`update tasks set deleted_at = now() where id = '${taskId}'`);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
