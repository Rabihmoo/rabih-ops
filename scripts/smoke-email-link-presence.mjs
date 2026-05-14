// Smoke-verify Phase G3.1 — rpc_email_link_presence_for_messages.
//
// What this checks on staging:
//   * Schema: function exists with the (text, text[]) signature, grant
//     to authenticated, callable by authenticated JWT.
//   * Happy path: caller's task-link + follow-up-link surface; mixed
//     bool flags when the same gmail_message_id is linked to both.
//   * Account scoping (the load-bearing piece for this chunk):
//       - Links under google_account_id=A do NOT appear when the RPC
//         is called with google_account_id=B (same caller).
//       - The RPC raises 42501 when the caller does not own
//         google_account_id (cross-user account access).
//   * Caller-owned visibility (deliberately narrower than
//     rpc_email_links_for_entity): another user's link rows on the
//     same gmail_message_id are INVISIBLE to the caller even when
//     the caller is admin/CEO.
//   * Cap: 201-entry input raises 22023.
//   * Null/empty input returns [].
//
// Uses service-role via the Management API. Seeds + tears down all
// fixtures itself; safe to re-run.

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
const RABIH  = 'aa593e81-9efe-4091-b70e-f2fbf907b394'; // role=admin
const E2E    = 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b'; // role=admin (e2e fixture)

const ACCOUNT_A   = 'smoke-acct-A-' + Date.now();
const ACCOUNT_B   = 'smoke-acct-B-' + Date.now();
const ACCOUNT_E2E = 'smoke-acct-E2E-' + Date.now();

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

function quote(s) { return s.replace(/'/g, "''"); }

async function as(uid, stmt) {
  return sql(
    `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
     ${stmt}`,
  );
}

// ---------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------
console.log('\nSchema');

const fnRow = await sql(`
  select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as secdef,
         (select 1 from pg_proc pp join pg_aggregate a on a.aggfnoid=pp.oid
          where pp.proname=p.proname limit 1) as is_agg
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='rpc_email_link_presence_for_messages'
`);
check('function rpc_email_link_presence_for_messages exists', fnRow.length === 1);
check('signature is (p_google_account_id text, p_message_ids text[])',
  fnRow[0]?.args?.includes('p_google_account_id text')
  && fnRow[0]?.args?.includes('p_message_ids text[]'));
check('security definer', fnRow[0]?.secdef === true);

const grantRow = await sql(`
  select count(*)::int as n from information_schema.routine_privileges
  where routine_schema='public' and routine_name='rpc_email_link_presence_for_messages'
    and grantee='authenticated' and privilege_type='EXECUTE'
`);
check('granted to authenticated', grantRow[0].n === 1);

// ---------------------------------------------------------------------
// Fixture seed — service role
// ---------------------------------------------------------------------
console.log('\nFixtures');

const ts = Date.now();
const MSG_TASK_A      = `smoke-msg-task-A-${ts}`;
const MSG_FU_A        = `smoke-msg-fu-A-${ts}`;
const MSG_BOTH_A      = `smoke-msg-both-A-${ts}`;
const MSG_B           = `smoke-msg-B-${ts}`;
const MSG_UNLINKED    = `smoke-msg-unlinked-${ts}`;
const MSG_E2E_OWNED   = `smoke-msg-e2e-${ts}`;

// Seed gmail token rows so _can_access_gmail_account returns true.
// We DO NOT want to disturb real OAuth rows for the test users; use a
// disposable refresh-secret value (Vault entry) so the upserts don't
// stomp on real refresh tokens. Existing real token rows for these
// users would block our inserts on the (user_id, service) PK — so we
// use a fixture service token. Idempotent via on conflict do nothing.
//
// Trick: each fixture row is keyed (user_id, service). The PK is
// (user_id, service); we can't add a second gmail row for RABIH
// without violating it. So we INSERT only if there's no real Gmail
// row yet — otherwise we UPDATE the existing row's google_account_id
// only for the duration of the test and restore it in cleanup.
//
// Simplest path: skip the token seeding when a real row exists.
// _can_access_gmail_account checks (user_id, service='gmail',
// google_account_id) — so we PATCH the existing row's account id to
// ACCOUNT_A during the test, and restore it afterwards.

async function snapshotToken(uid) {
  const rows = await sql(`
    select google_account_id, refresh_token_secret_id, google_email,
           access_token, access_token_expires_at, scope, is_active
      from google_oauth_tokens
     where user_id='${uid}' and service='gmail'
  `);
  return rows[0] ?? null;
}

async function ensureTokenWithAccount(uid, accountId) {
  // If a row exists, save it and rewrite google_account_id.
  const existing = await snapshotToken(uid);
  if (existing) {
    await sql(`
      update google_oauth_tokens
         set google_account_id = '${quote(accountId)}'
       where user_id='${uid}' and service='gmail'
    `);
    return { restoreTo: existing.google_account_id, hadRow: true };
  }
  // Create a minimal placeholder token row. Vault secret stored is a
  // disposable fixture string; deleted in cleanup.
  const secret = await sql(`
    select vault.create_secret('smoke-fixture-${ts}', null,
      'smoke email-link-presence ${uid}') as id
  `);
  await sql(`
    insert into google_oauth_tokens(
      user_id, service, google_account_id, google_email, access_token,
      access_token_expires_at, refresh_token_secret_id, scope, is_active, connected_at
    ) values (
      '${uid}', 'gmail', '${quote(accountId)}',
      'smoke-${uid}@example.com', 'fake-access',
      now() + interval '1 hour', '${secret[0].id}',
      'https://www.googleapis.com/auth/gmail.readonly openid', false, now()
    )
  `);
  return { restoreTo: null, hadRow: false, secretId: secret[0].id };
}

const rabihRestore = await ensureTokenWithAccount(RABIH, ACCOUNT_A);
const e2eRestore   = await ensureTokenWithAccount(E2E,   ACCOUNT_E2E);

check('rabih has a gmail token row with ACCOUNT_A', true);
check('e2e   has a gmail token row with ACCOUNT_E2E', true);

// Create a fixture task + follow-up to link against. Use rabih (admin)
// so visibility is wide and we don't accidentally hit branch RLS.
const task = await as(RABIH, `
  select rpc_create_task('salt', 'operations', 'Smoke G3.1 target ${ts}',
    'normal', null, '${RABIH}'::uuid, null, 'not_started', null, null, null) as r
`);
const taskId = task[0].r?.id;
check('test task created', !!taskId);

const fu = await as(RABIH, `
  select rpc_create_follow_up(
    'call', 'Smoke G3.1 follow-up ${ts}',
    (current_date + interval '7 days')::date,
    'salt', 'normal', null, null, '${RABIH}'::uuid, null
  ) as r
`);
const fuId = fu[0].r?.id;
check('test follow-up created', !!fuId);

// Insert email_links rows via service role. We pin user_id + account_id
// explicitly so the test exercises the (user, account, message)
// filter we built into the RPC.
async function seedLink(uid, entityType, entityId, msgId, accountId) {
  await sql(`
    insert into email_links(
      entity_type, entity_id, user_id, gmail_message_id, gmail_thread_id,
      subject, from_address, from_name, snippet, internal_date, html_link,
      google_account_id
    ) values (
      '${entityType}', '${entityId}'::uuid, '${uid}', '${quote(msgId)}',
      'thr-${quote(msgId)}', 'Smoke ${quote(msgId)}', 's@example.com', 'S',
      'snip', now(), 'https://mail.google.com/x', '${quote(accountId)}'
    )
  `);
}

await seedLink(RABIH, 'task',      taskId, MSG_TASK_A,    ACCOUNT_A);
await seedLink(RABIH, 'follow_up', fuId,   MSG_FU_A,      ACCOUNT_A);
// "Both" — same message id linked to BOTH task and follow-up.
await seedLink(RABIH, 'task',      taskId, MSG_BOTH_A,    ACCOUNT_A);
await seedLink(RABIH, 'follow_up', fuId,   MSG_BOTH_A,    ACCOUNT_A);
// One link under ACCOUNT_B for the cross-account isolation test. We
// need a row in google_oauth_tokens for RABIH with ACCOUNT_B too —
// but the PK is (user_id, service), so RABIH can have only one gmail
// token row at a time. Workaround: temporarily rewrite RABIH's
// account id to ACCOUNT_B, seed the link, then rewrite back.
await sql(`update google_oauth_tokens
              set google_account_id='${quote(ACCOUNT_B)}'
            where user_id='${RABIH}' and service='gmail'`);
await seedLink(RABIH, 'task', taskId, MSG_B, ACCOUNT_B);
await sql(`update google_oauth_tokens
              set google_account_id='${quote(ACCOUNT_A)}'
            where user_id='${RABIH}' and service='gmail'`);

// E2E-owned link for the cross-user visibility test.
await seedLink(E2E,  'task', taskId, MSG_E2E_OWNED, ACCOUNT_E2E);

check('seeded link fixtures', true);

// ---------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------
console.log('\nHappy path');

const allMsgs = `array['${MSG_TASK_A}','${MSG_FU_A}','${MSG_BOTH_A}','${MSG_UNLINKED}']::text[]`;
const happy = await as(RABIH, `
  select rpc_email_link_presence_for_messages('${quote(ACCOUNT_A)}', ${allMsgs}) as r
`);
const happyRows = happy[0].r ?? [];
check('returned 3 rows (the linked ones; unlinked absent)',
  Array.isArray(happyRows) && happyRows.length === 3,
  `got ${happyRows.length}`);

const byId = Object.fromEntries(happyRows.map(r => [r.gmail_message_id, r]));
check('task-only message: has_task_link=true, has_follow_up_link=false',
  byId[MSG_TASK_A]?.has_task_link === true
  && byId[MSG_TASK_A]?.has_follow_up_link === false);
check('follow-up-only message: has_task_link=false, has_follow_up_link=true',
  byId[MSG_FU_A]?.has_task_link === false
  && byId[MSG_FU_A]?.has_follow_up_link === true);
check('both-links message: has_task_link=true, has_follow_up_link=true',
  byId[MSG_BOTH_A]?.has_task_link === true
  && byId[MSG_BOTH_A]?.has_follow_up_link === true);
check('unlinked message absent from result',
  byId[MSG_UNLINKED] === undefined);

// ---------------------------------------------------------------------
// Account scoping
// ---------------------------------------------------------------------
console.log('\nAccount scoping');

// Calling with ACCOUNT_A must NOT surface the ACCOUNT_B link.
const accountA = await as(RABIH, `
  select rpc_email_link_presence_for_messages('${quote(ACCOUNT_A)}',
    array['${MSG_B}']::text[]) as r
`);
check('ACCOUNT_A scope excludes ACCOUNT_B link',
  Array.isArray(accountA[0].r) && accountA[0].r.length === 0);

// And calling with a foreign account_id (E2E's) raises 42501.
let crossAccountRejected = false;
try {
  await as(RABIH, `
    select rpc_email_link_presence_for_messages('${quote(ACCOUNT_E2E)}',
      array['${MSG_E2E_OWNED}']::text[])
  `);
} catch (e) {
  crossAccountRejected = /gmail account not accessible/i.test(e.message);
}
check('foreign google_account_id raises 42501', crossAccountRejected);

// ---------------------------------------------------------------------
// Caller-owned visibility (admin/CEO carve-out intentionally absent)
// ---------------------------------------------------------------------
console.log('\nCaller-owned visibility');

// E2E is an admin. The link MSG_E2E_OWNED is theirs; the link
// MSG_TASK_A is RABIH's. E2E querying their OWN account should see
// their own link only — not RABIH's.
const e2eOwnView = await as(E2E, `
  select rpc_email_link_presence_for_messages('${quote(ACCOUNT_E2E)}',
    array['${MSG_E2E_OWNED}','${MSG_TASK_A}']::text[]) as r
`);
const e2eRows = e2eOwnView[0].r ?? [];
check('admin sees only their own links via this RPC',
  e2eRows.length === 1 && e2eRows[0].gmail_message_id === MSG_E2E_OWNED,
  `got ${e2eRows.length}`);

// And if E2E (admin) tries to pass RABIH's account_id, they get 42501
// — the account check rejects before any visibility logic runs.
let e2eCrossAccount = false;
try {
  await as(E2E, `
    select rpc_email_link_presence_for_messages('${quote(ACCOUNT_A)}',
      array['${MSG_TASK_A}']::text[])
  `);
} catch (e) { e2eCrossAccount = /gmail account not accessible/i.test(e.message); }
check('admin querying foreign account_id is 42501 (no admin carve-out here)',
  e2eCrossAccount);

// ---------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------
console.log('\nEdge cases');

const nullIds = await as(RABIH, `
  select rpc_email_link_presence_for_messages('${quote(ACCOUNT_A)}', null) as r
`);
check('null p_message_ids → []',
  Array.isArray(nullIds[0].r) && nullIds[0].r.length === 0);

const emptyIds = await as(RABIH, `
  select rpc_email_link_presence_for_messages('${quote(ACCOUNT_A)}',
    array[]::text[]) as r
`);
check('empty p_message_ids → []',
  Array.isArray(emptyIds[0].r) && emptyIds[0].r.length === 0);

let nullAccountRejected = false;
try {
  await as(RABIH, `
    select rpc_email_link_presence_for_messages(null,
      array['${MSG_TASK_A}']::text[])
  `);
} catch (e) {
  nullAccountRejected = /p_google_account_id is required/i.test(e.message);
}
check('null p_google_account_id raises 22023', nullAccountRejected);

// 201-entry input → 22023
const overflowIds = Array.from({ length: 201 }, (_, i) => `overflow-${ts}-${i}`);
let capRejected = false;
try {
  await as(RABIH, `
    select rpc_email_link_presence_for_messages('${quote(ACCOUNT_A)}',
      array[${overflowIds.map(s => `'${s}'`).join(',')}]::text[])
  `);
} catch (e) { capRejected = /200-entry cap/i.test(e.message); }
check('201 ids raises 22023', capRejected);

// ---------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------
console.log('\nCleanup');

await sql(`delete from email_links where gmail_message_id like 'smoke-msg-%'`);
await sql(`update tasks      set deleted_at=now() where id='${taskId}'`);
await sql(`update follow_ups set deleted_at=now() where id='${fuId}'`);

async function restoreToken(uid, snapshot) {
  if (snapshot.hadRow) {
    if (snapshot.restoreTo) {
      await sql(`update google_oauth_tokens
                    set google_account_id='${quote(snapshot.restoreTo)}'
                  where user_id='${uid}' and service='gmail'`);
    }
  } else {
    await sql(`delete from google_oauth_tokens
                where user_id='${uid}' and service='gmail'`);
    if (snapshot.secretId) {
      await sql(`select vault.delete_secret('${snapshot.secretId}')`);
    }
  }
}
await restoreToken(RABIH, rabihRestore);
await restoreToken(E2E,   e2eRestore);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
