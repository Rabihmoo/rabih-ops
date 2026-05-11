import { test, expect } from '@playwright/test';

// Phase H2.2 — Directory hub + sidebar entry.

test.describe('Directory routes — unauthenticated', () => {
  test('/directory redirects to /login', async ({ page }) => {
    await page.goto('/directory');
    await expect(page).toHaveURL(/\/login$/);
  });
  test('/companies redirects to /login', async ({ page }) => {
    await page.goto('/companies');
    await expect(page).toHaveURL(/\/login$/);
  });
  test('/contacts redirects to /login', async ({ page }) => {
    await page.goto('/contacts');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Directory hub — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('hub renders both cards and they navigate to list pages', async ({ page }) => {
    await page.goto('/directory');
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible();
    await expect(page.getByTestId('directory-card-companies')).toBeVisible();
    await expect(page.getByTestId('directory-card-contacts')).toBeVisible();
    await page.getByTestId('directory-card-companies').click();
    await expect(page).toHaveURL(/\/companies$/);
    await page.goBack();
    await page.getByTestId('directory-card-contacts').click();
    await expect(page).toHaveURL(/\/contacts$/);
  });
});

test.describe('Directory hub — mobile layout', () => {
  test.use({
    storageState: 'tests/fixtures/.auth/admin.json',
    viewport: { width: 380, height: 720 },
  });

  test('cards stack on mobile and Directory tab is reachable', async ({ page }) => {
    await page.goto('/directory');
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible();
    await expect(page.getByTestId('directory-card-companies')).toBeVisible();
    await expect(page.getByTestId('directory-card-contacts')).toBeVisible();
  });
});
