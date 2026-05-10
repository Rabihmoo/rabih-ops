import { test, expect } from '@playwright/test';

// Phase D — Google Calendar. The Settings card and Task-detail Calendar
// card must render correctly without a real Google OAuth client; the full
// OAuth handshake is exercised manually after the operator wires up
// Google Cloud credentials.

test.describe('Google Calendar — Settings card', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees Connect Google Calendar when not linked', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // Either Connect or Disconnect is present depending on the staging state.
    const connectBtn = page.getByTestId('calendar-connect-button');
    const disconnectBtn = page.getByTestId('calendar-disconnect-button');
    await expect(connectBtn.or(disconnectBtn)).toBeVisible();
  });

  test('Connect button calls request_authorize RPC', async ({ page }) => {
    await page.goto('/settings');
    const connectBtn = page.getByTestId('calendar-connect-button');
    if (!(await connectBtn.isVisible().catch(() => false))) {
      test.skip(true, 'already linked on staging');
    }
    // Stub navigation so the test doesn't actually leave for accounts.google.com.
    await page.addInitScript(() => {
      // @ts-expect-error — stub assignment
      Object.defineProperty(window, 'location', {
        value: { ...window.location, href: window.location.href },
        writable: true,
      });
    });
    await page.reload();
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('rpc_calendar_request_authorize'),
      { timeout: 10_000 },
    );
    await page.getByTestId('calendar-connect-button').click();
    const res = await responsePromise;
    expect(res.status()).toBe(200);
  });
});

test.describe('Google Calendar — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer can also link their own account from Settings', async ({ page }) => {
    await page.goto('/settings');
    const connectBtn = page.getByTestId('calendar-connect-button');
    const disconnectBtn = page.getByTestId('calendar-disconnect-button');
    await expect(connectBtn.or(disconnectBtn)).toBeVisible();
  });
});
