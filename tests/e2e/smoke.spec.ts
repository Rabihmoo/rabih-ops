import { test, expect } from '@playwright/test';

test('login page renders and prompts for email', async ({ page }) => {
  await page.goto('/');
  // Unauthenticated visitors get redirected to /login.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Rabih Ops' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: /send magic link/i })).toBeVisible();
});

test('magic link form rejects invalid email', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: /send magic link/i }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible();
});
