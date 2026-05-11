import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Phase H2.2 — Companies UI.

const MANAGER_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  '.auth',
  'manager.json',
);
const hasManager = fs.existsSync(MANAGER_FIXTURE);

test.describe('Companies — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin creates a new company, lands on detail, archives, unarchives', async ({ page }) => {
    const stamp = Date.now();
    const name = `E2E Smoke Co ${stamp}`;
    await page.goto('/companies');
    await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible();

    await page.getByTestId('new-company-button').click();
    await expect(page).toHaveURL(/\/companies\/new$/);

    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Category').selectOption('contractor');
    // Pick a branch.
    await page.getByTestId('branch-option-salt').click();
    await page.getByRole('button', { name: /create company/i }).click();

    await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();

    // Archive + unarchive round trip.
    await page.getByTestId('company-archive').click();
    await expect(page.getByText(/archived/i).first()).toBeVisible();
    await page.getByTestId('company-unarchive').click();
    await expect(page.getByTestId('company-archive')).toBeVisible();
  });

  test('admin can manage branches inline', async ({ page }) => {
    // Reuse an existing company by navigating to the list and clicking the
    // first one. The previous test will have left one behind on staging.
    await page.goto('/companies?show_archived=true');
    const firstRow = page.getByTestId('company-list-item').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.skip(true, 'No companies present to exercise the branches editor');
    }
    await firstRow.click();
    await expect(page.getByText('Branches').first()).toBeVisible();
    await page.getByTestId('company-branches-toggle').click();
    await expect(page.getByTestId('company-branches-editor')).toBeVisible();
  });
});

test.describe('Companies — viewer', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer sees list without a New company button', async ({ page }) => {
    await page.goto('/companies');
    await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible();
    await expect(page.getByTestId('new-company-button')).toHaveCount(0);
  });

  test('viewer hitting /companies/new sees a not-authorized state, not a form', async ({ page }) => {
    await page.goto('/companies/new');
    await expect(page.getByText(/You can't create companies/i)).toBeVisible();
    // The branches multi-select shouldn't be present.
    await expect(page.getByTestId('company-form-branches')).toHaveCount(0);
  });
});

test.describe('Companies — manager (branch overreach)', () => {
  test.skip(!hasManager, 'manager.json fixture not present — set TEST_USER_MANAGER_EMAIL to enable.');
  test.use({ storageState: 'tests/fixtures/.auth/manager.json' });

  test('manager (branches=[salt]) cannot select bbqhouse from the multi-select', async ({ page }) => {
    await page.goto('/companies/new');
    // Salt is offered.
    await expect(page.getByTestId('branch-option-salt')).toBeEnabled();
    // bbqhouse is offered as disabled.
    const bbq = page.getByTestId('branch-option-bbqhouse');
    await expect(bbq).toBeVisible();
    await expect(bbq).toBeDisabled();
  });

  test('manager direct-RPC call to assign an inaccessible branch is rejected (42501)', async ({ page }) => {
    const url = process.env.VITE_SUPABASE_URL ?? '';
    const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
    test.skip(!url || !anon, 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');

    await page.goto('/companies');
    // Drive the RPC directly with the manager's localStorage-cached JWT to
    // verify the server rejects the branch assignment even when the UI is
    // bypassed.
    const result = await page.evaluate(
      async ({ url, anon }) => {
        const ref = url.replace(/^https?:\/\//, '').split('.')[0];
        const raw = window.localStorage.getItem(`sb-${ref}-auth-token`);
        const token = raw ? (JSON.parse(raw) as { access_token?: string }).access_token : null;
        if (!token) return { status: 0, body: 'no token' };
        const res = await fetch(`${url}/rest/v1/rpc/rpc_create_company`, {
          method: 'POST',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_name: `overreach test ${Date.now()}`,
            p_category: 'supplier',
            p_branches: ['bbqhouse'],
          }),
        });
        const text = await res.text();
        return { status: res.status, body: text };
      },
      { url, anon },
    );
    // PostgREST maps SQLSTATE 42501 → HTTP 403.
    expect(result.status).toBe(403);
    expect(result.body).toContain('cannot assign branch');
  });
});
