import { test, expect } from '@playwright/test';

// Phase F — Gmail. The Settings card, Dashboard "Today's emails" +
// "Important this week" sections, and the LinkedEmailsCard on task /
// follow-up detail must render correctly without a real Google OAuth
// session; the full handshake is exercised manually after the operator
// wires up Google Cloud credentials.

test.describe('Gmail — Settings card', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees Connect Gmail when not linked', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const connectBtn = page.getByTestId('gmail-connect-button');
    const disconnectBtn = page.getByTestId('gmail-disconnect-button');
    await expect(connectBtn.or(disconnectBtn)).toBeVisible();
  });

  test('Connect button calls rpc_gmail_request_authorize', async ({ page }) => {
    await page.goto('/settings');
    const connectBtn = page.getByTestId('gmail-connect-button');
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
      (r) => r.url().includes('rpc_gmail_request_authorize'),
      { timeout: 10_000 },
    );
    await page.getByTestId('gmail-connect-button').click();
    const res = await responsePromise;
    expect(res.status()).toBe(200);
  });
});

test.describe('Gmail — dashboard surface', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('Today + Important sections hidden when Gmail is not connected', async ({ page }) => {
    // Only assert this if Gmail isn't linked on staging — otherwise the
    // sections would correctly be visible and the assertion would fail.
    await page.goto('/settings');
    const linked = await page
      .getByTestId('gmail-disconnect-button')
      .isVisible()
      .catch(() => false);
    test.skip(linked, 'Gmail is linked on staging; the sections are expected to render.');
    await page.goto('/');
    await expect(page.getByText("Today's emails")).toHaveCount(0);
    await expect(page.getByText('Important this week')).toHaveCount(0);
    // G2.3: row-action ⋮ triggers are children of EmailRow which only
    // mounts inside the cards. Cards hidden → triggers absent.
    // Asserted defensively in case a future change accidentally leaks
    // the row outside its card.
    await expect(page.getByTestId('email-row-actions-trigger')).toHaveCount(0);
  });
});

test.describe('Gmail — task detail LinkedEmailsCard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('Linked emails card stays hidden on tasks when Gmail is not connected', async ({ page }) => {
    await page.goto('/settings');
    const linked = await page
      .getByTestId('gmail-disconnect-button')
      .isVisible()
      .catch(() => false);

    // Create a task fast.
    await page.goto('/tasks/new');
    await page.getByLabel('Title').fill(`Gmail-link target ${Date.now()}`);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByRole('button', { name: /create task/i }).click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]+$/);

    if (linked) {
      // Connected: the card and the testid-bearing button should be present.
      await expect(page.getByText(/Linked emails/i)).toBeVisible();
      await expect(page.getByTestId('link-email-button')).toBeVisible();
    } else {
      // Not connected: the card hides itself entirely (no count, no button).
      await expect(page.getByText(/Linked emails/i)).toHaveCount(0);
      await expect(page.getByTestId('link-email-button')).toHaveCount(0);
    }
  });
});

test.describe('Gmail — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer sees the Settings Gmail card and can connect their own account', async ({ page }) => {
    await page.goto('/settings');
    const connectBtn = page.getByTestId('gmail-connect-button');
    const disconnectBtn = page.getByTestId('gmail-disconnect-button');
    await expect(connectBtn.or(disconnectBtn)).toBeVisible();
  });
});
