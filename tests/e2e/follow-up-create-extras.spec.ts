import { test, expect, type Page } from '@playwright/test';

// =====================================================================
// Reminder + Calendar extras on /follow-ups/new.
//
// The create form was extended so the operator can set an optional
// reminder + (optionally) add the follow-up to Google Calendar without
// jumping to the detail page. App assignment lives on the row and is
// unrelated to calendar invitee emails — these tests treat the two as
// independent surfaces.
//
// Three cases:
//   1. Reminder happy path — rpc_set_follow_up_reminder fires after
//      rpc_create_follow_up; detail page shows reminder + history row.
//   2. Calendar happy path — defensively skipped when Calendar isn't
//      connected on the admin fixture (same gate as qa-f1-pass).
//   3. Phase-2 failure stays non-destructive — the reminder RPC is
//      intercepted to return 500; row still created, warning shown,
//      reminder picker (not "current reminder") visible on detail.
// =====================================================================

async function openCreateForm(page: Page, title: string): Promise<void> {
  await page.goto('/follow-ups/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Branch').selectOption('salt');
  await page.getByLabel('Category').selectOption('call');
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const yyyy = due.getFullYear();
  const mm = String(due.getMonth() + 1).padStart(2, '0');
  const dd = String(due.getDate()).padStart(2, '0');
  await page.getByLabel('Due date').fill(`${yyyy}-${mm}-${dd}`);
}

function fillReminderInFuture(page: Page): Promise<void> {
  const future = new Date(Date.now() + 5 * 60_000);
  const y = future.getFullYear();
  const m = String(future.getMonth() + 1).padStart(2, '0');
  const d = String(future.getDate()).padStart(2, '0');
  const hh = String(future.getHours()).padStart(2, '0');
  const mm = String(future.getMinutes()).padStart(2, '0');
  return (async () => {
    await page
      .getByTestId('follow-up-create-reminder-date')
      .fill(`${y}-${m}-${d}`);
    await page
      .getByTestId('follow-up-create-reminder-time')
      .fill(`${hh}:${mm}`);
  })();
}

test.describe('Follow-up create — reminder extra (admin)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('reminder fires rpc_set_follow_up_reminder after create + shows on detail', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const ts = Date.now();
    const title = `Create-extras reminder ${ts}`;
    await openCreateForm(page, title);
    await fillReminderInFuture(page);

    const created = page.waitForResponse((r) =>
      r.url().includes('rpc_create_follow_up'),
    );
    const reminded = page.waitForResponse((r) =>
      r.url().includes('rpc_set_follow_up_reminder'),
    );
    await page.getByRole('button', { name: /create follow-up/i }).click();
    expect((await created).status()).toBe(200);
    expect((await reminded).status()).toBe(200);

    await page.waitForURL(/\/follow-ups\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByTestId('follow-up-reminder-current')).toBeVisible({
      timeout: 10_000,
    });
    const feed = page.getByTestId('follow-up-history-feed');
    await expect(
      feed.locator('[data-kind="reminder_set"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Follow-up create — calendar extra (admin)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('calendar checkbox creates event with invitees + history rows (skip if not connected)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/settings');
    const connected = await page
      .getByTestId('google-calendar-disconnect-button')
      .isVisible()
      .catch(() => false);
    test.skip(!connected, 'Calendar not connected on admin fixture.');

    const ts = Date.now();
    const title = `Create-extras calendar ${ts}`;
    await openCreateForm(page, title);

    // Calendar section only renders when connected — guarded above.
    await expect(
      page.getByTestId('follow-up-create-calendar-section'),
    ).toBeVisible();
    await page.getByTestId('follow-up-create-add-to-calendar').check();
    await expect(page.getByTestId('follow-up-create-cal-start')).toBeVisible();
    await page
      .getByTestId('follow-up-create-cal-invitees')
      .fill('invitee@example.com');

    const created = page.waitForResponse((r) =>
      r.url().includes('rpc_create_follow_up'),
    );
    const calCreated = page.waitForResponse((r) =>
      r.url().includes('/functions/v1/calendar-create-event'),
    );
    await page.getByRole('button', { name: /create follow-up/i }).click();
    expect((await created).status()).toBe(200);
    expect((await calCreated).status()).toBe(200);

    await page.waitForURL(/\/follow-ups\/[0-9a-f-]+$/);
    await expect(
      page.getByTestId('follow-up-calendar-link-row'),
    ).toBeVisible({ timeout: 15_000 });
    const feed = page.getByTestId('follow-up-history-feed');
    await expect(
      feed.locator('[data-kind="calendar_added"]').first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      feed.locator('[data-kind="invitee_added"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Follow-up create — phase-2 failure is non-destructive', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('rpc_set_follow_up_reminder 500 keeps the follow-up + leaves reminder unset', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const ts = Date.now();
    const title = `Create-extras phase2-fail ${ts}`;

    // Intercept the reminder RPC for this page only; any later retries
    // from the detail-page reminder card go through unchanged because
    // they would land on a NEW route registration (Playwright unrouting
    // happens at page close).
    await page.route('**/rpc_set_follow_up_reminder', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'simulated failure' }),
      }),
    );

    await openCreateForm(page, title);
    await fillReminderInFuture(page);

    const created = page.waitForResponse((r) =>
      r.url().includes('rpc_create_follow_up'),
    );
    await page.getByRole('button', { name: /create follow-up/i }).click();
    expect((await created).status()).toBe(200);

    await page.waitForURL(/\/follow-ups\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    // Picker is visible (reminder was never set), and the "current
    // reminder" subtree never rendered.
    await expect(page.getByTestId('follow-up-reminder-set')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId('follow-up-reminder-current'),
    ).toHaveCount(0);
  });
});
