import 'dotenv/config';

const token = process.env.SUPABASE_ACCESS_TOKEN!;
const projectRef = process.env.SUPABASE_PROJECT_REF!;

async function runSql(sql: string) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const queries = {
  tables: `select table_name from information_schema.tables where table_schema='public' order by table_name`,
  rpcs: `select routine_name from information_schema.routines where routine_schema='public' and routine_type='FUNCTION' and routine_name like 'rpc_%' order by routine_name`,
  branches: `select code, name, color from public.branches order by code`,
  policies: `select tablename, policyname from pg_policies where schemaname='public' order by tablename, policyname`,
};

const main = async () => {
  for (const [k, sql] of Object.entries(queries)) {
    const rows = await runSql(sql);
    console.log(`\n== ${k} (${Array.isArray(rows) ? rows.length : 'n/a'}) ==`);
    console.log(JSON.stringify(rows, null, 2));
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
