// Playwright setup spec — runs before every test invocation.
// Ensures the two staging test users exist with the right role + branches,
// mints a fresh session for each via the service-role admin API + verifyOtp,
// and saves a Playwright storageState file per role for the spec files to use.
//
// Required env (loaded via .env.local locally, repo secrets in CI):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   TEST_USER_ADMIN_EMAIL
//   TEST_USER_VIEWER_EMAIL

import { test as setup, expect, type Page, type BrowserContext } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const adminEmail = process.env.TEST_USER_ADMIN_EMAIL ?? '';
const viewerEmail = process.env.TEST_USER_VIEWER_EMAIL ?? '';
// Optional: only seeded when set. Tests that need a non-admin mutator
// (e.g. branch-overreach in H2.2) gate themselves on the resulting
// fixture file existing, so CI without the secret just skips cleanly.
const managerEmail = process.env.TEST_USER_MANAGER_EMAIL ?? '';

const projectRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];
const STORAGE_KEY = `sb-${projectRef}-auth-token`;
const AUTH_DIR = path.join(__dirname, '.auth');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

async function ensureUser(opts: {
  email: string;
  fullName: string;
  role: 'admin' | 'ceo' | 'manager' | 'viewer';
  branches: string[];
}): Promise<string> {
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find or create the auth.users row.
  const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) throw listErr;
  let user = list.users.find(
    (u) => u.email?.toLowerCase() === opts.email.toLowerCase(),
  );
  if (!user) {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: opts.email,
      email_confirm: true,
      user_metadata: { full_name: opts.fullName },
    });
    if (createErr) throw createErr;
    user = created.user;
  }
  if (!user) throw new Error(`Failed to ensure auth user for ${opts.email}`);

  // Upsert public.users with the explicit role + branches the tests need.
  // Service role bypasses RLS so this works without rpc_bootstrap_user.
  const { error: upsertErr } = await adminClient.from('users').upsert(
    {
      id: user.id,
      email: opts.email,
      full_name: opts.fullName,
      role: opts.role,
      branches: opts.branches,
    },
    { onConflict: 'id' },
  );
  if (upsertErr) throw upsertErr;

  return user.id;
}

async function mintSession(email: string): Promise<Session> {
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) throw error;
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error('admin.generateLink returned no hashed_token');
  }

  // Anon client exchanges the magic-link OTP for a real session. This is
  // the same path the email-link flow takes, just without the redirect.
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyErr) throw verifyErr;
  if (!verifyData.session) {
    throw new Error('verifyOtp returned no session');
  }
  return verifyData.session;
}

async function persistStorageState(opts: {
  page: Page;
  context: BrowserContext;
  session: Session;
  filePath: string;
}) {
  const value = JSON.stringify(opts.session);
  // Any same-origin URL works; /login is fastest because it doesn't trigger
  // protected-route gating or the bootstrap RPC.
  await opts.page.goto('/login');
  await opts.page.evaluate(
    ([k, v]) => {
      window.localStorage.setItem(k, v);
    },
    [STORAGE_KEY, value],
  );
  await opts.context.storageState({ path: opts.filePath });
}

setup('seed admin', async ({ page, context }) => {
  expect(supabaseUrl, 'VITE_SUPABASE_URL must be set').toBeTruthy();
  expect(anonKey, 'VITE_SUPABASE_ANON_KEY must be set').toBeTruthy();
  expect(serviceKey, 'SUPABASE_SERVICE_ROLE_KEY must be set').toBeTruthy();
  expect(adminEmail, 'TEST_USER_ADMIN_EMAIL must be set').toBeTruthy();

  await ensureUser({
    email: adminEmail,
    fullName: 'E2E Admin',
    role: 'admin',
    branches: [],
  });
  const session = await mintSession(adminEmail);
  await persistStorageState({
    page,
    context,
    session,
    filePath: path.join(AUTH_DIR, 'admin.json'),
  });
});

setup('seed viewer', async ({ page, context }) => {
  expect(viewerEmail, 'TEST_USER_VIEWER_EMAIL must be set').toBeTruthy();

  await ensureUser({
    email: viewerEmail,
    fullName: 'E2E Viewer',
    role: 'viewer',
    branches: ['salt'],
  });
  const session = await mintSession(viewerEmail);
  await persistStorageState({
    page,
    context,
    session,
    filePath: path.join(AUTH_DIR, 'viewer.json'),
  });
});

setup('seed manager', async ({ page, context }) => {
  // Optional fixture — skip when the email isn't configured (CI without
  // the secret continues to pass; specs that need this fixture gate
  // themselves on its file existing).
  setup.skip(
    !managerEmail,
    'TEST_USER_MANAGER_EMAIL not set — skipping manager fixture',
  );

  await ensureUser({
    email: managerEmail,
    fullName: 'E2E Manager',
    role: 'manager',
    branches: ['salt'],
  });
  const session = await mintSession(managerEmail);
  await persistStorageState({
    page,
    context,
    session,
    filePath: path.join(AUTH_DIR, 'manager.json'),
  });
});
