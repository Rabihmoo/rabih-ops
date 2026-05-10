import { test, expect } from '@playwright/test';

// Phase E — Documents/SOPs.

test.describe('Documents routes — unauthenticated', () => {
  test('/documents redirects to /login', async ({ page }) => {
    await page.goto('/documents');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/documents/new redirects to /login', async ({ page }) => {
    await page.goto('/documents/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/documents/:id redirects to /login', async ({ page }) => {
    await page.goto('/documents/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Documents — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees the documents list and can create one', async ({ page }) => {
    const title = `Smoke SOP ${Date.now()}`;

    await page.goto('/documents/new');
    await expect(page.getByRole('heading', { name: /new document/i })).toBeVisible();

    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Category').selectOption('sop');
    // Body via the markdown textarea
    await page.getByTestId('markdown-textarea').fill('# Steps\n\n1. First\n2. Second');

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('rpc_create_document'),
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /create document/i }).click();
    expect((await responsePromise).status()).toBe(200);

    // Lands on detail page
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('SOP', { exact: true }).first()).toBeVisible();

    // List page now shows it
    await page.goto('/documents');
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('admin sees Linked Documents card on a task detail', async ({ page }) => {
    // Create a task fast so we have one to open.
    await page.goto('/tasks/new');
    await page.getByLabel('Title').fill(`Doc-link target ${Date.now()}`);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByRole('button', { name: /create task/i }).click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]+$/);

    // The Linked documents card renders for any caller; the testid'd Link button
    // appears for users with mutate permission.
    await expect(page.getByText(/Linked documents/i)).toBeVisible();
    await expect(page.getByTestId('link-document-button')).toBeVisible();
  });
});

test.describe('Documents — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer cannot create from the list', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    await expect(page.getByTestId('new-document-button')).toHaveCount(0);
  });
});
