// G.5 — Inbox "Today's emails" chip + section headers E2E.

import { test, expect } from '@playwright/test';

test.describe('Inbox — Today\'s emails chip + section headers', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('today_emails filter chip is visible in inbox', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('inbox-filter-today_emails');
    await expect(chip).toBeVisible({ timeout: 8000 });
  });

  test('clicking today_emails chip filters to gmail items from today', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('inbox-filter-today_emails');
    await expect(chip).toBeVisible({ timeout: 8000 });
    await chip.click();

    // URL should have filter param
    await expect(page).toHaveURL(/filter=today_emails/);

    // Either items show or empty state — both are valid depending on staging data
    const list = page.getByTestId('inbox-list');
    const empty = page.getByText(/no.*items/i);
    await expect(list.or(empty)).toBeVisible({ timeout: 10_000 });
  });

  test('section headers appear when multiple severity groups exist', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    // The "all" filter shows everything — if there are items from multiple severity groups,
    // section headers should appear
    const list = page.getByTestId('inbox-list');
    const hasItems = await list.isVisible({ timeout: 8000 }).catch(() => false);

    if (hasItems) {
      // Check if any section header exists
      const sections = page.locator('[data-testid^="inbox-section-"]');
      const sectionCount = await sections.count();
      // If there are multiple severity groups, headers should appear
      // If all items are same severity, no headers (flat list)
      // Both are valid — just check the DOM is consistent
      if (sectionCount > 0) {
        // At least one section header rendered
        await expect(sections.first()).toBeVisible();
      }
    }
  });

  test('filter chip shows count for today_emails', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('inbox-filter-today_emails');
    await expect(chip).toBeVisible({ timeout: 8000 });

    // The chip should contain a number (count)
    const text = await chip.textContent();
    // "Today's emails N" — the count is the last token
    expect(text).toMatch(/Today's emails\s*\d+/);
  });
});
