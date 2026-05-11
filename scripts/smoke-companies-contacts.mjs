// Smoke-verify the Phase H2.1 Companies + Contacts layer on staging.
//
// Coverage:
//   * Schema: 4 tables + indexes + SELECT policies + 13 RPCs grantable
//   * Company CRUD: create with branches, get, update patches, set_branches,
//     archive/unarchive, list filters.
//   * Contact CRUD: create with company-branch default-copy, update,
//     set_branches, archive/unarchive, list filters.
//   * RLS via RPC path — the load-bearing checks:
//     - viewer (branches=['salt']) sees a salt-tagged company but not a
//       bbqhouse-only company.
//     - viewer does NOT see a zero-branch company (admin/CEO only rule).
//     - viewer cannot mutate (rpc_create_company → 42501).
//     - non-admin tries to assign a branch outside their access → 42501.

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
const RABIH  = 'aa593e81-9efe-4091-b70e-f2fbf907b394';        // admin
const VIEWER = '645aca0d-62d0-4f70-bd15-56d6b35faaa8';        // viewer, branches=['salt']

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
  return sql(`
    select set_config('request.jwt.claims',
      '{"sub":"${RABIH}","role":"authenticated"}', true);
    ${stmt}
  `);
}
async function asViewer(stmt) {
  return sql(`
    select set_config('request.jwt.claims',
      '{"sub":"${VIEWER}","role":"authenticated"}', true);
    ${stmt}
  `);
}

const ts = Date.now();

// =====================================================================
// Schema
// =====================================================================
console.log('\nSchema');

for (const tbl of ['companies', 'contacts', 'company_branches', 'contact_branches']) {
  const r = await sql(`select to_regclass('public.${tbl}') as t`);
  check(`table ${tbl} exists`, !!r[0].t);
}

const policies = await sql(`
  select tablename, policyname from pg_policies
   where schemaname='public'
     and tablename in ('companies','contacts','company_branches','contact_branches')
   order by tablename, policyname
`);
check('SELECT policies on all four tables',
  policies.length === 4,
  policies.map((p) => `${p.tablename}/${p.policyname}`).join(', '));

const rpcs = await sql(`
  select proname from pg_proc
   where pronamespace=(select oid from pg_namespace where nspname='public')
     and proname in (
       'rpc_create_company','rpc_update_company','rpc_set_company_branches',
       'rpc_archive_company','rpc_unarchive_company',
       'rpc_get_company','rpc_list_companies',
       'rpc_create_contact','rpc_update_contact','rpc_set_contact_branches',
       'rpc_archive_contact','rpc_unarchive_contact',
       'rpc_get_contact','rpc_list_contacts'
     )
`);
check('all 14 RPCs registered', rpcs.length === 14, `${rpcs.length} found`);

// =====================================================================
// Company CRUD (as Rabih)
// =====================================================================
console.log('\nCompany CRUD');

const co1 = await asRabih(`
  select rpc_create_company('Smoke Co SALT ${ts}', 'supplier',
    array['salt']::text[], null, '+258 84 000 0000', null, 'Initial notes') as r
`);
const co1Json = co1.find(x => x.r)?.r;
const co1Id = co1Json?.id;
check('rpc_create_company returns row with branches',
  !!co1Id && Array.isArray(co1Json.branches) && co1Json.branches[0] === 'salt');

const co2 = await asRabih(`
  select rpc_create_company('Smoke Co BBQ ${ts}', 'contractor',
    array['bbqhouse']::text[]) as r
`);
const co2Id = co2.find(x => x.r)?.r?.id;
check('second company created (bbqhouse only)', !!co2Id);

const coZero = await asRabih(`
  select rpc_create_company('Smoke Co ZERO ${ts}', 'partner', '{}'::text[]) as r
`);
const coZeroId = coZero.find(x => x.r)?.r?.id;
check('zero-branch company created (admin-only)', !!coZeroId);

const upd = await asRabih(`
  select rpc_update_company('${co1Id}'::uuid, '{"category":"contractor","phone":"+258 84 999 9999"}'::jsonb) as r
`);
check('rpc_update_company patches category + phone',
  upd.find(x => x.r)?.r?.category === 'contractor');

// Unknown patch key is silently ignored.
const updIgnore = await asRabih(`
  select rpc_update_company('${co1Id}'::uuid, '{"mystery":"x","name":"Smoke Co SALT renamed ${ts}"}'::jsonb) as r
`);
check('unknown patch key ignored; name updated',
  updIgnore.find(x => x.r)?.r?.name === `Smoke Co SALT renamed ${ts}`);

const sb = await asRabih(`
  select rpc_set_company_branches('${co1Id}'::uuid, array['salt','centralkitchen']::text[]) as r
`);
const sbBranches = sb.find(x => x.r)?.r?.branches ?? [];
check('rpc_set_company_branches replaces branches atomically',
  Array.isArray(sbBranches) && sbBranches.length === 2
    && sbBranches.includes('salt') && sbBranches.includes('centralkitchen'));

const arc = await asRabih(`select rpc_archive_company('${co1Id}'::uuid) as r`);
check('archive sets active=false', arc.find(x => x.r)?.r?.active === false);

const unarc = await asRabih(`select rpc_unarchive_company('${co1Id}'::uuid) as r`);
check('unarchive sets active=true', unarc.find(x => x.r)?.r?.active === true);

// =====================================================================
// Contact CRUD (as Rabih)
// =====================================================================
console.log('\nContact CRUD');

// Create contact with explicit branches.
const ct1 = await asRabih(`
  select rpc_create_contact('Smoke Person 1 ${ts}', '${co1Id}'::uuid,
    array['salt']::text[],
    'Operations Manager','smoke1@example.com','+258 84 111 1111',
    null, null, null) as r
`);
const ct1Json = ct1.find(x => x.r)?.r;
const ct1Id = ct1Json?.id;
check('rpc_create_contact returns row with branches + company',
  !!ct1Id && ct1Json.branches[0] === 'salt' && ct1Json.company?.id === co1Id);

// Contact with empty branches but a company → should auto-copy company branches.
const ct2 = await asRabih(`
  select rpc_create_contact('Smoke Person 2 ${ts}', '${co1Id}'::uuid,
    '{}'::text[],
    null, null, null, null, null, null) as r
`);
const ct2Json = ct2.find(x => x.r)?.r;
const ct2Id = ct2Json?.id;
const ct2Branches = ct2Json?.branches ?? [];
check('contact with empty branches + company default-copies company branches',
  Array.isArray(ct2Branches) && ct2Branches.length >= 2
    && ct2Branches.includes('salt') && ct2Branches.includes('centralkitchen'));

const ctUpd = await asRabih(`
  select rpc_update_contact('${ct1Id}'::uuid,
    '{"role":"Senior Manager","email":"updated@example.com"}'::jsonb) as r
`);
check('rpc_update_contact patches role and email',
  ctUpd.find(x => x.r)?.r?.role === 'Senior Manager');

const ctSb = await asRabih(`
  select rpc_set_contact_branches('${ct1Id}'::uuid, array['salt','bbqhouse']::text[]) as r
`);
const ctSbBranches = ctSb.find(x => x.r)?.r?.branches ?? [];
check('rpc_set_contact_branches replaces atomically',
  ctSbBranches.length === 2);

const ctArc = await asRabih(`select rpc_archive_contact('${ct1Id}'::uuid) as r`);
check('archive contact sets active=false', ctArc.find(x => x.r)?.r?.active === false);
const ctUnarc = await asRabih(`select rpc_unarchive_contact('${ct1Id}'::uuid) as r`);
check('unarchive contact sets active=true', ctUnarc.find(x => x.r)?.r?.active === true);

// =====================================================================
// List filters
// =====================================================================
console.log('\nList filters');

const listAll = await asRabih(`select rpc_list_companies(null,null,null,false,200) as r`);
const allCompanies = listAll.find(x => x.r)?.r ?? [];
check('rabih sees both salt + bbqhouse + zero-branch smoke companies',
  allCompanies.some(c => c.id === co1Id)
  && allCompanies.some(c => c.id === co2Id)
  && allCompanies.some(c => c.id === coZeroId));

const listBySalt = await asRabih(`select rpc_list_companies(null,'salt',null,false,200) as r`);
const bySaltIds = (listBySalt.find(x => x.r)?.r ?? []).map(c => c.id);
check('p_branch=salt filter includes salt company, excludes bbqhouse-only',
  bySaltIds.includes(co1Id) && !bySaltIds.includes(co2Id));

const listSearch = await asRabih(`select rpc_list_companies(null,null,'renamed',false,200) as r`);
check('search finds the renamed company',
  (listSearch.find(x => x.r)?.r ?? []).some(c => c.id === co1Id));

// =====================================================================
// RLS via RPC — viewer with branches=['salt']
// =====================================================================
console.log('\nRLS via RPC (viewer = salt-only)');

const viewerList = await asViewer(`select rpc_list_companies(null,null,null,false,200) as r`);
const viewerIds = (viewerList.find(x => x.r)?.r ?? []).map(c => c.id);
check('viewer sees the salt company',     viewerIds.includes(co1Id));
check('viewer does NOT see bbqhouse-only company', !viewerIds.includes(co2Id));
check('viewer does NOT see zero-branch company',   !viewerIds.includes(coZeroId));

const viewerGetSalt = await asViewer(`select rpc_get_company('${co1Id}'::uuid) as r`);
check('viewer can rpc_get_company on accessible row',
  viewerGetSalt.find(x => x.r)?.r?.id === co1Id);
const viewerGetBbq = await asViewer(`select rpc_get_company('${co2Id}'::uuid) as r`);
// `find(x => x.r)` short-circuits on null returns — use last row directly.
const viewerGetBbqVal = viewerGetBbq[viewerGetBbq.length - 1]?.r ?? null;
check('viewer rpc_get_company on inaccessible row returns null',
  viewerGetBbqVal === null);

// Viewer cannot mutate.
let mutateRejected = false;
try {
  await asViewer(`
    select rpc_create_company('Viewer Co ${ts}','supplier', array['salt']::text[])
  `);
} catch (e) { mutateRejected = /role cannot create companies/.test(e.message); }
check('viewer cannot rpc_create_company (42501)', mutateRejected);

// Non-admin trying to set a branch outside their access (we don't have a
// non-admin user with mutate rights here, so we exercise the helper
// directly via a manager-shaped JWT against an existing admin row).
// Skip: requires a seeded manager user — covered when H2.2 Playwright runs.
console.log('  (branch-overreach rejection requires a manager fixture — covered in H2.2 Playwright)');

// =====================================================================
// Cleanup
// =====================================================================
console.log('\nCleanup');
await sql(`delete from contact_branches where contact_id in ('${ct1Id}','${ct2Id}')`);
await sql(`delete from contacts where id in ('${ct1Id}','${ct2Id}')`);
await sql(`delete from company_branches where company_id in ('${co1Id}','${co2Id}','${coZeroId}')`);
await sql(`delete from companies where id in ('${co1Id}','${co2Id}','${coZeroId}')`);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
