// Phase 7 chunk 7.6 — Notification mute E2E.

import { test, expect } from '@playwright/test';

test.describe('Notification mutes — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('mute chips render on /notifications', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    // At least one mute chip should be visible
    const chip = page.getByTestId('mute-chip-deadline_reminder');
    await expect(chip).toBeVisible({ timeout: 8000 });
  });

  test('clicking mute chip toggles mute state', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('mute-chip-start_reminder');
    await expect(chip).toBeVisible({ timeout: 8000 });

    // Get initial text
    const initialText = await chip.textContent();
    const wasMuted = initialText?.includes('(muted)');

    // Click to toggle
    await chip.click();
    await page.waitForTimeout(1000);

    // Text should have changed
    const newText = await chip.textContent();
    if (wasMuted) {
      expect(newText).not.toContain('(muted)');
    } else {
      expect(newText).toContain('(muted)');
    }

    // Toggle back to clean up
    await chip.click();
    await page.waitForTimeout(500);
  });

  test('mute persists across reload', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('mute-chip-recurring_spawn');
    await expect(chip).toBeVisible({ timeout: 8000 });

    // Ensure it's not muted initially
    const initialText = await chip.textContent();
    if (initialText?.includes('(muted)')) {
      await chip.click();
      await page.waitForTimeout(1000);
    }

    // Mute it
    await chip.click();
    await page.waitForTimeout(1000);
    await expect(chip).toContainText('(muted)');

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be muted
    const chipAfter = page.getByTestId('mute-chip-recurring_spawn');
    await expect(chipAfter).toBeVisible({ timeout: 8000 });
    await expect(chipAfter).toContainText('(muted)');

    // Clean up: unmute
    await chipAfter.click();
    await page.waitForTimeout(500);
  });
});
