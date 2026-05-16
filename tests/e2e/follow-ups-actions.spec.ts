import { test, expect, type Page } from '@playwright/test';

// F1.3 — quick-action menu on FollowUpDetail.
//
// Covers:
//   * admin happy path: create follow-up → click Actions → "Working on
//     it" → status badge updates + History row appears
//   * note flow: Add note prompts for body, History gains a note row
//   * viewer guard: Actions trigger absent on viewer-owned detail pages
//
// Postpone + Done flows use window.prompt; tests accept the dialog so
// the action lands. Same pattern as linked-records-add.spec.ts L181.

async function createFollowUp(page: Page, title: string): Promise<string> {
  await page.goto('/follow-ups/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Branch').selectOption('salt');
  await page.getByLabel('Category').selectOption('call');
  // Form requires due date.
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const yyyy = due.getFullYear();
  const mm = String(due.getMonth() + 1).padStart(2, '0');
  const dd = String(due.getDate()).padStart(2, '0');
  await page.getByLabel('Due date').fill(`${yyyy}-${mm}-${dd}`);
  const created = page.waitForResponse((r) => r.url().includes('rpc_create_follow_up'));
  await page.getByRole('button', { name: /create follow-up/i }).click();
  expect((await created).status()).toBe(200);
  await page.waitForURL(/\/follow-ups\/[0-9a-f-]+$/);
  const m = page.url().match(/\/follow-ups\/([0-9a-f-]+)$/);
  if (!m) throw new Error(`could not parse follow-up id from ${page.url()}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return m[1];
}

test.describe('Follow-up action menu — admin happy path (F1.3)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('Working on it transitions status and adds a History row', async ({ page }) => {
    const ts = Date.now();
    const title = `F1.3 working-on-it ${ts}`;
    await createFollowUp(page, title);

    await page.getByTestId('follow-up-actions-trigger').click();
    await expect(page.getByTestId('follow-up-actions-menu')).toBeVisible();

    const resp = page.waitForResponse((r) => r.url().includes('rpc_set_follow_up_status'));
    await page.getByTestId('follow-up-action-working').click();
    expect((await resp).status()).toBe(200);

    // Status badge updates on the page header.
    await expect(page.getByText(/Working on it/i).first()).toBeVisible({ timeout: 10_000 });

    // History feed gains a status_change row. The trigger writes it
    // server-side; the detail-query invalidation refreshes the feed.
    const historyFeed = page.getByTestId('follow-up-history-feed');
    await expect(historyFeed).toBeVisible();
    const statusRow = historyFeed.locator('[data-kind="status_change"]');
    await expect(statusRow.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Add note appends a note event without changing status', async ({ page }) => {
    const ts = Date.now();
    const title = `F1.3 note-only ${ts}`;
    await createFollowUp(page, title);

    // window.prompt fires inside handleNote — accept with the note body.
    page.on('dialog', (d) => d.accept('Smoke note from F1.3 spec'));

    await page.getByTestId('follow-up-actions-trigger').click();
    const resp = page.waitForResponse((r) => r.url().includes('rpc_add_follow_up_event'));
    await page.getByTestId('follow-up-action-note').click();
    expect((await resp).status()).toBe(200);

    // History feed shows the note row with the body text.
    const historyFeed = page.getByTestId('follow-up-history-feed');
    await expect(historyFeed).toBeVisible({ timeout: 10_000 });
    await expect(historyFeed.locator('[data-kind="note"]').first()).toBeVisible();
    await expect(historyFeed).toContainText('Smoke note from F1.3 spec');

    // Status badge unchanged (still Pending — note doesn't transition).
    await expect(page.getByText(/Pending/i).first()).toBeVisible();
  });

  test('current status menu item is disabled', async ({ page }) => {
    const ts = Date.now();
    const title = `F1.3 current-disabled ${ts}`;
    await createFollowUp(page, title);

    await page.getByTestId('follow-up-actions-trigger').click();
    // Status starts pending — the "pending" item is not listed (we
    // surface 4 quick-transition items: working / waiting / no_answer /
    // postpone-done-cancel-note). But the active-status carrier item
    // 'working' is enabled here; let's transition then confirm it
    // becomes disabled on re-open.
    await page.getByTestId('follow-up-action-working').click();
    await expect(page.getByText(/Working on it/i).first()).toBeVisible({ timeout: 10_000 });

    // Re-open. "Working on it" should now be disabled.
    await page.getByTestId('follow-up-actions-trigger').click();
    const workingItem = page.getByTestId('follow-up-action-working');
    await expect(workingItem).toBeDisabled();
    await expect(page.getByTestId('follow-up-actions-menu')).toContainText('current');
  });
});

test.describe('Follow-up action menu — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer never sees the Actions trigger on a detail page', async ({ page }) => {
    // Find a follow-up the viewer can see (salt branch). Skip defensively
    // if none — same pattern as linked-records-add.spec.ts viewer test.
    await page.goto('/follow-ups');
    const firstRow = page.locator('main ul li a, main ul li button').first();
    if ((await firstRow.count()) === 0) test.skip(true, 'no follow-ups visible to viewer');
    await firstRow.click();
    await page.waitForURL(/\/follow-ups\/[0-9a-f-]+$/, { timeout: 10_000 });
    await expect(page.getByTestId('follow-up-actions-trigger')).toHaveCount(0);
  });
});
