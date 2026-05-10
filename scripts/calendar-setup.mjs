// One-shot Google Calendar bootstrap.
//
// Required env vars (in .env.local):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN,
//   SUPABASE_PROJECT_REF,
//   GOOGLE_OAUTH_CLIENT_ID,        public, also exposed as VITE_…
//   GOOGLE_OAUTH_CLIENT_SECRET,    server-side only
//   RABIHOS_APP_URL                e.g. http://localhost:5175 or production URL
//
// What it does:
//   1. Pushes GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and
//      RABIHOS_APP_URL as Edge Function secrets via the Supabase
//      Management API.
//   2. Pings the two Edge Functions and reports whether they're deployed.
//   3. Reminds you to add the redirect URI to Google Cloud Console.
//
// Idempotent — safe to re-run after rotating secrets.

const REQUIRED = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'RABIHOS_APP_URL',
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

const callbackUrl = `${projectUrl}/functions/v1/calendar-oauth-callback`;
const revokeUrl = `${projectUrl}/functions/v1/calendar-oauth-revoke`;

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
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  RABIHOS_APP_URL: process.env.RABIHOS_APP_URL,
});
console.log('  ✓ Edge Function secrets set');

async function ping(url) {
  try {
    const res = await fetch(url, { method: 'POST' });
    return res.status;
  } catch {
    return 0;
  }
}
const cb = await ping(callbackUrl);
const rv = await ping(revokeUrl);
console.log(`  callback ping: ${cb}`);
console.log(`  revoke   ping: ${rv}`);

if (cb === 404 || rv === 404) {
  console.log('');
  console.log('⚠️  Edge Functions not deployed. Run:');
  console.log(
    `     supabase functions deploy calendar-oauth-callback --project-ref ${ref} --no-verify-jwt`,
  );
  console.log(
    `     supabase functions deploy calendar-oauth-revoke    --project-ref ${ref}`,
  );
  process.exit(0);
}

console.log('');
console.log('✅ Server side is ready.');
console.log('');
console.log('Now in Google Cloud Console:');
console.log('  1. APIs & Services → OAuth consent screen → External');
console.log('     Add scopes:');
console.log('       https://www.googleapis.com/auth/calendar.events');
console.log('       https://www.googleapis.com/auth/userinfo.email');
console.log('       openid');
console.log('  2. APIs & Services → Credentials → Create OAuth 2.0 Client ID');
console.log('     Application type: Web application');
console.log('     Authorized redirect URI:');
console.log(`       ${callbackUrl}`);
console.log('  3. Copy the Client ID into .env.local as both:');
console.log('       GOOGLE_OAUTH_CLIENT_ID=<id>');
console.log('       VITE_GOOGLE_OAUTH_CLIENT_ID=<id>   (so the frontend can build the auth URL)');
console.log('     and the Client Secret as GOOGLE_OAUTH_CLIENT_SECRET=<secret>');
console.log('  4. Re-run this script if any of those changed.');
console.log('');
console.log('Then in RabihOS → Settings → Connect Google Calendar.');
