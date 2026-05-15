import { test, expect } from '@playwright/test';

// Phase H4.7 — LinkedRecordsPanel mount-only smoke for the six newly
// covered detail pages (FollowUp, Inspection, Purchase, Document,
// Company, Contact). Asserts the panel renders + sits in empty state
// on a fresh entity. Existing legacy LinkedDocumentsCard /
// LinkedEmailsCard stay mounted on the pages that already had them —
// removing them is reserved for H4.8.
//
// Two representative pages exercised here (Company + Contact); the
// other four pages are covered by typecheck + build + manual visual
// review. Picking just two keeps the spec fast and the create-flow
// burden low — they share the simplest UI creation path.

test.describe('Linked records — panel mounted on Company + Contact detail (H4.7)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees the panel on a freshly created company detail', async ({ page }) => {
    const stamp = Date.now();
    const companyName = `H4.7 mount-co ${stamp}`;

    await page.goto('/companies/new');
    await page.getByLabel('Name').fill(companyName);
    await page.getByLabel('Category').selectOption('supplier');
    await page.getByTestId('branch-option-salt').click();
    await page.getByRole('button', { name: /create company/i }).click();

    await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

    // Panel renders + opens in the empty-state shape since the company
    // has no relations yet.
    await expect(page.getByTestId('linked-records-panel')).toBeVisible();
    await expect(page.getByTestId('linked-records-empty')).toBeVisible();
  });

  test('admin sees the panel on a freshly created contact detail', async ({ page }) => {
    const stamp = Date.now();
    const companyName = `H4.7 mount-host ${stamp}`;
    const contactName = `H4.7 mount-person ${stamp}`;

    // Need a parent company so the contact has somewhere to live.
    await page.goto('/companies/new');
    await page.getByLabel('Name').fill(companyName);
    await page.getByLabel('Category').selectOption('supplier');
    await page.getByTestId('branch-option-salt').click();
    await page.getByRole('button', { name: /create company/i }).click();
    await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().match(/\/companies\/([0-9a-f-]{36})/)![1];

    await page.goto(`/contacts/new?company_id=${companyId}`);
    await page.getByLabel('Full name').fill(contactName);
    await page.getByRole('button', { name: /create contact/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: contactName })).toBeVisible();

    await expect(page.getByTestId('linked-records-panel')).toBeVisible();
    await expect(page.getByTestId('linked-records-empty')).toBeVisible();
  });
});

test.describe('Linked records — viewer guard on the newly mounted pages', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer on a visible company detail sees the panel without +Link', async ({ page }) => {
    // Reuse whatever company a prior admin spec left around. The viewer
    // fixture has branch=salt; skip cleanly if no salt-visible row
    // appears (same defensive pattern as the H4.4 viewer spec).
    await page.goto('/companies?show_archived=true');
    const firstRow = page.getByTestId('company-list-item').first();
    if ((await firstRow.count()) === 0) test.skip(true, 'no companies visible to viewer');
    await firstRow.click();
    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await expect(page.getByTestId('linked-records-panel')).toBeVisible();
    await expect(page.getByTestId('linked-records-add-button')).toHaveCount(0);
    await expect(page.getByTestId('linked-records-empty-add-button')).toHaveCount(0);
  });
});
