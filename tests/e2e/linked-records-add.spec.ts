import { test, expect, type Page } from '@playwright/test';

// =========================================================
// Phase H4.4 — internal-link creation via LinkedRecordsPanel.
// Asserts the +Link affordance + RecordLinkDialog end-to-end:
//   note → task happy path (with inbound mirror on the task)
//   task → note (reverse direction, different relationship verb)
//   duplicate idempotency
//   viewer guard
// Mobile coverage is automatic — the spec runs on both
// chromium and mobile-chrome projects per playwright.config.ts.
// =========================================================

async function createNote(page: Page, title: string): Promise<string> {
  await page.goto('/notes/new');
  await page.getByTestId('note-title-input').fill(title);
  await page.getByTestId('markdown-textarea').fill('Body for H4.4 link test.');
  await page.getByTestId('note-submit-button').click();
  await page.waitForURL(/\/notes\/[0-9a-f-]+$/);
  const m = page.url().match(/\/notes\/([0-9a-f-]+)$/);
  if (!m) throw new Error(`Could not parse note id from ${page.url()}`);
  // Wait for the detail to settle.
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return m[1];
}

async function createTask(page: Page, title: string): Promise<string> {
  await page.goto('/tasks/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Branch').selectOption('salt');
  await page.getByLabel('Category').selectOption('operations');
  const created = page.waitForResponse(
    (r) => r.url().includes('rpc_create_task'),
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: /create task/i }).click();
  expect((await created).status()).toBe(200);
  await page.waitForURL(/\/tasks\/[0-9a-f-]+$/);
  const m = page.url().match(/\/tasks\/([0-9a-f-]+)$/);
  if (!m) throw new Error(`Could not parse task id from ${page.url()}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return m[1];
}

test.describe('Linked records — internal link creation', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('note → task: happy path + inbound mirror', async ({ page }) => {
    const ts = Date.now();
    const noteTitle = `H4.4 link note ${ts}`;
    const taskTitle = `H4.4 link task ${ts}`;

    // Create the target first so search results contain it.
    const taskId = await createTask(page, taskTitle);
    await createNote(page, noteTitle);

    // Now on the note detail page. Panel is in empty state — the
    // empty-state CTA opens the dialog (and so does the header
    // button; either is fine, we pick the empty one to assert it
    // works on first-link).
    await expect(page.getByTestId('linked-records-empty')).toBeVisible();
    await page.getByTestId('linked-records-empty-add-button').click();
    await expect(page.getByTestId('record-link-dialog')).toBeVisible();

    // Picker defaults to Task type. Search by the task's exact title
    // so result count is deterministic.
    await page.getByTestId('record-link-search').fill(taskTitle);

    // Wait for the result row carrying the task id to appear.
    const targetRow = page.locator(
      `[data-testid="record-link-result"][data-id="${taskId}"]`,
    );
    await expect(targetRow).toBeVisible({ timeout: 10_000 });
    await targetRow.locator('button').click();

    // Default relationship = relates_to. Confirm.
    const linked = page.waitForResponse((r) =>
      r.url().includes('rpc_record_link_internal'),
    );
    await page.getByTestId('record-link-confirm').click();
    expect((await linked).status()).toBe(200);

    // Dialog closes; the new row shows up in the panel under Tasks.
    await expect(page.getByTestId('record-link-dialog')).toHaveCount(0);
    await expect(page.getByTestId('relation-group-tasks')).toBeVisible();
    await expect(
      page.getByTestId('relation-group-tasks').getByText(taskTitle),
    ).toBeVisible();

    // Inbound mirror — switching to the task should show the note as
    // a Notes group row with the inbound arrow. Validates the
    // useLinkRecordInternal hook's both-endpoint invalidation.
    await page.goto(`/tasks/${taskId}`);
    await expect(page.getByTestId('linked-records-panel')).toBeVisible();
    await expect(page.getByTestId('relation-group-notes')).toBeVisible();
    await expect(
      page.getByTestId('relation-group-notes').getByText(noteTitle),
    ).toBeVisible();
  });

  test('task → note: link with non-default relationship', async ({ page }) => {
    const ts = Date.now();
    const noteTitle = `H4.4 task→note note ${ts}`;
    const taskTitle = `H4.4 task→note task ${ts}`;

    await createNote(page, noteTitle);
    await createTask(page, taskTitle);

    // On task detail. The panel has a header button on tasks (other
    // legacy cards may render above/below; pick the panel-scoped one).
    await page.getByTestId('linked-records-add-button').click();
    await expect(page.getByTestId('record-link-dialog')).toBeVisible();

    await page.getByTestId('record-link-type').selectOption('note');
    await page.getByTestId('record-link-search').fill(noteTitle);
    const targetRow = page
      .locator('[data-testid="record-link-result"]')
      .filter({ hasText: noteTitle });
    await expect(targetRow).toBeVisible({ timeout: 10_000 });
    await targetRow.locator('button').click();

    await page.getByTestId('record-link-relationship').selectOption('blocks');

    const linked = page.waitForResponse((r) =>
      r.url().includes('rpc_record_link_internal'),
    );
    await page.getByTestId('record-link-confirm').click();
    expect((await linked).status()).toBe(200);

    await expect(page.getByTestId('record-link-dialog')).toHaveCount(0);

    // Panel renders the note row with the "Blocks" chip. The chip
    // is rendered twice in the DOM (mobile-only + desktop-only
    // responsive variants) — assert by content match rather than
    // visibility so the test passes on both viewport projects.
    const notesGroup = page.getByTestId('relation-group-notes');
    await expect(notesGroup).toBeVisible();
    await expect(notesGroup).toContainText(noteTitle);
    await expect(notesGroup).toContainText('Blocks');
  });

  test('unlink: row disappears + empty state returns', async ({ page }) => {
    const ts = Date.now();
    const noteTitle = `H4.5 unlink note ${ts}`;
    const taskTitle = `H4.5 unlink task ${ts}`;

    const taskId = await createTask(page, taskTitle);
    await createNote(page, noteTitle);

    // Link first (via the empty-state CTA).
    await page.getByTestId('linked-records-empty-add-button').click();
    await page.getByTestId('record-link-search').fill(taskTitle);
    const targetRow = page.locator(
      `[data-testid="record-link-result"][data-id="${taskId}"]`,
    );
    await expect(targetRow).toBeVisible({ timeout: 10_000 });
    await targetRow.locator('button').click();
    await page.getByTestId('record-link-confirm').click();
    await expect(page.getByTestId('record-link-dialog')).toHaveCount(0);

    const tasksGroup = page.getByTestId('relation-group-tasks');
    await expect(tasksGroup).toBeVisible();
    await expect(
      tasksGroup.locator('[data-testid="relation-row"]'),
    ).toHaveCount(1);

    // Hover the row so the trash button transitions in on desktop
    // (it's `sm:opacity-0 sm:group-hover:opacity-100`). Mobile is a
    // no-op — the button is always visible there.
    await page.getByTestId('relation-row').first().hover();

    // Diagnostic: confirm the unlink button is actually in the DOM.
    await expect(
      page.getByTestId('record-link-unlink-button'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Unlink. window.confirm() drives the native dialog; accept on
    // every prompt to be defensive (one-time listeners can get
    // consumed by stray dialogs).
    page.on('dialog', (d) => d.accept());
    const unlinkResp = page.waitForResponse((r) =>
      r.url().includes('rpc_record_link_remove'),
    );
    await page.getByTestId('record-link-unlink-button').click();
    expect((await unlinkResp).status()).toBe(200);

    // Row disappears, group disappears, empty-state returns. Cache
    // invalidation in useUnlinkRecord drives the panel re-fetch.
    await expect(page.getByTestId('relation-group-tasks')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByTestId('linked-records-empty')).toBeVisible();
  });

  test('duplicate link is idempotent: panel does not gain a second row', async ({
    page,
  }) => {
    const ts = Date.now();
    const noteTitle = `H4.4 dup note ${ts}`;
    const taskTitle = `H4.4 dup task ${ts}`;

    const taskId = await createTask(page, taskTitle);
    await createNote(page, noteTitle);

    // First link: relates_to.
    await page.getByTestId('linked-records-empty-add-button').click();
    await page.getByTestId('record-link-search').fill(taskTitle);
    const firstRow = page.locator(
      `[data-testid="record-link-result"][data-id="${taskId}"]`,
    );
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.locator('button').click();
    await page.getByTestId('record-link-confirm').click();
    await expect(page.getByTestId('record-link-dialog')).toHaveCount(0);
    await expect(page.getByTestId('relation-group-tasks')).toBeVisible();

    const firstCount = await page
      .getByTestId('relation-group-tasks')
      .locator('[data-testid="relation-row"]')
      .count();
    expect(firstCount).toBe(1);

    // Reopen, link the same (task, relates_to) — RPC returns the
    // existing row and the panel total must not double.
    await page.getByTestId('linked-records-add-button').click();
    await page.getByTestId('record-link-search').fill(taskTitle);
    const secondRow = page.locator(
      `[data-testid="record-link-result"][data-id="${taskId}"]`,
    );
    await expect(secondRow).toBeVisible({ timeout: 10_000 });

    // The "Linked" pill should show on the candidate row because the
    // target is already linked.
    await expect(secondRow.getByText('Linked', { exact: true })).toBeVisible();

    await secondRow.locator('button').click();
    await page.getByTestId('record-link-confirm').click();
    await expect(page.getByTestId('record-link-dialog')).toHaveCount(0);

    const secondCount = await page
      .getByTestId('relation-group-tasks')
      .locator('[data-testid="relation-row"]')
      .count();
    expect(secondCount).toBe(1);
  });
});

test.describe('Linked records — viewer guard', () => {
  test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

  test('viewer sees no +Link or unlink actions on a task detail', async ({
    page,
  }) => {
    // Tasks are seeded broadly on the SALT branch (the viewer's only
    // branch) by other admin specs, so a viewer-visible row is
    // reliably present. Skip if not — same defensive pattern other
    // viewer specs use.
    await page.goto('/tasks');
    await page.getByRole('tab', { name: 'Active', exact: true }).first().click();
    const firstRow = page.locator('main ul li button').first();
    if ((await firstRow.count()) === 0) test.skip(true, 'no tasks visible to viewer');
    await firstRow.click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]+$/, { timeout: 10_000 });
    await expect(page.getByTestId('linked-records-panel')).toBeVisible();
    await expect(page.getByTestId('linked-records-add-button')).toHaveCount(0);
    await expect(page.getByTestId('linked-records-empty-add-button')).toHaveCount(0);
    // Unlink trash buttons hang off each record_link row when canMutate.
    // Viewer should never see one, regardless of whether the task has
    // existing record_link rows attached (we don't depend on that).
    await expect(page.getByTestId('record-link-unlink-button')).toHaveCount(0);
  });
});
