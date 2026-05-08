import { test, expect } from '@playwright/test';

// Auth-dependent tests for the follow-ups module are blocked on the same
// Playwright fixture work as tasks.spec.ts. Route gating is verifiable
// without a session and is checked here.

test.describe('Follow-ups routes — unauthenticated', () => {
  test('/follow-ups redirects to /login', async ({ page }) => {
    await page.goto('/follow-ups');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  });

  test('/follow-ups/new redirects to /login', async ({ page }) => {
    await page.goto('/follow-ups/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/follow-ups/new?task_id=<uuid> redirects to /login', async ({ page }) => {
    await page.goto('/follow-ups/new?task_id=00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/follow-ups/:id redirects to /login', async ({ page }) => {
    await page.goto('/follow-ups/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});
