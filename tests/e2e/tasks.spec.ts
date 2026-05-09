import { test, expect } from '@playwright/test';

// =========================================================
// Unauthenticated route gating
// =========================================================

test.describe('Tasks routes — unauthenticated', () => {
  test('/tasks redirects to /login', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  });

  test('/tasks/new redirects to /login', async ({ page }) => {
    await page.goto('/tasks/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/tasks/:id redirects to /login', async ({ page }) => {
    await page.goto('/tasks/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// =========================================================
// Admin happy path — seeded by auth.setup.ts
// =========================================================

test.describe('Tasks — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees authed dashboard and mutate controls', async ({ page }) => {
    await page.goto('/');
    // Greeting depends on time of day (morning / afternoon / evening / night).
    await expect(
      page.getByRole('heading', { name: /good (morning|afternoon|evening|night)/i }),
    ).toBeVisible();

    await page.goto('/tasks');
    await expect(page.getByTestId('new-task-button')).toBeVisible();

    await page.goto('/follow-ups');
    await expect(page.getByTestId('new-follow-up-button')).toBeVisible();
  });
});

// =========================================================
// Viewer guard — seeded by auth.setup.ts
// =========================================================

test.describe('Tasks — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer cannot mutate from the tasks list', async ({ page }) => {
    await page.goto('/tasks');
    // Page renders (RLS lets viewer SELECT), but the create button is hidden
    // by useCanMutate.
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByTestId('new-task-button')).toHaveCount(0);
  });

  test('viewer cannot mutate from the follow-ups list', async ({ page }) => {
    await page.goto('/follow-ups');
    await expect(page.getByRole('heading', { name: 'Follow-ups' })).toBeVisible();
    await expect(page.getByTestId('new-follow-up-button')).toHaveCount(0);
  });

  test('viewer hits 42501 if they bypass the UI to /tasks/new', async ({ page }) => {
    // The new-task page itself doesn't gate by role — only the dashboard
    // button does. A viewer who guesses the URL can fill the form, but
    // rpc_create_task rejects with 42501 because _can_mutate() is false.
    // We assert at the network layer because the toast is transient and
    // matching its text is brittle across UI tweaks.
    await page.goto('/tasks/new');
    await expect(page.getByRole('heading', { name: /new task/i })).toBeVisible();
    await page.getByLabel('Title').fill('Should not save');
    await page.getByLabel('Branch').selectOption('salt');
    await page.getByLabel('Category').selectOption('operations');

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('rpc_create_task'),
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /create task/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(body.code).toBe('42501');
    // App stays on /tasks/new because creation failed.
    await expect(page).toHaveURL(/\/tasks\/new$/);
  });
});
