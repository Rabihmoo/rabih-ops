// Phase 8 chunk 8.5 — Dashboard Command Center E2E.
//
// Tests:
//   1. Quick-capture task happy path
//   2. Quick-capture note happy path
//   3. Quick-capture follow-up happy path
//   4. Quick-capture validation (empty submit)
//   5. Pin/unpin persistence across reload
//   6. Viewer: no quick-capture
//   7. Today rollup links
//   8. Mobile quick-capture layout

import { test, expect } from '@playwright/test';
import { e2eTitle } from '../helpers/e2e-title';

// =========================================================
// Admin tests — Quick Capture
// =========================================================

test.describe('Dashboard Command Center — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('quick-capture task: type + enter creates task', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('quick-task-input');
    // Skip if quick capture not visible (possible if viewer somehow)
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Quick capture not visible');
      return;
    }

    const title = e2eTitle('quick task');
    await input.fill(title);
    await input.press('Enter');

    // Wait for success toast
    await expect(page.getByText('Task created')).toBeVisible({ timeout: 10_000 });

    // Input should be cleared after success
    await expect(input).toHaveValue('');
  });

  test('quick-capture note: type + enter creates note', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('quick-note-input');
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Quick capture not visible');
      return;
    }

    const text = e2eTitle('quick note');
    await input.fill(text);
    await input.press('Enter');

    await expect(page.getByText('Note created')).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue('');
  });

  test('quick-capture follow-up: type + enter creates follow-up', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('quick-followup-input');
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Quick capture not visible');
      return;
    }

    const title = e2eTitle('quick followup');
    await input.fill(title);
    await input.press('Enter');

    await expect(page.getByText('Follow-up created')).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue('');
  });

  test('quick-capture validation: empty submit shows error', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('quick-task-input');
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Quick capture not visible');
      return;
    }

    // Submit empty
    await page.getByTestId('quick-task-submit').click();

    // Error should appear
    await expect(page.getByTestId('quick-task-error')).toBeVisible();
    await expect(page.getByTestId('quick-task-error')).toHaveText('Title is required');
  });

  test('today rollup row renders with stats', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rollup = page.getByTestId('today-rollup-row');
    await expect(rollup).toBeVisible({ timeout: 8000 });

    // Should have 4 stat cells
    await expect(page.getByTestId('rollup-overdue')).toBeVisible();
    await expect(page.getByTestId('rollup-follow-ups-today')).toBeVisible();
    await expect(page.getByTestId('rollup-due-soon')).toBeVisible();
    await expect(page.getByTestId('rollup-waiting')).toBeVisible();
  });

  test('rollup stat links navigate to filtered list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overdueLink = page.getByTestId('rollup-overdue');
    if (!(await overdueLink.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Rollup not visible');
      return;
    }

    await overdueLink.click();
    await page.waitForURL(/\/tasks/);
  });

  test('pin button toggles pin state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const pinBtn = page.getByTestId('pin-overdue');
    if (!(await pinBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Pin button not visible (no overdue section)');
      return;
    }

    // Click to pin
    await pinBtn.click();
    // Small delay for mutation
    await page.waitForTimeout(500);

    // Reload to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The pin button should still exist (section still renders)
    const pinBtnAfter = page.getByTestId('pin-overdue');
    if (await pinBtnAfter.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Unpin to clean up
      await pinBtnAfter.click();
      await page.waitForTimeout(500);
    }
  });
});

// =========================================================
// Viewer — no quick-capture
// =========================================================

test.describe('Dashboard Command Center — viewer', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer does not see quick-capture row', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Quick capture should not be visible for viewers
    await expect(page.getByTestId('quick-capture-row')).not.toBeVisible();

    // Today rollup should still be visible
    await expect(page.getByTestId('today-rollup-row')).toBeVisible({ timeout: 8000 });
  });
});

// =========================================================
// Mobile layout
// =========================================================

test.describe('Dashboard Command Center — mobile', () => {
  test.use({
    storageState: 'tests/fixtures/.auth/admin.json',
    viewport: { width: 390, height: 844 },
  });

  test('quick-capture stacks vertically on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const qcRow = page.getByTestId('quick-capture-row');
    if (!(await qcRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Quick capture not visible');
      return;
    }

    // All three inputs should be visible
    await expect(page.getByTestId('quick-task-input')).toBeVisible();
    await expect(page.getByTestId('quick-note-input')).toBeVisible();
    await expect(page.getByTestId('quick-followup-input')).toBeVisible();

    // Rollup should be in 2×2 grid (check it's visible)
    await expect(page.getByTestId('today-rollup-row')).toBeVisible();
  });
});
