import { test, expect } from '@playwright/test';

// Auth-dependent flows for the Inspections module are covered indirectly
// by the existing viewer-guard test in tasks.spec.ts (the same role gates
// drive the new "+ New inspection" button visibility). Route gating is
// verifiable without a session and is checked here.

test.describe('Inspections routes — unauthenticated', () => {
  test('/inspections redirects to /login', async ({ page }) => {
    await page.goto('/inspections');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  });

  test('/inspections/new redirects to /login', async ({ page }) => {
    await page.goto('/inspections/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/inspections/:id redirects to /login', async ({ page }) => {
    await page.goto('/inspections/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// Admin happy path: inspection list page renders and the
// "+ New inspection" button is visible (admin/ceo gate).
test.describe('Inspections — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees the inspections list with new-inspection control', async ({ page }) => {
    await page.goto('/inspections');
    await expect(page.getByRole('heading', { name: 'Inspections' })).toBeVisible();
    await expect(page.getByTestId('new-inspection-button')).toBeVisible();
  });
});

// Viewer guard: inspection list renders, but the new-inspection button
// is gated by useCanAdminInspect (admin/ceo only — stricter than the
// useCanMutate used elsewhere). Viewer should NOT see it.
test.describe('Inspections — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer cannot create inspections from the list', async ({ page }) => {
    await page.goto('/inspections');
    await expect(page.getByRole('heading', { name: 'Inspections' })).toBeVisible();
    await expect(page.getByTestId('new-inspection-button')).toHaveCount(0);
  });
});
