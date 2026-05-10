// Smoke verify documents module: schema, RPCs, RLS personal isolation, FTS.
const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
const RABIH = 'aa593e81-9efe-4091-b70e-f2fbf907b394';
const E2E = 'a2ffab6b-28aa-4df7-9be4-4caf42d8708b';

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

// Schema
console.log('\nSchema');
const tables = await sql(`select table_name from information_schema.tables where table_schema='public' and table_name like 'document%' order by table_name`);
check('three tables present', tables.length === 3, tables.map(t => t.table_name).join(', '));

const rpcs = await sql(`select proname from pg_proc where pronamespace=(select oid from pg_namespace where nspname='public') and (proname like 'rpc_%document%' or proname = 'rpc_documents_for_entity') order by proname`);
check('all RPCs registered', rpcs.length >= 11, `${rpcs.length} found`);

// Create work + personal docs as Rabih
console.log('\nCreate (rabih)');
const ts = Date.now();
const workCreate = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_create_document('Smoke SOP ${ts}', 'sop', 'work', 'salt', '## Steps\\n1. Wash hands\\n2. Sharpen knives', 'active') as r
`);
const workDoc = workCreate.find(x => x.r)?.r;
check('work doc created', !!workDoc?.id, workDoc?.title);

const personalCreate = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_create_document('Private notes ${ts}', 'personal', 'personal', null, 'Private brain dump.', 'draft') as r
`);
const personalDoc = personalCreate.find(x => x.r)?.r;
check('personal doc created', !!personalDoc?.id);

// List as Rabih (should see both)
console.log('\nList & RLS');
const listRabih = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select jsonb_array_length(rpc_list_documents()) as n
`);
check('rabih sees both his docs', Number(listRabih[0].n) >= 2, `got ${listRabih[0].n}`);

// List as e2e-admin (admin role, but should NOT see rabih's personal doc)
const listE2e = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${E2E}","role":"authenticated"}', true);
  select rpc_list_documents() as r
`);
const e2eRows = listE2e[0].r ?? [];
const titlesE2e = e2eRows.map(d => d.title).join(', ');
check('admin sees the work doc',
  e2eRows.some(d => d.id === workDoc.id),
  `titles: ${titlesE2e}`);
check('admin does NOT see rabih\'s personal doc (strict)',
  !e2eRows.some(d => d.id === personalDoc.id));

// FTS
console.log('\nFull-text search');
const fts = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_list_documents(null,null,null,null,'knives') as r
`);
const ftsRows = fts[0].r ?? [];
check('FTS finds doc by content keyword', ftsRows.length >= 1);

// Update + version
console.log('\nUpdate + version history');
const update = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_update_document('${workDoc.id}'::uuid, '{"body_md":"updated body"}'::jsonb, 'fix typo') as r
`);
check('update succeeds', update[0].r?.body_md === 'updated body');

const versions = await sql(`select version_no, change_note from document_versions where document_id='${workDoc.id}' order by version_no`);
check('version 1 + 2 exist', versions.length === 2);
check('version 2 has change_note', versions[1].change_note === 'fix typo');

// Revert
const revert = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_revert_document('${workDoc.id}'::uuid, 1) as r
`);
check('revert restores v1 body', revert[0].r?.body_md?.startsWith('## Steps'));
const versionsAfter = await sql(`select count(*)::int as n from document_versions where document_id='${workDoc.id}'`);
check('revert wrote a v3 row', versionsAfter[0].n === 3);

// Personal isolation on update — admin tries to edit rabih's personal
console.log('\nPersonal-doc strictness');
let adminEditFailed = false;
try {
  await sql(`
    select set_config('request.jwt.claims', '{"sub":"${E2E}","role":"authenticated"}', true);
    select rpc_update_document('${personalDoc.id}'::uuid, '{"title":"hijack"}'::jsonb, null)
  `);
} catch (e) { adminEditFailed = /not found|not accessible|cannot edit/i.test(e.message); }
check('admin cannot edit rabih\'s personal doc', adminEditFailed);

// Link a doc to a task
console.log('\nLinks');
// Need a task to link to
const newTask = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_create_task('salt', 'operations', 'Smoke link target ${ts}', 'normal', null, '${RABIH}'::uuid, null, 'not_started', null, null, null) as r
`);
const taskId = newTask[0].r?.id;
check('test task created', !!taskId);

const linked = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_link_document('${workDoc.id}'::uuid, 'task', '${taskId}'::uuid) as r
`);
check('document linked to task', !!linked[0].r?.id);

const docsForTask = await sql(`
  select set_config('request.jwt.claims', '{"sub":"${RABIH}","role":"authenticated"}', true);
  select rpc_documents_for_entity('task', '${taskId}'::uuid) as r
`);
check('docs_for_entity returns the link', (docsForTask[0].r ?? []).length === 1);

// Cleanup
console.log('\nCleanup');
await sql(`delete from documents where title like 'Smoke SOP%' or title like 'Private notes%'`);
await sql(`update tasks set deleted_at = now() where id = '${taskId}'`);
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
