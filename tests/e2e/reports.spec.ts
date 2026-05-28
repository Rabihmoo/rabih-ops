// Phase 9 chunk 9.7 — Reports E2E.

import { test, expect } from '@playwright/test';

// =========================================================
// Admin tests
// =========================================================

test.describe('Reports — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('reports index page renders with 4 report cards', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    const grid = page.getByTestId('reports-grid');
    await expect(grid).toBeVisible({ timeout: 8000 });

    await expect(page.getByTestId('report-link-task-velocity')).toBeVisible();
    await expect(page.getByTestId('report-link-supplier-spend')).toBeVisible();
    await expect(page.getByTestId('report-link-inspection-pass-rate')).toBeVisible();
    await expect(page.getByTestId('report-link-follow-up-close-rate')).toBeVisible();
  });

  test('task velocity report renders', async ({ page }) => {
    await page.goto('/reports/task-velocity');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('report-filters')).toBeVisible({ timeout: 8000 });
    // Either table or empty state
    await expect(
      page.getByTestId('report-table').or(page.getByText('No data for this period')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('supplier spend report renders', async ({ page }) => {
    await page.goto('/reports/supplier-spend');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('report-filters')).toBeVisible({ timeout: 8000 });
    await expect(
      page.getByTestId('report-table').or(page.getByText('No data for this period')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('inspection pass rate report renders', async ({ page }) => {
    await page.goto('/reports/inspection-pass-rate');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('report-filters')).toBeVisible({ timeout: 8000 });
    await expect(
      page.getByTestId('report-table').or(page.getByText('No data for this period')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('follow-up close rate report renders', async ({ page }) => {
    await page.goto('/reports/follow-up-close-rate');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('report-filters')).toBeVisible({ timeout: 8000 });
    await expect(
      page.getByTestId('report-table').or(page.getByText('No data for this period')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('branch filter narrows results', async ({ page }) => {
    await page.goto('/reports/task-velocity');
    await page.waitForLoadState('networkidle');

    const branchFilter = page.getByTestId('report-branch-filter');
    await expect(branchFilter).toBeVisible({ timeout: 8000 });

    // Select a specific branch
    await branchFilter.selectOption('bbqhouse');

    // URL should update
    await expect(page).toHaveURL(/branch=bbqhouse/);
  });

  test('CSV export button is present', async ({ page }) => {
    await page.goto('/reports/task-velocity');
    await page.waitForLoadState('networkidle');

    const exportBtn = page.getByTestId('csv-export');
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
  });
});

// =========================================================
// Viewer — redirected
// =========================================================

test.describe('Reports — viewer', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer gets redirected from /reports', async ({ page }) => {
    await page.goto('/reports');
    // Should redirect to / (AdminCeoGuard)
    await expect(page).toHaveURL(/^(?!.*\/reports)/);
  });

  test('viewer gets redirected from individual report', async ({ page }) => {
    await page.goto('/reports/task-velocity');
    await expect(page).toHaveURL(/^(?!.*\/reports)/);
  });
});
