// One-shot Telegram bot bootstrap.
//
// Required env vars (in .env.local):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN,
//   SUPABASE_PROJECT_REF, TELEGRAM_BOT_TOKEN
// Optional:
//   TELEGRAM_BOT_USERNAME (used as a sanity log only; the deep-link is
//                          built client-side from VITE_TELEGRAM_BOT_USERNAME)
//
// What it does (idempotent):
//   1. Generates random TELEGRAM_WEBHOOK_SECRET + TELEGRAM_INTERNAL_SECRET
//      if they're not already in .env.local, and writes them back.
//   2. Pushes all 5 Edge Function secrets to Supabase via the Management API.
//   3. Stores `telegram_tick_url` + `telegram_internal_secret` in Vault so
//      the pg_cron job can authenticate to the tick function.
//   4. Registers the webhook with Telegram (setWebhook).
//
// This script does NOT deploy the Edge Function source — that is a separate
// step done with the Supabase CLI: `supabase functions deploy telegram-webhook`
// and `supabase functions deploy telegram-tick`. The script will print the
// exact commands for you to run if it detects the functions aren't deployed
// yet (it pings their URLs and reports 404 → not deployed).

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'TELEGRAM_BOT_TOKEN',
];
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

const ref = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectUrl = process.env.SUPABASE_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

const webhookUrl = `${projectUrl}/functions/v1/telegram-webhook`;
const tickUrl = `${projectUrl}/functions/v1/telegram-tick`;

// ----------- 1. Generate or read the two shared secrets -----------
function rand(n) { return randomBytes(n).toString('hex'); }

const envPath = '.env.local';
let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

function ensureEnv(key, generator) {
  if (process.env[key]) return process.env[key];
  const value = generator();
  envText += (envText.endsWith('\n') || envText === '' ? '' : '\n') + `${key}=${value}\n`;
  process.env[key] = value;
  console.log(`  generated ${key}`);
  return value;
}

const webhookSecret = ensureEnv('TELEGRAM_WEBHOOK_SECRET', () => rand(24));
const internalSecret = ensureEnv('TELEGRAM_INTERNAL_SECRET', () => rand(24));
writeFileSync(envPath, envText);

// ----------- 2. Push Edge Function secrets via Management API -----------
async function setEdgeSecrets(secrets) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/secrets`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        Object.entries(secrets).map(([name, value]) => ({ name, value })),
      ),
    },
  );
  if (!res.ok) {
    throw new Error(`setEdgeSecrets failed (${res.status}): ${await res.text()}`);
  }
}

console.log('→ pushing Edge Function secrets…');
await setEdgeSecrets({
  TELEGRAM_BOT_TOKEN: botToken,
  TELEGRAM_WEBHOOK_SECRET: webhookSecret,
  TELEGRAM_INTERNAL_SECRET: internalSecret,
});
console.log('  ✓ Edge Function secrets set');

// ----------- 3. Vault entries for the cron job -----------
async function sql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed: ${text}`);
  return text;
}

console.log('→ upserting Vault secrets…');
// vault.create_secret returns the secret id; if a name already exists it
// errors. We delete the existing entry first (idempotent).
await sql(`
  delete from vault.secrets where name in ('telegram_tick_url','telegram_internal_secret');
  select vault.create_secret('${tickUrl}', 'telegram_tick_url', 'Edge Function URL for telegram-tick');
  select vault.create_secret('${internalSecret}', 'telegram_internal_secret', 'Bearer for cron→tick');
`);
console.log('  ✓ Vault populated');

// ----------- 4. Confirm Edge Functions are deployed -----------
async function ping(url, expect = [200, 401, 403]) {
  try {
    const res = await fetch(url, { method: 'POST' });
    return res.status;
  } catch (e) {
    return 0;
  }
}

const webhookStatus = await ping(webhookUrl);
const tickStatus = await ping(tickUrl);
console.log(`  webhook ping: ${webhookStatus}`);
console.log(`  tick ping:    ${tickStatus}`);

if (webhookStatus === 404 || tickStatus === 404) {
  console.log('');
  console.log('⚠️  Functions not deployed yet. Run:');
  console.log('     supabase functions deploy telegram-webhook --project-ref ' + ref);
  console.log('     supabase functions deploy telegram-tick    --project-ref ' + ref);
  console.log('   then re-run this script to register the webhook.');
  process.exit(0);
}

// ----------- 5. Register the webhook with Telegram -----------
console.log('→ registering webhook with Telegram…');
const setHookRes = await fetch(
  `https://api.telegram.org/bot${botToken}/setWebhook`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      drop_pending_updates: true,
    }),
  },
);
const hookText = await setHookRes.text();
if (!setHookRes.ok) {
  console.error(`  ✗ setWebhook failed: ${hookText}`);
  process.exit(1);
}
console.log('  ✓', hookText);

console.log('');
console.log('✅ Telegram setup complete.');
console.log('   Open RabihOS → Settings → Link Telegram, then click the t.me link.');
