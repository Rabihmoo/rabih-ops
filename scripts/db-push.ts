/**
 * Applies SQL files in supabase/migrations (in filename order) and supabase/seed.sql
 * to the staging project, using the Supabase Management API `/database/query`.
 *
 * Env required (from .env.local):
 *   SUPABASE_ACCESS_TOKEN
 *   SUPABASE_PROJECT_REF
 */
import 'dotenv/config';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!token || !projectRef) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

async function runSql(sql: string, label: string) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label} failed (${res.status})`);
    console.error(text);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
  return text;
}

async function main() {
  const root = process.cwd();
  const migrationsDir = join(root, 'supabase', 'migrations');
  const seedPath = join(root, 'supabase', 'seed.sql');

  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];

  if (files.length === 0) {
    console.log('No migration files found.');
  }

  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    await runSql(sql, `migration ${f}`);
  }

  if (existsSync(seedPath)) {
    const sql = readFileSync(seedPath, 'utf8');
    await runSql(sql, 'seed.sql');
  }

  console.log('All done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
