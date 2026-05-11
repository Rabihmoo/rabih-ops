import { test, expect } from '@playwright/test';

// Phase H2.2 — Contacts UI.

test.describe('Contacts — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin creates a contact and the branches default-copy from the company', async ({ page }) => {
    const stamp = Date.now();
    const companyName = `Contact-Co ${stamp}`;
    const contactName = `Contact-Person ${stamp}`;

    // First create a company so the contact has a parent to default from.
    await page.goto('/companies/new');
    await page.getByLabel('Name').fill(companyName);
    await page.getByLabel('Category').selectOption('supplier');
    await page.getByTestId('branch-option-salt').click();
    await page.getByTestId('branch-option-bbqhouse').click();
    await page.getByRole('button', { name: /create company/i }).click();
    await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyUrl = page.url();
    const companyId = companyUrl.match(/\/companies\/([0-9a-f-]{36})/)![1];

    // Now create a contact under that company without picking any branches —
    // they should default-copy at the RPC layer.
    await page.goto(`/contacts/new?company_id=${companyId}`);
    await page.getByLabel('Full name').fill(contactName);
    // Branch list left empty.
    await page.getByRole('button', { name: /create contact/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: contactName })).toBeVisible();

    // Branches editor toggle reveals two chips, inherited from the company.
    await page.getByTestId('contact-branches-toggle').click();
    await expect(page.getByTestId('branch-option-salt')).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('branch-option-bbqhouse')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });
});

test.describe('Contacts — viewer', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer sees list without a New contact button', async ({ page }) => {
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByTestId('new-contact-button')).toHaveCount(0);
  });

  test('viewer hitting /contacts/new sees a not-authorized state, not a form', async ({ page }) => {
    await page.goto('/contacts/new');
    await expect(page.getByText(/You can't create contacts/i)).toBeVisible();
    await expect(page.getByTestId('contact-form-branches')).toHaveCount(0);
  });
});
