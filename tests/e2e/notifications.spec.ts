// Phase 7 chunk 7.5 — Notifications Center E2E + RLS.
//
// Covers what the page-level chunks deliberately deferred:
//   * Happy path  — bell badge → click → /notifications → mark read → badge drops.
//   * Failure UI  — a notification_log row with status='failed' renders the
//                   red status chip with the error string.
//   * RLS guard A — viewer-A cannot see admin-B's notification_log rows via
//                   rpc_list_notifications (filter is inside the SECURITY
//                   DEFINER body, not RLS — but this is the only invariant
//                   we care about).
//   * RLS guard B — recipient-A cannot cancel B's pending row via
//                   rpc_cancel_my_pending_reminder (expect 42501), and
//                   cancelling a sent row of your own raises 22023.
//
// Seeding bypasses RLS via service-role client. RPC assertions use
// per-role JWTs lifted out of Playwright's storageState fixtures.
//
// All seeded titles go through e2eTitle() so the existing
// cleanup-test-data.mjs catches them. notification_log + queue rows
// for the e2e fixture recipients are also purged before each test so
// counts are deterministic across runs.

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { e2eTitle } from '../helpers/e2e-title';

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const adminEmail = (process.env.TEST_USER_ADMIN_EMAIL ?? '').toLowerCase();
const viewerEmail = (process.env.TEST_USER_VIEWER_EMAIL ?? '').toLowerCase();

function service(): SupabaseClient {
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function asUser(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function readAccessToken(role: 'admin' | 'viewer'): string {
  const state = JSON.parse(
    fs.readFileSync(`tests/fixtures/.auth/${role}.json`, 'utf8'),
  );
  const entry = state.origins?.[0]?.localStorage?.[0];
  if (!entry) throw new Error(`No session entry in ${role}.json`);
  const parsed = JSON.parse(entry.value) as { access_token: string };
  return parsed.access_token;
}

async function getUserId(email: string): Promise<string> {
  const { data, error } = await service()
    .from('users')
    .select('id')
    .ilike('email', email)
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function purgeForRecipients(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const s = service();
  // Order matters because notification_log.queue_id can FK back to
  // notifications_queue (on delete set null). Wiping logs first keeps
  // the relationship clean.
  await s.from('notification_log').delete().in('recipient_id', ids);
  await s.from('notifications_queue').delete().in('recipient_id', ids);
}

async function seedTaskFor(opts: {
  recipientId: string;
  title: string;
}): Promise<string> {
  const { data, error } = await service()
    .from('tasks')
    .insert({
      title: opts.title,
      branch: 'salt',
      category: 'operations',
      priority: 'normal',
      status: 'not_started',
      created_by: opts.recipientId,
      assigned_to: opts.recipientId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

interface QueueSeed {
  recipientId: string;
  entityId: string;
  status: 'pending' | 'sent';
  channel: 'in_app' | 'telegram';
}

async function seedQueue(opts: QueueSeed): Promise<number> {
  const isSent = opts.status === 'sent';
  const fireAt = isSent
    ? new Date(Date.now() - 60_000).toISOString()
    : new Date(Date.now() + 60 * 60_000).toISOString();
  const { data, error } = await service()
    .from('notifications_queue')
    .insert({
      kind: 'deadline_reminder',
      entity_type: 'task',
      entity_id: opts.entityId,
      recipient_id: opts.recipientId,
      channel: opts.channel,
      fire_at: fireAt,
      fired_at: isSent ? fireAt : null,
      status: opts.status,
      payload: { title: '[E2E] reminder payload', branch: 'salt' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

interface LogSeed {
  recipientId: string;
  queueId: number;
  channel: 'in_app' | 'telegram';
  status: 'sent' | 'failed';
  error?: string;
  readAt?: string | null;
}

async function seedLog(opts: LogSeed): Promise<number> {
  const { data, error } = await service()
    .from('notification_log')
    .insert({
      queue_id: opts.queueId,
      recipient_id: opts.recipientId,
      channel: opts.channel,
      status: opts.status,
      error: opts.error ?? null,
      read_at: opts.readAt ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

// =====================================================================
// UI tests — admin storage state, deterministic badge.
// =====================================================================

test.describe('Notifications — happy path + failure UI', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  let adminId: string;

  test.beforeAll(async () => {
    expect(supabaseUrl, 'VITE_SUPABASE_URL').toBeTruthy();
    expect(serviceKey, 'SUPABASE_SERVICE_ROLE_KEY').toBeTruthy();
    expect(adminEmail, 'TEST_USER_ADMIN_EMAIL').toBeTruthy();
    adminId = await getUserId(adminEmail);
  });

  test.beforeEach(async () => {
    await purgeForRecipients([adminId]);
  });

  test('bell badge appears, navigates to /notifications, mark read drops the count', async ({
    page,
  }) => {
    const taskTitle = e2eTitle('reminder happy-path');
    const taskId = await seedTaskFor({ recipientId: adminId, title: taskTitle });
    const queueId = await seedQueue({
      recipientId: adminId,
      entityId: taskId,
      status: 'sent',
      channel: 'in_app',
    });
    await seedLog({
      recipientId: adminId,
      queueId,
      channel: 'in_app',
      status: 'sent',
    });

    // Land on dashboard and confirm the badge surfaces.
    await page.goto('/');
    const badge = page.getByTestId('topbar-notifications-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveText(/^\d+(\+)?$/);

    // Click the bell — navigates to /notifications.
    await page.getByTestId('topbar-notifications-button').click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    // Our seeded task is on the page.
    await expect(page.getByText(taskTitle).first()).toBeVisible();

    // Mark it read; badge disappears (hidden when count is 0).
    await page.getByTestId('notification-mark-read').first().click();
    // The mutation invalidates ['notifications'] which refetches both
    // the list and the unread count. Wait for the badge to vanish.
    await expect(page.getByTestId('topbar-notifications-badge')).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('failed status row renders the red Failed chip with the error string', async ({
    page,
  }) => {
    const taskTitle = e2eTitle('reminder failure-case');
    const taskId = await seedTaskFor({ recipientId: adminId, title: taskTitle });
    const queueId = await seedQueue({
      recipientId: adminId,
      entityId: taskId,
      status: 'sent',
      channel: 'telegram',
    });
    await seedLog({
      recipientId: adminId,
      queueId,
      channel: 'telegram',
      status: 'failed',
      error: 'telegram api: 502 bad gateway',
    });

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    // The row exists and surfaces both the Failed chip and the error
    // text — both required so a regression that hides either is caught.
    const row = page
      .getByTestId('notification-row')
      .filter({ hasText: taskTitle })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Failed', { exact: true })).toBeVisible();
    await expect(row.getByText(/telegram api: 502 bad gateway/i)).toBeVisible();
  });
});

// =====================================================================
// RLS / RPC-scope tests — no browser, just RPC calls via per-role JWT.
// =====================================================================

test.describe('Notifications — RPC scope (RLS-equivalent guards)', () => {
  let adminId: string;
  let viewerId: string;
  let adminToken: string;
  let viewerToken: string;

  test.beforeAll(async () => {
    expect(supabaseUrl).toBeTruthy();
    expect(anonKey).toBeTruthy();
    expect(serviceKey).toBeTruthy();
    expect(adminEmail).toBeTruthy();
    expect(viewerEmail, 'TEST_USER_VIEWER_EMAIL').toBeTruthy();

    adminId = await getUserId(adminEmail);
    viewerId = await getUserId(viewerEmail);
    adminToken = readAccessToken('admin');
    viewerToken = readAccessToken('viewer');
  });

  test.beforeEach(async () => {
    await purgeForRecipients([adminId, viewerId]);
  });

  test('viewer cannot see admin rows via rpc_list_notifications', async () => {
    // Seed one fired row for admin, one for viewer. Then call the RPC
    // as viewer and assert: only the viewer's own row comes back.
    const adminTask = await seedTaskFor({
      recipientId: adminId,
      title: e2eTitle('rls admin row'),
    });
    const adminQueue = await seedQueue({
      recipientId: adminId,
      entityId: adminTask,
      status: 'sent',
      channel: 'in_app',
    });
    const adminLogId = await seedLog({
      recipientId: adminId,
      queueId: adminQueue,
      channel: 'in_app',
      status: 'sent',
    });

    const viewerTask = await seedTaskFor({
      recipientId: viewerId,
      title: e2eTitle('rls viewer row'),
    });
    const viewerQueue = await seedQueue({
      recipientId: viewerId,
      entityId: viewerTask,
      status: 'sent',
      channel: 'in_app',
    });
    const viewerLogId = await seedLog({
      recipientId: viewerId,
      queueId: viewerQueue,
      channel: 'in_app',
      status: 'sent',
    });

    const viewerClient = asUser(viewerToken);
    const { data, error } = await viewerClient.rpc('rpc_list_notifications', {
      p_limit: 200,
      p_unread_only: false,
      p_channel: null,
    });
    expect(error, 'RPC should succeed for viewer').toBeNull();
    const rows = (data ?? []) as Array<{ state: string; log_id: number | null }>;
    const fired = rows.filter((r) => r.state === 'fired');
    const seenIds = fired.map((r) => r.log_id);

    expect(seenIds).toContain(viewerLogId);
    expect(seenIds).not.toContain(adminLogId);

    // Mirror with admin to confirm the admin path still sees their row
    // (sanity — proves the seed worked, not just that viewer is empty).
    const adminClient = asUser(adminToken);
    const adminResp = await adminClient.rpc('rpc_list_notifications', {
      p_limit: 200,
      p_unread_only: false,
      p_channel: null,
    });
    expect(adminResp.error).toBeNull();
    const adminFired = ((adminResp.data ?? []) as Array<{
      state: string;
      log_id: number | null;
    }>).filter((r) => r.state === 'fired');
    expect(adminFired.map((r) => r.log_id)).toContain(adminLogId);
    expect(adminFired.map((r) => r.log_id)).not.toContain(viewerLogId);
  });

  test('viewer cancelling admin pending row raises 42501', async () => {
    const adminTask = await seedTaskFor({
      recipientId: adminId,
      title: e2eTitle('rls pending admin'),
    });
    const adminPendingId = await seedQueue({
      recipientId: adminId,
      entityId: adminTask,
      status: 'pending',
      channel: 'in_app',
    });

    const viewerClient = asUser(viewerToken);
    const { error } = await viewerClient.rpc('rpc_cancel_my_pending_reminder', {
      p_queue_id: adminPendingId,
    });
    expect(error, 'cross-recipient cancel must fail').not.toBeNull();
    // Supabase surfaces Postgres errcode in `error.code`. 42501 =
    // insufficient_privilege, raised by our RPC's explicit branch.
    expect(error?.code).toBe('42501');

    // Admin's pending row must remain pending (not silently cancelled).
    const { data } = await service()
      .from('notifications_queue')
      .select('status')
      .eq('id', adminPendingId)
      .single();
    expect((data as { status: string }).status).toBe('pending');
  });

  test('recipient cancelling their own sent row raises 22023', async () => {
    const adminTask = await seedTaskFor({
      recipientId: adminId,
      title: e2eTitle('rls sent admin'),
    });
    const sentId = await seedQueue({
      recipientId: adminId,
      entityId: adminTask,
      status: 'sent',
      channel: 'in_app',
    });

    const adminClient = asUser(adminToken);
    const { error } = await adminClient.rpc('rpc_cancel_my_pending_reminder', {
      p_queue_id: sentId,
    });
    expect(error, 'cancelling a non-pending row must fail').not.toBeNull();
    expect(error?.code).toBe('22023');

    // Status unchanged.
    const { data } = await service()
      .from('notifications_queue')
      .select('status')
      .eq('id', sentId)
      .single();
    expect((data as { status: string }).status).toBe('sent');
  });

  test('recipient can cancel their own pending row (positive control)', async () => {
    const adminTask = await seedTaskFor({
      recipientId: adminId,
      title: e2eTitle('rls cancel self'),
    });
    const myPendingId = await seedQueue({
      recipientId: adminId,
      entityId: adminTask,
      status: 'pending',
      channel: 'in_app',
    });

    const adminClient = asUser(adminToken);
    const { data, error } = await adminClient.rpc('rpc_cancel_my_pending_reminder', {
      p_queue_id: myPendingId,
    });
    expect(error, 'recipient-self cancel should succeed').toBeNull();
    const row = data as { status: string; cancel_reason: string };
    expect(row.status).toBe('cancelled');
    expect(row.cancel_reason).toBe('recipient_cancelled');
  });
});

