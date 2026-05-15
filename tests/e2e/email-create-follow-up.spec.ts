import { test, expect } from '@playwright/test';

// "Create follow-up from email" action menu wire-up.
//
// Defensive-skip if Gmail isn't connected on staging — same pattern as
// gmail.spec.ts. The full end-to-end happy path needs a real Gmail
// session; the action-menu trigger is gated on `googleAccountId`
// returned by rpc_gmail_link_status, so without a connection there's
// no menu to assert against.
//
// Pure flow logic (composeFollowUpFromEmail + createFollowUpFromEmailFlow)
// is covered deterministically by src/lib/email-create-follow-up.test.ts
// and runs unconditionally in CI.

test.describe('Email row action — create follow-up from email', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees the "Create follow-up from email" menu item when Gmail is connected', async ({
    page,
  }) => {
    // Same Gmail-connected detection the other gmail.spec.ts tests use —
    // disconnect button presence on /settings means there's a live link.
    await page.goto('/settings');
    const linked = await page
      .getByTestId('gmail-disconnect-button')
      .isVisible()
      .catch(() => false);
    test.skip(
      !linked,
      'Gmail not connected on staging — the action menu is hidden when googleAccountId is null.',
    );

    await page.goto('/');
    // Wait for at least one email row to mount (Today or Important card).
    const firstRow = page.getByTestId('dashboard-email-row').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'No emails surfaced today — nothing to hang a menu on.');
    }
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Hover so the desktop hover-revealed ⋮ surfaces (always visible on
    // mobile per EmailRowActionMenu.tsx — the css gate is sm:opacity-0
    // sm:group-hover:opacity-100).
    await firstRow.hover();
    const trigger = firstRow.getByTestId('email-row-actions-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const menu = page.getByTestId('email-row-actions-menu');
    await expect(menu).toBeVisible();
    // Existing "Mark followed up" still present + unchanged.
    await expect(
      menu.getByTestId('email-row-action-followed_up'),
    ).toBeVisible();
    // New: the separate "Create follow-up from email" action.
    await expect(
      menu.getByTestId('email-row-action-create-follow-up'),
    ).toBeVisible();
    await expect(
      menu.getByTestId('email-row-action-create-follow-up'),
    ).toHaveText(/create follow-up from email/i);
  });

  test('full create-and-link round trip surfaces the follow-up in /follow-ups and flips the email pill', async ({
    page,
  }) => {
    await page.goto('/settings');
    const linked = await page
      .getByTestId('gmail-disconnect-button')
      .isVisible()
      .catch(() => false);
    test.skip(
      !linked,
      'Gmail not connected on staging — full round trip needs a real session.',
    );

    await page.goto('/');
    const firstRow = page.getByTestId('dashboard-email-row').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'No emails surfaced today — nothing to convert.');
    }
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Capture the row's subject text so we can match the new follow-up
    // by title on the /follow-ups page. The subject is in the first
    // text line of the row (line-clamp-1 font-medium).
    const subjectLocator = firstRow.locator('.line-clamp-1.font-medium').first();
    const subject = (await subjectLocator.textContent())?.trim() ?? '';

    await firstRow.hover();
    await firstRow.getByTestId('email-row-actions-trigger').click();

    // Both RPC calls fire from the same handler. Wait for create THEN
    // link to land before walking off to /follow-ups, so the read can
    // see the new row.
    const createResp = page.waitForResponse(
      (r) => r.url().includes('rpc_create_follow_up'),
      { timeout: 15_000 },
    );
    const linkResp = page.waitForResponse(
      (r) => r.url().includes('/functions/v1/gmail-action'),
      { timeout: 15_000 },
    );
    await page
      .getByTestId('email-row-actions-menu')
      .getByTestId('email-row-action-create-follow-up')
      .click();
    expect((await createResp).status()).toBe(200);
    expect((await linkResp).status()).toBe(200);

    // The toast surfaces above the menu — confirms both steps succeeded.
    await expect(page.getByText(/follow-up created and linked/i)).toBeVisible({
      timeout: 5_000,
    });

    // /follow-ups should now show the new row matching the subject.
    await page.goto('/follow-ups');
    if (subject.length > 0) {
      await expect(page.getByText(subject).first()).toBeVisible({ timeout: 10_000 });
    }

    // Back to dashboard — pill should be "Linked to follow-up" within a
    // refetch cycle (link-presence query staleTime is 30s, but the
    // useGmailActionLink onSuccess invalidate triggers an immediate
    // refetch).
    await page.goto('/');
    await expect(firstRow.getByTestId('email-row-link-pill')).toBeVisible({
      timeout: 10_000,
    });
    await expect(firstRow.getByTestId('email-row-link-pill')).toHaveText(
      /linked to follow-up/i,
    );
  });
});

test.describe('Email row action — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer never sees the action menu trigger', async ({ page }) => {
    await page.goto('/');
    // Action menu is gated on canMutate AND googleAccountId. Either
    // gate failing hides the trigger; viewer never satisfies
    // canMutate. Defensive zero-count regardless of Gmail state.
    await expect(page.getByTestId('email-row-actions-trigger')).toHaveCount(0);
    await expect(
      page.getByTestId('email-row-action-create-follow-up'),
    ).toHaveCount(0);
  });
});
