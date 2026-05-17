import { test, expect, type Page } from '@playwright/test';

// Wait for the page to settle into one of its two top-level states:
// either the not-connected card or the filter-chip row. Returns true
// when the page is in the connected (chips visible) state.
async function settleAndIsConnected(page: Page): Promise<boolean> {
  const notConnected = page.getByTestId('calendar-not-connected');
  const todayChip = page.getByTestId('calendar-filter-today');
  await Promise.race([
    notConnected.waitFor({ state: 'visible', timeout: 15_000 }),
    todayChip.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  return await todayChip.isVisible().catch(() => false);
}

// =====================================================================
// /calendar page shell (C2).
//
// Visibility-only chunk — no actions besides "Open in Google Calendar".
// Six filter chips: today / upcoming / recurring / unlinked / linked /
// ignored. Default = today, persisted via the ?filter URL param.
//
// Connected-state event-render assertions defensively skip when the
// admin fixture's Calendar isn't linked. The page shell, chip set, and
// not-connected card all render either way.
// =====================================================================

test.describe('Calendar page — unauthenticated', () => {
  test('/calendar redirects to /login', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Calendar page — admin shell', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('renders heading + sidebar entry', async ({ page }) => {
    await page.goto('/calendar');
    await expect(
      page.getByRole('heading', { name: 'Calendar', exact: true }),
    ).toBeVisible();

    // Sidebar nav entry is rendered when viewport is md+; force a
    // desktop viewport via the test runner default. The Playwright
    // config already uses 1280x720 for chromium.
    const sidebarLink = page.locator('aside a[href="/calendar"]');
    await expect(sidebarLink.first()).toBeVisible();
  });

  test('all six filter chips render with the right testids', async ({ page }) => {
    await page.goto('/calendar');
    const connected = await settleAndIsConnected(page);
    test.skip(!connected, 'Calendar not connected on admin fixture.');

    for (const key of [
      'today',
      'upcoming',
      'recurring',
      'unlinked',
      'linked',
      'ignored',
    ]) {
      await expect(page.getByTestId(`calendar-filter-${key}`)).toBeVisible();
    }
    await expect(page.getByTestId('calendar-filter-today')).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  test('chip click updates URL ?filter param', async ({ page }) => {
    await page.goto('/calendar');
    const connected = await settleAndIsConnected(page);
    test.skip(!connected, 'Calendar not connected on admin fixture.');

    await page.getByTestId('calendar-filter-upcoming').click();
    await expect(page).toHaveURL(/[?&]filter=upcoming/);
    await expect(page.getByTestId('calendar-filter-upcoming')).toHaveAttribute(
      'data-active',
      'true',
    );

    await page.getByTestId('calendar-filter-recurring').click();
    await expect(page).toHaveURL(/[?&]filter=recurring/);
    await expect(page.getByTestId('calendar-filter-recurring')).toHaveAttribute(
      'data-active',
      'true',
    );

    // Today chip clears the param (default).
    await page.getByTestId('calendar-filter-today').click();
    await expect(page).not.toHaveURL(/[?&]filter=/);
  });

  test('events render with Open in Google Calendar links (connected only)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/calendar');
    const connected = await settleAndIsConnected(page);
    test.skip(!connected, 'Calendar not connected on admin fixture.');

    // Upcoming chip — broader window, more likely to find content than Today.
    await page.getByTestId('calendar-filter-upcoming').click();

    // Wait for loading state to clear (either rows OR empty card appears).
    const rows = page.getByTestId('calendar-event-row');
    const empty = page.getByTestId('calendar-empty');
    await Promise.race([
      rows.first().waitFor({ state: 'visible', timeout: 15_000 }),
      empty.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);

    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, 'Connected admin has zero events in the next 7 days.');
    }
    // Every event row has an "Open in Google Calendar" external link.
    const externals = page.getByTestId('calendar-event-open-google');
    await expect(externals.first()).toHaveAttribute(
      'aria-label',
      'Open in Google Calendar',
    );
    const href = await externals.first().getAttribute('href');
    expect(href).toBeTruthy();
  });

  test('not-connected card renders when Calendar is not linked', async ({
    page,
  }) => {
    await page.goto('/calendar');
    const connected = await settleAndIsConnected(page);
    test.skip(connected, 'Calendar IS connected on this fixture.');
    await expect(page.getByTestId('calendar-not-connected')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /open settings/i }),
    ).toBeVisible();
  });
});
