import { test, expect } from '@playwright/test';

// =========================================================
// Unauthenticated route gating
// =========================================================

test.describe('Tasks routes — unauthenticated', () => {
  test('/tasks redirects to /login', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  });

  test('/tasks/new redirects to /login', async ({ page }) => {
    await page.goto('/tasks/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/tasks/:id redirects to /login', async ({ page }) => {
    await page.goto('/tasks/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// =========================================================
// Admin happy path — seeded by auth.setup.ts
// =========================================================

test.describe('Tasks — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees authed dashboard and mutate controls', async ({ page }) => {
    await page.goto('/');
    // Greeting depends on time of day (morning / afternoon / evening / night).
    await expect(
      page.getByRole('heading', { name: /good (morning|afternoon|evening|night)/i }),
    ).toBeVisible();

    await page.goto('/tasks');
    await expect(page.getByTestId('new-task-button')).toBeVisible();

    await page.goto('/follow-ups');
    await expect(page.getByTestId('new-follow-up-button')).toBeVisible();
  });

  // Phase B — reminder engine. Sets a deadline reminder for the past so the
  // trigger enqueues it as already-due, then nudges _drain_reminders directly
  // through the Management API and asserts the dashboard shows + dismisses it.
  test('admin can see and dismiss a reminder fired by the engine', async ({
    page,
    request,
  }) => {
    // Helper to issue a privileged SQL call against the staging DB.
    const sb = process.env.SUPABASE_PROJECT_REF;
    const sbToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (!sb || !sbToken) test.skip(true, 'staging env vars missing');
    async function sql(query: string) {
      const res = await request.post(
        `https://api.supabase.com/v1/projects/${sb}/database/query`,
        {
          headers: {
            Authorization: `Bearer ${sbToken}`,
            'Content-Type': 'application/json',
          },
          data: { query },
        },
      );
      const body = await res.json();
      if (!res.ok()) throw new Error(`SQL failed: ${JSON.stringify(body)}`);
      return body;
    }

    // 1. Create a task and set a deadline reminder for 2 minutes ago — trigger
    //    enqueues it as immediately-due. The drain (manual call below) flips
    //    it to sent.
    const title = `Phase-B reminder ${Date.now()}`;
    await page.goto('/tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByRole('button', { name: /create task/i }).click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]+$/, { timeout: 10_000 });

    const m = page.url().match(/\/tasks\/([0-9a-f-]+)$/);
    const taskId = m?.[1];
    expect(taskId).toBeTruthy();

    await sql(
      `update tasks set deadline_reminder_at = now() - interval '2 minutes' where id = '${taskId}'`,
    );

    // 2. Drain immediately (don't wait for the minute-cron).
    await sql(`select public._drain_reminders()`);

    // 3. Dashboard should now show the Reminders list with our task title.
    await page.goto('/');
    const reminderRow = page
      .getByText(title, { exact: false })
      .first()
      .locator('..');
    await expect(reminderRow).toBeVisible({ timeout: 10_000 });

    // 4. Dismiss → it disappears from the list (unread_only=true default).
    const dismissBtn = page
      .locator('[data-testid^="dismiss-reminder-"]')
      .first();
    await dismissBtn.click();
    await expect(page.getByText(title, { exact: false }).first()).toBeHidden({
      timeout: 5_000,
    });
  });

  // Phase A — task lifecycle. Walks through create → mark waiting → resume →
  // finish with an outcome. Asserts the new status badges appear and the
  // lifecycle controls reach the right RPCs.
  test('admin can drive a task through waiting → working → finished', async ({
    page,
  }) => {
    const title = `Phase-A lifecycle ${Date.now()}`;
    await page.goto('/tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByRole('button', { name: /create task/i }).click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]+$/, { timeout: 10_000 });

    // Status badge tracks the lifecycle. Use the dedicated testid + data-status
    // attribute since chip buttons reuse the same labels.
    const statusBadge = page.getByTestId('task-status-badge');
    await expect(statusBadge).toHaveAttribute('data-status', 'not_started');

    // Mark waiting on a label, no note.
    await page.getByTestId('task-mark-waiting-button').click();
    await page.getByTestId('task-wait-label-input').fill('Charcoal supplier');
    const waitingResp = page.waitForResponse((r) =>
      r.url().includes('rpc_mark_waiting'),
    );
    await page.getByTestId('task-wait-submit-button').click();
    expect((await waitingResp).status()).toBe(200);
    await expect(statusBadge).toHaveAttribute('data-status', 'waiting_for_someone');

    // Resume → working.
    const resumeResp = page.waitForResponse((r) =>
      r.url().includes('rpc_resume_waiting'),
    );
    await page.getByTestId('task-resume-waiting-button').click();
    expect((await resumeResp).status()).toBe(200);
    await expect(statusBadge).toHaveAttribute('data-status', 'working');

    // Finish with an outcome — outcome stays in history.
    await page.getByTestId('task-finish-button').click();
    await page.getByTestId('task-outcome-input').fill('Cooler at 4°C, all green.');
    const finishResp = page.waitForResponse((r) =>
      r.url().includes('rpc_complete_task'),
    );
    await page.getByTestId('task-finish-submit-button').click();
    expect((await finishResp).status()).toBe(200);
    await expect(statusBadge).toHaveAttribute('data-status', 'finished');
    // Outcome paragraph (the audit-log diff line also contains the same text).
    await expect(
      page.locator('p', { hasText: 'Cooler at 4°C, all green.' }),
    ).toBeVisible();
  });
});

// =========================================================
// Viewer guard — seeded by auth.setup.ts
// =========================================================

test.describe('Tasks — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer cannot mutate from the tasks list', async ({ page }) => {
    await page.goto('/tasks');
    // Page renders (RLS lets viewer SELECT), but the create button is hidden
    // by useCanMutate.
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByTestId('new-task-button')).toHaveCount(0);
  });

  test('viewer cannot mutate from the follow-ups list', async ({ page }) => {
    await page.goto('/follow-ups');
    await expect(page.getByRole('heading', { name: 'Follow-ups' })).toBeVisible();
    await expect(page.getByTestId('new-follow-up-button')).toHaveCount(0);
  });

  test('viewer hits 42501 if they bypass the UI to /tasks/new', async ({ page }) => {
    // The new-task page itself doesn't gate by role — only the dashboard
    // button does. A viewer who guesses the URL can fill the form, but
    // rpc_create_task rejects with 42501 because _can_mutate() is false.
    // We assert at the network layer because the toast is transient and
    // matching its text is brittle across UI tweaks.
    await page.goto('/tasks/new');
    await expect(page.getByRole('heading', { name: /new task/i })).toBeVisible();
    await page.getByLabel('Title').fill('Should not save');
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('rpc_create_task'),
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /create task/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(body.code).toBe('42501');
    // App stays on /tasks/new because creation failed.
    await expect(page).toHaveURL(/\/tasks\/new$/);
  });
});
