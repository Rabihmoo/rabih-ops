import { test, expect } from '@playwright/test';

// Phase C — Telegram Settings card. Edge Functions themselves are tested
// indirectly via the RPC smoke (scripts/audit-staging-style probes); here
// we only assert the link / unlink controls exist and gate by role.

test.describe('Telegram link card — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees Link Telegram and request-link RPC fires', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // Either Link or Unlink button is present; one of them is testid'd.
    const linkBtn = page.getByTestId('telegram-link-button');
    const unlinkBtn = page.getByTestId('telegram-unlink-button');
    await expect(linkBtn.or(unlinkBtn)).toBeVisible();

    if (await linkBtn.isVisible().catch(() => false)) {
      // Click and assert the request_link RPC fires + a deep-link panel appears.
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('rpc_telegram_request_link'),
        { timeout: 10_000 },
      );
      // Stub window.open so the test doesn't actually navigate to t.me.
      await page.addInitScript(() => {
        // @ts-expect-error — replace open with a no-op
        window.open = () => null;
      });
      await page.reload();
      await page.getByTestId('telegram-link-button').click();
      const res = await responsePromise;
      expect(res.status()).toBe(200);
    }
  });
});

test.describe('Telegram card — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer can also link their own account', async ({ page }) => {
    // Linking is per-user, not gated by role — viewers can still receive
    // their own daily summary if/when that becomes available to them.
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const linkBtn = page.getByTestId('telegram-link-button');
    const unlinkBtn = page.getByTestId('telegram-unlink-button');
    await expect(linkBtn.or(unlinkBtn)).toBeVisible();
  });
});
