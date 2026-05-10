import { test, expect } from '@playwright/test';

// =========================================================
// Unauthenticated route gating
// =========================================================

test.describe('Fixed tasks routes — unauthenticated', () => {
  test('/fixed-tasks redirects to /login', async ({ page }) => {
    await page.goto('/fixed-tasks');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  });

  test('/fixed-tasks/new redirects to /login', async ({ page }) => {
    await page.goto('/fixed-tasks/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/fixed-tasks/:id redirects to /login', async ({ page }) => {
    await page.goto('/fixed-tasks/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// =========================================================
// Admin happy path — create a daily template, verify it shows, archive it.
// =========================================================

test.describe('Fixed tasks — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin can create + archive a daily template', async ({ page }) => {
    const title = `Phase Z fixed ${Date.now()}`;

    await page.goto('/fixed-tasks/new');
    await expect(
      page.getByRole('heading', { name: /new fixed task/i }),
    ).toBeVisible();

    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByLabel(/Time/i).fill('09:00');

    // Default cadence = daily; submit.
    const created = page.waitForResponse((r) =>
      r.url().includes('rpc_create_recurring_task'),
    );
    await page.getByRole('button', { name: /create template/i }).click();
    expect((await created).status()).toBe(200);

    // Lands on detail page.
    await expect(page).toHaveURL(/\/fixed-tasks\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Daily at 09:00')).toBeVisible();

    // List page should now show it.
    await page.goto('/fixed-tasks');
    await expect(page.getByText(title).first()).toBeVisible();

    // Open it again, archive.
    await page.getByText(title).first().click();
    await page.waitForURL(/\/fixed-tasks\/[0-9a-f-]+$/);
    page.once('dialog', (d) => d.accept());
    const archived = page.waitForResponse((r) =>
      r.url().includes('rpc_archive_recurring_template'),
    );
    await page.getByTestId('template-archive-button').click();
    expect((await archived).status()).toBe(200);
    await expect(page.getByText('archived', { exact: true })).toBeVisible();
  });
});

// =========================================================
// Viewer guard — list visible, create button hidden.
// =========================================================

test.describe('Fixed tasks — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer cannot create from the list', async ({ page }) => {
    await page.goto('/fixed-tasks');
    await expect(page.getByRole('heading', { name: 'Fixed tasks' })).toBeVisible();
    await expect(page.getByTestId('new-fixed-task-button')).toHaveCount(0);
  });
});
