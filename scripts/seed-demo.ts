// One-shot demo seed runner. Uses node fetch (same path as db-push.ts) so the
// Cloudflare WAF doesn't block the request.
//
// Run: tsx scripts/seed-demo.ts [path/to/seed.sql]
//      defaults to scripts/seed-demo.sql when no path given
import { readFileSync } from 'node:fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!token || !projectRef) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

const seedPath = process.argv[2] ?? 'scripts/seed-demo.sql';
const sql = readFileSync(seedPath, 'utf8');
console.log(`→ running ${seedPath}`);

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
  console.error(`✗ failed (${res.status})`);
  console.error(text);
  process.exit(1);
}
console.log('✓ seeded');
console.log(text);
