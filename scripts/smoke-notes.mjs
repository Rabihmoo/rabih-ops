// Smoke-verify the Phase H3.1 Notes layer (and module columns) on staging.
//
// Coverage:
//   * Schema: notes table + RLS policy + 7 RPCs grantable; module
//     column present on tasks/follow_ups/purchase_requests/documents.
//   * CRUD: create work-note (branch), create work-note (branchless,
//     admin only), create personal-note, update, archive/unarchive.
//   * Validation: personal-note with branch rejected; viewer creating
//     branchless work note rejected; viewer creating bbqhouse note
//     rejected; unknown patch keys ignored.
//   * RLS via RPC path — the load-bearing checks:
//       - Personal note hidden from another admin (rpc_list_notes
//         AND rpc_get_note).
//       - Branchless work note hidden from viewer (admin/CEO only).
//       - Salt-tagged work note visible to viewer; bbq-tagged hidden.
//   * Decision lifecycle: creating a decision and updating its status
//     each fires a decision_recorded audit row.

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
const RABIH  = 'aa593e81-9efe-4091-b70e-f2fbf907b394';
const E2E    = 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b';
const VIEWER = '645aca0d-62d0-4f70-bd15-56d6b35faaa8';

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

async function asRabih(stmt) {
  return sql(`select set_config('request.jwt.claims',
    '{"sub":"${RABIH}","role":"authenticated"}', true);\n${stmt}`);
}
async function asE2e(stmt) {
  return sql(`select set_config('request.jwt.claims',
    '{"sub":"${E2E}","role":"authenticated"}', true);\n${stmt}`);
}
async function asViewer(stmt) {
  return sql(`select set_config('request.jwt.claims',
    '{"sub":"${VIEWER}","role":"authenticated"}', true);\n${stmt}`);
}

const ts = Date.now();

// =====================================================================
// Schema
// =====================================================================
console.log('\nSchema');

const tbl = await sql(`select to_regclass('public.notes') as t`);
check('notes table exists', !!tbl[0].t);

const pol = await sql(`
  select policyname from pg_policies
   where schemaname='public' and tablename='notes'
`);
check('notes_select_visible policy present',
  pol.some(p => p.policyname === 'notes_select_visible'));

const rpcs = await sql(`
  select proname from pg_proc
   where pronamespace=(select oid from pg_namespace where nspname='public')
     and proname in (
       'rpc_create_note','rpc_update_note','rpc_archive_note',
       'rpc_unarchive_note','rpc_get_note','rpc_list_notes',
       '_note_visible','_note_writable'
     )
`);
check('all notes RPCs + helpers registered', rpcs.length === 8,
  rpcs.map(r => r.proname).join(', '));

const granted = await sql(`
  select has_function_privilege('authenticated',
    'public.rpc_create_note(text,text,text,text,text,text,text,text,date,text)', 'EXECUTE') as g
`);
check('rpc_create_note granted to authenticated', granted[0].g === true);

// module columns on the four existing entities
for (const t of ['tasks','follow_ups','purchase_requests','documents']) {
  const cols = await sql(`
    select column_name from information_schema.columns
     where table_schema='public' and table_name='${t}' and column_name='module'
  `);
  check(`module column on ${t}`, cols.length === 1);
}

// =====================================================================
// Create — happy paths
// =====================================================================
console.log('\nCreate (rabih admin)');

const saltNote = await asRabih(`
  select rpc_create_note(
    '## Salt note ${ts}\\n\\nbody', 'Note salt ${ts}', 'note', 'operations',
    'work', 'salt', null, null, null, null) as r
`);
const saltNoteId = saltNote.find(x => x.r)?.r?.id;
check('salt-tagged work note created', !!saltNoteId);

const bbqNote = await asRabih(`
  select rpc_create_note(
    '## BBQ note ${ts}', 'Note bbq ${ts}', 'note', 'operations',
    'work', 'bbqhouse', null, null, null, null) as r
`);
const bbqNoteId = bbqNote.find(x => x.r)?.r?.id;
check('bbqhouse-tagged work note created', !!bbqNoteId);

const branchlessNote = await asRabih(`
  select rpc_create_note(
    'admin only ${ts}', 'Note admin ${ts}', 'note', 'general',
    'work', null, null, null, null, null) as r
`);
const branchlessNoteId = branchlessNote.find(x => x.r)?.r?.id;
check('branchless work note created (admin/CEO only)', !!branchlessNoteId);

const personalNote = await asRabih(`
  select rpc_create_note(
    'private brain dump ${ts}', null, 'note', 'personal',
    'personal', null, null, null, null, null) as r
`);
const personalNoteId = personalNote.find(x => x.r)?.r?.id;
check('personal note created (no branch, no admin/CEO bypass)', !!personalNoteId);

// =====================================================================
// Validation rejections
// =====================================================================
console.log('\nValidation');

let personalBranchRejected = false;
try {
  await asRabih(`
    select rpc_create_note(
      'bad', null, 'note', 'general',
      'personal', 'salt', null, null, null, null)
  `);
} catch (e) { personalBranchRejected = /personal notes cannot be branch-scoped/.test(e.message); }
check('personal-note with a branch rejected', personalBranchRejected);

let viewerBranchlessRejected = false;
try {
  await asViewer(`
    select rpc_create_note(
      'sneaky branchless', null, 'note', 'general',
      'work', null, null, null, null, null)
  `);
} catch (e) {
  // Viewer hits the _can_mutate gate first ("role cannot create notes")
  // — that's still the rejection we wanted. Either message proves the
  // RPC refused.
  viewerBranchlessRejected =
    /admin\/CEO can create branchless/.test(e.message)
    || /role cannot create notes/.test(e.message);
}
check('viewer cannot create a branchless work note (rejected)', viewerBranchlessRejected);

let viewerBbqRejected = false;
try {
  await asViewer(`
    select rpc_create_note(
      'sneaky bbq', null, 'note', 'general',
      'work', 'bbqhouse', null, null, null, null)
  `);
} catch (e) {
  viewerBbqRejected = /out of your branch access|access denied|42501/i.test(e.message);
}
check('viewer cannot create a bbqhouse note (out-of-access)', viewerBbqRejected);

// Unknown patch keys ignored.
const updIgnore = await asRabih(`
  select rpc_update_note('${saltNoteId}'::uuid,
    '{"mystery":"x","title":"renamed ${ts}"}'::jsonb) as r
`);
check('unknown patch key ignored; title updated',
  updIgnore.find(x => x.r)?.r?.title === `renamed ${ts}`);

// =====================================================================
// RLS via RPC — the load-bearing privacy probes
// =====================================================================
console.log('\nRLS via RPC');

const e2eList = await asE2e(`select rpc_list_notes(null,null,null,null,null,false,200) as r`);
const e2eIds = (e2eList.find(x => x.r)?.r ?? []).map(n => n.id);
check('admin E2E does NOT see rabih\'s personal note',
  !e2eIds.includes(personalNoteId));
check('admin E2E DOES see rabih\'s branchless work note',
  e2eIds.includes(branchlessNoteId));

const e2eGetPersonal = await asE2e(`select rpc_get_note('${personalNoteId}'::uuid) as r`);
const e2eGetPersonalVal = e2eGetPersonal[e2eGetPersonal.length - 1]?.r ?? null;
check('admin E2E rpc_get_note on rabih\'s personal note returns null',
  e2eGetPersonalVal === null);

let e2eUpdatePersonalRejected = false;
try {
  await asE2e(`select rpc_update_note('${personalNoteId}'::uuid, '{"title":"hijack"}'::jsonb)`);
} catch (e) { e2eUpdatePersonalRejected = /not writable/i.test(e.message); }
check('admin E2E cannot update rabih\'s personal note (no bypass)',
  e2eUpdatePersonalRejected);

const viewerList = await asViewer(`select rpc_list_notes(null,null,null,null,null,false,200) as r`);
const viewerIds = (viewerList.find(x => x.r)?.r ?? []).map(n => n.id);
check('viewer (branches=[salt]) sees the salt note',
  viewerIds.includes(saltNoteId));
check('viewer does NOT see the bbqhouse note',
  !viewerIds.includes(bbqNoteId));
check('viewer does NOT see the branchless work note (admin/CEO only)',
  !viewerIds.includes(branchlessNoteId));
check('viewer does NOT see rabih\'s personal note',
  !viewerIds.includes(personalNoteId));

// =====================================================================
// Decision lifecycle
// =====================================================================
console.log('\nDecision lifecycle');

const decisionRow = await asRabih(`
  select rpc_create_note(
    '## We will renew the gas contract\\n\\nProvider: Acme.', 'Decision ${ts}',
    'decision', 'operations', 'work', 'salt',
    'Price stability', 'Locks us into Acme for 12 months', current_date,
    'proposed') as r
`);
const decisionId = decisionRow.find(x => x.r)?.r?.id;
check('decision note created', !!decisionId && decisionRow.find(x => x.r)?.r?.kind === 'decision');

const decisionAuditOnCreate = await sql(`
  select count(*) as n from audit_log
   where action = 'decision_recorded'
     and entity_id = '${decisionId}'::uuid
     and user_id = '${RABIH}'
`);
check('decision_recorded audit fired on creation',
  Number(decisionAuditOnCreate[0].n) === 1);

await asRabih(`
  select rpc_update_note('${decisionId}'::uuid,
    '{"decision_status":"accepted"}'::jsonb)
`);

const decisionAuditAfterUpdate = await sql(`
  select count(*) as n from audit_log
   where action = 'decision_recorded'
     and entity_id = '${decisionId}'::uuid
     and user_id = '${RABIH}'
`);
check('decision_recorded audit fired on status transition (now 2 total)',
  Number(decisionAuditAfterUpdate[0].n) === 2);

// =====================================================================
// Archive / unarchive
// =====================================================================
console.log('\nArchive / unarchive');

const arc = await asRabih(`select rpc_archive_note('${saltNoteId}'::uuid) as r`);
check('archive sets archived_at',
  arc.find(x => x.r)?.r?.archived_at !== null);

const defaultList = await asRabih(`select rpc_list_notes(null,null,null,'salt',null,false,200) as r`);
const defaultIds = (defaultList.find(x => x.r)?.r ?? []).map(n => n.id);
check('archived note hidden by default in list', !defaultIds.includes(saltNoteId));

const includeArchived = await asRabih(`select rpc_list_notes(null,null,null,'salt',null,true,200) as r`);
const includeIds = (includeArchived.find(x => x.r)?.r ?? []).map(n => n.id);
check('archived note shown when include_archived=true', includeIds.includes(saltNoteId));

const unarc = await asRabih(`select rpc_unarchive_note('${saltNoteId}'::uuid) as r`);
check('unarchive clears archived_at',
  unarc.find(x => x.r)?.r?.archived_at === null);

// =====================================================================
// Cleanup
// =====================================================================
console.log('\nCleanup');
await sql(`delete from notes where id in (
  '${saltNoteId}','${bbqNoteId}','${branchlessNoteId}','${personalNoteId}','${decisionId}'
)`);
await sql(`delete from audit_log where entity_id in (
  '${saltNoteId}'::uuid,'${bbqNoteId}'::uuid,'${branchlessNoteId}'::uuid,
  '${personalNoteId}'::uuid,'${decisionId}'::uuid
) and entity_type = 'note'`);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
