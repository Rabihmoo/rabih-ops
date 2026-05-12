import { test, expect } from '@playwright/test';

// Phase H3.2 — Notes & decisions UI.

test.describe('Notes routes — unauthenticated', () => {
  test('/notes redirects to /login', async ({ page }) => {
    await page.goto('/notes');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/notes/new redirects to /login', async ({ page }) => {
    await page.goto('/notes/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/notes/:id redirects to /login', async ({ page }) => {
    await page.goto('/notes/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Notes — admin happy path', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('admin sees the notes list and can create a note', async ({ page }) => {
    const title = `Smoke note ${Date.now()}`;

    await page.goto('/notes');
    await expect(page.getByRole('heading', { name: /notes & decisions/i })).toBeVisible();
    await expect(page.getByTestId('new-note-button')).toBeVisible();

    await page.goto('/notes/new');
    await expect(page.getByRole('heading', { name: /new note/i })).toBeVisible();
    await page.getByTestId('note-title-input').fill(title);
    await page.getByTestId('markdown-textarea').fill('# Body\n\nFirst line.');

    // Admin can default to branchless work; the form keeps the empty option.
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('rpc_create_note'),
      { timeout: 10_000 },
    );
    await page.getByTestId('note-submit-button').click();
    expect((await responsePromise).status()).toBe(200);

    // Lands on detail page with the title rendered.
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // List page now shows it.
    await page.goto('/notes');
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('decision kind reveals decision-only fields', async ({ page }) => {
    await page.goto('/notes/new');
    // Decision details panel hidden by default.
    await expect(page.getByTestId('note-decision-fields')).toHaveCount(0);
    await page.getByTestId('note-kind-select').selectOption('decision');
    await expect(page.getByTestId('note-decision-fields')).toBeVisible();
    await expect(page.getByTestId('note-decided-at-input')).toBeVisible();
    await expect(page.getByTestId('note-decision-status-select')).toBeVisible();
    // Flipping back to plain note hides them again.
    await page.getByTestId('note-kind-select').selectOption('note');
    await expect(page.getByTestId('note-decision-fields')).toHaveCount(0);
  });

  test('personal visibility disables the branch picker', async ({ page }) => {
    await page.goto('/notes/new');
    await page.getByTestId('note-visibility-select').selectOption('personal');
    await expect(page.getByTestId('note-branch-select')).toBeDisabled();
  });

  test('filters: kind bucket and show-archived toggle render', async ({ page }) => {
    await page.goto('/notes');
    // Kind bucket switches to "Decision" without throwing.
    await page.getByRole('tab', { name: 'Decision', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Decision', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Show-archived toggles on.
    await page.getByTestId('note-filter-archived').check();
    await expect(page.getByTestId('note-filter-archived')).toBeChecked();
    // Clear resets everything.
    await page.getByTestId('note-filter-clear').click();
    await expect(page.getByTestId('note-filter-archived')).not.toBeChecked();
  });
});

test.describe('Notes — Linked Records panel (Phase H4.2 read-only)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('panel mounts on note detail with empty state when no relations', async ({ page }) => {
    const title = `Linked-records target ${Date.now()}`;

    // Create a note so we have a detail page to land on.
    await page.goto('/notes/new');
    await page.getByTestId('note-title-input').fill(title);
    await page.getByTestId('markdown-textarea').fill('Body for linked-records smoke.');
    await page.getByTestId('note-submit-button').click();
    await page.waitForURL(/\/notes\/[0-9a-f-]+$/);
    // Wait for the detail page to settle past its loading state.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // Panel renders, with empty-state hint until linking lands.
    const panel = page.getByTestId('linked-records-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    // Header is "Linked records" exact. The empty-state copy contains
    // "No linked records yet…" — use exact match to disambiguate.
    await expect(panel.getByText('Linked records', { exact: true })).toBeVisible();
    await expect(page.getByTestId('linked-records-empty')).toBeVisible();
  });
});

test.describe('Notes — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer sees the list but no New-note button', async ({ page }) => {
    await page.goto('/notes');
    await expect(page.getByRole('heading', { name: /notes & decisions/i })).toBeVisible();
    await expect(page.getByTestId('new-note-button')).toHaveCount(0);
  });

  test('viewer hitting /notes/new sees the not-authorised EmptyState, not a form', async ({ page }) => {
    await page.goto('/notes/new');
    // The form's submit button is absent; the EmptyState title is present.
    await expect(page.getByTestId('note-submit-button')).toHaveCount(0);
    await expect(
      page.getByText(/don't have permission to create notes/i),
    ).toBeVisible();
  });
});
