import { test, expect } from '@playwright/test';

// Phase G1.3 — Activity inbox.
// Behaviour we assert here is mostly route-level. Stream contents come
// from staging and varies day to day; we only assert structural pieces
// (filter chips, refresh button, empty/partial states render without
// blanking) plus the auth guard.

test.describe('Activity inbox — unauthenticated', () => {
  test('/inbox redirects to /login', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Activity inbox — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin can open /inbox and the chrome renders', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: 'Activity inbox' })).toBeVisible();
    await expect(page.getByTestId('inbox-refresh-button')).toBeVisible();
    // The All filter chip is always present, even on an empty inbox.
    await expect(page.getByTestId('inbox-filter-all')).toBeVisible();
  });

  test('filter chips switch the visible stream', async ({ page }) => {
    await page.goto('/inbox');
    // Wait for the chips to settle.
    await expect(page.getByTestId('inbox-filter-all')).toBeVisible();
    // Initial filter is All.
    await expect(page.getByTestId('inbox-filter-all')).toHaveAttribute(
      'data-active',
      'true',
    );
    // Click Critical and verify it's marked active.
    await page.getByTestId('inbox-filter-critical').click();
    await expect(page.getByTestId('inbox-filter-critical')).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByTestId('inbox-filter-all')).toHaveAttribute(
      'data-active',
      'false',
    );
    // Switch back.
    await page.getByTestId('inbox-filter-all').click();
    await expect(page.getByTestId('inbox-filter-all')).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  test('page tolerates Gmail/Calendar being disconnected — chrome still renders', async ({ page }) => {
    // Stub both Edge Functions to error so we exercise the partial-failure
    // path: the page should still render the heading and chips (and a
    // warning banner since at least one source is failing) — it must not
    // blank out.
    await page.route('**/functions/v1/gmail-list-important', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ connected: false, error: 'simulated' }),
      }),
    );
    await page.route('**/functions/v1/calendar-list-today', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ connected: false, error: 'simulated' }),
      }),
    );
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: 'Activity inbox' })).toBeVisible();
    await expect(page.getByTestId('inbox-filter-all')).toBeVisible();
  });
});

test.describe('Activity inbox — mobile layout', () => {
  test.use({
    storageState: 'tests/fixtures/.auth/admin.json',
    viewport: { width: 380, height: 720 },
  });

  test('renders heading, filter chips and refresh in single-column on phone', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: 'Activity inbox' })).toBeVisible();
    await expect(page.getByTestId('inbox-filter-all')).toBeVisible();
    await expect(page.getByTestId('inbox-refresh-button')).toBeVisible();
  });
});

test.describe('Activity inbox — viewer', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer can open /inbox; viewer-scoped stream renders without errors', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: 'Activity inbox' })).toBeVisible();
    await expect(page.getByTestId('inbox-filter-all')).toBeVisible();
    // We can't assert exact row count (depends on staging fixtures), only
    // that the page renders chrome and doesn't crash on the viewer's
    // narrower visibility.
  });
});
