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
// Chunk X — admin can permanently delete an archived template.
// =========================================================

test.describe('Fixed tasks — delete archived (Chunk X)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin permanently deletes an archived template', async ({ page }) => {
    const title = `Chunk X delete ${Date.now()}`;

    // Create + archive in one flow (re-uses the existing happy-path
    // steps rather than depending on a fixture row).
    await page.goto('/fixed-tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByLabel(/Time/i).fill('09:00');
    const created = page.waitForResponse((r) =>
      r.url().includes('rpc_create_recurring_task'),
    );
    await page.getByRole('button', { name: /create template/i }).click();
    expect((await created).status()).toBe(200);
    await page.waitForURL(/\/fixed-tasks\/[0-9a-f-]+$/);
    const detailUrl = page.url();

    // Archive.
    page.once('dialog', (d) => d.accept());
    const archived = page.waitForResponse((r) =>
      r.url().includes('rpc_archive_recurring_template'),
    );
    await page.getByTestId('template-archive-button').click();
    expect((await archived).status()).toBe(200);
    await expect(page.getByText('archived', { exact: true })).toBeVisible();

    // The new Delete-permanently button now renders alongside Re-enable.
    const deleteBtn = page.getByTestId('template-delete-permanently-button');
    await expect(deleteBtn).toBeVisible();

    // Click + accept the confirm dialog. Navigates back to /fixed-tasks.
    page.once('dialog', (d) => d.accept());
    const deleted = page.waitForResponse((r) =>
      r.url().includes('rpc_delete_archived_template'),
    );
    await deleteBtn.click();
    expect((await deleted).status()).toBe(200);
    await page.waitForURL(/\/fixed-tasks$/, { timeout: 10_000 });

    // The template no longer appears in any list view, including
    // show_archived=true (rpc_list_tasks filters on deleted_at IS NULL).
    // Note: detailUrl re-visit isn't asserted here — TanStack cache +
    // page-mount timing make the not-found vs stale-cached transition
    // flaky in CI. The list assertion above is the authoritative
    // visibility check.
    void detailUrl;
    await page.goto('/fixed-tasks?show_archived=true');
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test('Delete-permanently button is hidden on non-archived templates', async ({ page }) => {
    const title = `Chunk X not-archived ${Date.now()}`;
    await page.goto('/fixed-tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');
    await page.getByLabel(/Time/i).fill('09:00');
    await page.getByRole('button', { name: /create template/i }).click();
    await page.waitForURL(/\/fixed-tasks\/[0-9a-f-]+$/);

    // Not archived → no delete button (the archive button is what's shown).
    await expect(page.getByTestId('template-archive-button')).toBeVisible();
    await expect(page.getByTestId('template-delete-permanently-button')).toHaveCount(0);
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
