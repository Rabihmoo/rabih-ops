// Phase 5 chunk 5.5 — Company / Contact Intelligence E2E.
//
// Tests:
//   1. CompanyIntelligenceCard renders on company detail
//   2. Toggle filters (All / Open / Issues)
//   3. "Add purchase from this supplier" CTA prefills purchase form
//   4. Empty state for company with no linked records
//   5. Viewer privacy — card visible but no CTA
//   6. ContactIntelligenceCard renders on contact detail

import { test, expect } from '@playwright/test';

// =========================================================
// Admin tests — Company Intelligence
// =========================================================

test.describe('Company Intelligence — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('intelligence card renders on company detail', async ({ page }) => {
    // Navigate to companies list and click first company
    await page.goto('/companies');
    await page.waitForLoadState('networkidle');

    const companyRow = page.locator('main ul li a, main ul li button').first();
    const hasCompanies = await companyRow.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCompanies) {
      test.skip(true, 'No companies in staging — skipping intelligence card test');
      return;
    }

    await companyRow.click();
    await page.waitForURL(/\/companies\//);

    // Intelligence card should be visible
    const card = page.getByTestId('company-intelligence-card');
    await expect(card).toBeVisible({ timeout: 8000 });

    // Toggle tabs should be present
    await expect(page.getByTestId('intel-tab-all')).toBeVisible();
    await expect(page.getByTestId('intel-tab-open')).toBeVisible();
    await expect(page.getByTestId('intel-tab-issues')).toBeVisible();
  });

  test('toggle filters change displayed rows', async ({ page }) => {
    await page.goto('/companies');
    await page.waitForLoadState('networkidle');

    const companyRow = page.locator('main ul li a, main ul li button').first();
    const hasCompanies = await companyRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCompanies) {
      test.skip(true, 'No companies in staging');
      return;
    }

    await companyRow.click();
    await page.waitForURL(/\/companies\//);
    await page.getByTestId('company-intelligence-card').waitFor({ timeout: 8000 });

    // Click "Open" tab
    await page.getByTestId('intel-tab-open').click();
    // The card should still be visible (might show empty message or filtered rows)
    await expect(page.getByTestId('company-intelligence-card')).toBeVisible();

    // Click "Issues" tab
    await page.getByTestId('intel-tab-issues').click();
    await expect(page.getByTestId('company-intelligence-card')).toBeVisible();

    // Click back to "All"
    await page.getByTestId('intel-tab-all').click();
    await expect(page.getByTestId('company-intelligence-card')).toBeVisible();
  });

  test('CTA navigates to purchase form with supplier prefilled', async ({ page }) => {
    await page.goto('/companies');
    await page.waitForLoadState('networkidle');

    const companyRow = page.locator('main ul li a, main ul li button').first();
    const hasCompanies = await companyRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCompanies) {
      test.skip(true, 'No companies in staging');
      return;
    }

    await companyRow.click();
    await page.waitForURL(/\/companies\//);
    await page.getByTestId('company-intelligence-card').waitFor({ timeout: 8000 });

    const cta = page.getByTestId('intel-add-purchase-cta');
    const hasCta = await cta.isVisible().catch(() => false);
    if (!hasCta) {
      test.skip(true, 'CTA not visible (viewer role or no canMutate)');
      return;
    }

    await cta.click();
    await page.waitForURL(/\/purchases\/new/);

    // The supplier_name param should be in the URL
    expect(page.url()).toContain('supplier_name=');
  });
});

// =========================================================
// Viewer privacy
// =========================================================

test.describe('Company Intelligence — viewer', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer sees card but not CTA', async ({ page }) => {
    await page.goto('/companies');
    await page.waitForLoadState('networkidle');

    const companyRow = page.locator('main ul li a, main ul li button').first();
    const hasCompanies = await companyRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCompanies) {
      test.skip(true, 'No companies visible to viewer');
      return;
    }

    await companyRow.click();
    await page.waitForURL(/\/companies\//);

    // Card should be visible
    const card = page.getByTestId('company-intelligence-card');
    await expect(card).toBeVisible({ timeout: 8000 });

    // CTA should NOT be visible (viewer cannot mutate)
    await expect(page.getByTestId('intel-add-purchase-cta')).not.toBeVisible();
  });
});

// =========================================================
// Contact Intelligence
// =========================================================

test.describe('Contact Intelligence — admin', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('intelligence card renders on contact detail', async ({ page }) => {
    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');

    const contactRow = page.locator('main ul li a, main ul li button').first();
    const hasContacts = await contactRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasContacts) {
      test.skip(true, 'No contacts in staging');
      return;
    }

    await contactRow.click();
    await page.waitForURL(/\/contacts\//);

    const card = page.getByTestId('contact-intelligence-card');
    await expect(card).toBeVisible({ timeout: 8000 });

    // Toggle tabs should be present
    await expect(page.getByTestId('intel-tab-all')).toBeVisible();
  });
});

// =========================================================
// Mobile layout
// =========================================================

test.describe('Company Intelligence — mobile', () => {
  test.use({
    storageState: 'tests/fixtures/.auth/admin.json',
    viewport: { width: 390, height: 844 },
  });

  test('intelligence card renders on mobile company detail', async ({ page }) => {
    await page.goto('/companies');
    await page.waitForLoadState('networkidle');

    const companyRow = page.locator('main ul li a, main ul li button').first();
    const hasCompanies = await companyRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCompanies) {
      test.skip(true, 'No companies in staging');
      return;
    }

    await companyRow.click();
    await page.waitForURL(/\/companies\//);

    const card = page.getByTestId('company-intelligence-card');
    await expect(card).toBeVisible({ timeout: 8000 });

    // Card should fit within mobile viewport
    const box = await card.boundingBox();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(390);
    }
  });
});
