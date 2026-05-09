import { test, expect } from '@playwright/test';

// Auth-dependent flows for the Purchasing module are covered indirectly
// by the existing viewer-guard tests in tasks.spec.ts (the same useCanMutate
// gate drives the "+ New request" button visibility). Route gating is
// verifiable without a session and is checked here.

test.describe('Purchases routes — unauthenticated', () => {
  test('/purchases redirects to /login', async ({ page }) => {
    await page.goto('/purchases');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  });

  test('/purchases/new redirects to /login', async ({ page }) => {
    await page.goto('/purchases/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/purchases/:id redirects to /login', async ({ page }) => {
    await page.goto('/purchases/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// Admin happy path: list page renders and the "+ New request" button is
// visible (useCanMutate gate — admin always passes).
test.describe('Purchases — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees the purchases list with new-request control', async ({ page }) => {
    await page.goto('/purchases');
    await expect(page.getByRole('heading', { name: 'Purchasing' })).toBeVisible();
    await expect(page.getByTestId('new-purchase-button')).toBeVisible();
  });
});

// Viewer guard: list renders, but the "+ New request" button is gated by
// useCanMutate (admin/ceo/manager only). Viewer should NOT see it.
test.describe('Purchases — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer cannot create purchases from the list', async ({ page }) => {
    await page.goto('/purchases');
    await expect(page.getByRole('heading', { name: 'Purchasing' })).toBeVisible();
    await expect(page.getByTestId('new-purchase-button')).toHaveCount(0);
  });
});
