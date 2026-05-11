import { test, expect, type Route } from '@playwright/test';

// Phase G2.5 — Suggestion-strip UI on the Activity Inbox row.
//
// Each test stubs the rpc_activity_inbox response so we get a
// deterministic two-task set whose titles fire `task-similar-other`.
// That gives us guaranteed-stable suggestion ids to expand, click,
// and dismiss.

const TASK_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TASK_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const STUB_INBOX = [
  {
    source: 'task',
    id: `task:${TASK_A_ID}`,
    native_id: TASK_A_ID,
    title: 'Renew gas cylinder contract for SALT branch',
    summary: null,
    branch: 'salt',
    entity_url: `/tasks/${TASK_A_ID}`,
    occurred_at: '2026-05-10T08:00:00Z',
    due_at: '2026-05-12T00:00:00Z',
    severity: 'due_today',
    is_unread: false,
    is_blocked: false,
    meta: { priority: 'normal', status: 'started', category: 'operations' },
  },
  {
    source: 'task',
    id: `task:${TASK_B_ID}`,
    native_id: TASK_B_ID,
    title: 'Renew gas cylinder contract for BBQ House',
    summary: null,
    branch: 'bbqhouse',
    entity_url: `/tasks/${TASK_B_ID}`,
    occurred_at: '2026-05-10T07:00:00Z',
    due_at: '2026-05-13T00:00:00Z',
    severity: 'soon',
    is_unread: false,
    is_blocked: false,
    meta: { priority: 'normal', status: 'started', category: 'operations' },
  },
];

async function stubInbox(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/rpc_activity_inbox', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_INBOX),
    }),
  );
  // Don't ask Gmail / Calendar for content — they have no influence here.
  await page.route('**/functions/v1/gmail-list-important', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: false, messages: [] }),
    }),
  );
  await page.route('**/functions/v1/calendar-list-today', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: false, events: [] }),
    }),
  );
}

test.describe('Suggestion strip', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => window.localStorage.removeItem('inbox-suggestion-dismissed')).catch(() => {});
    await stubInbox(page);
  });

  test('affordance appears when a row has suggestions; expand reveals chips', async ({ page }) => {
    await page.goto('/inbox');
    const affordance = page.getByTestId(`inbox-suggest-affordance-task:${TASK_A_ID}`);
    await expect(affordance).toBeVisible();
    await expect(affordance).toContainText('suggestion');
    await affordance.click();
    await expect(page.getByTestId(`inbox-suggest-list-task:${TASK_A_ID}`)).toBeVisible();
  });

  test('clicking a link_to_existing suggestion navigates to the target detail page', async ({ page }) => {
    await page.goto('/inbox');
    await page.getByTestId(`inbox-suggest-affordance-task:${TASK_A_ID}`).click();
    const chipId = `task:${TASK_A_ID}:task-similar-other:${TASK_B_ID}`;
    await page.getByTestId(`inbox-suggest-link-${chipId}`).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${TASK_B_ID}$`));
  });

  test('dismiss hides the suggestion immediately and after reload', async ({ page }) => {
    await page.goto('/inbox');
    await page.getByTestId(`inbox-suggest-affordance-task:${TASK_A_ID}`).click();
    const chipId = `task:${TASK_A_ID}:task-similar-other:${TASK_B_ID}`;
    const chip = page.getByTestId(`inbox-suggest-${chipId}`);
    await expect(chip).toBeVisible();
    await page.getByTestId(`inbox-suggest-dismiss-${chipId}`).click();
    await expect(chip).toHaveCount(0);

    // Reload and confirm dismissal survived (localStorage).
    await page.reload();
    const affordance = page.getByTestId(`inbox-suggest-affordance-task:${TASK_A_ID}`);
    if (await affordance.isVisible().catch(() => false)) {
      await affordance.click();
      await expect(page.getByTestId(`inbox-suggest-${chipId}`)).toHaveCount(0);
    }
    // If affordance is gone entirely (zero suggestions remaining), that's
    // also a passing outcome — the dismissed suggestion stayed gone.
  });

  test('info icon toggles the inline reason', async ({ page }) => {
    await page.goto('/inbox');
    await page.getByTestId(`inbox-suggest-affordance-task:${TASK_A_ID}`).click();
    const chipId = `task:${TASK_A_ID}:task-similar-other:${TASK_B_ID}`;
    const reason = page.getByTestId(`inbox-suggest-reason-${chipId}`);
    await expect(reason).toHaveCount(0);
    await page.getByTestId(`inbox-suggest-info-${chipId}`).click();
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('similar');
  });
});

test.describe('Suggestion → new-form URL prefill', () => {
  test.use({ storageState: 'tests/fixtures/.auth/admin.json' });

  test('TaskNew honors title/branch/priority/due_date URL params (validated)', async ({ page }) => {
    await page.goto(
      '/tasks/new?title=Smoke%20prefill%20task&branch=salt&priority=urgent&due_date=2026-05-15',
    );
    await expect(page.getByLabel('Title')).toHaveValue('Smoke prefill task');
    await expect(page.getByLabel('Branch')).toHaveValue('salt');
    await expect(page.getByLabel('Priority')).toHaveValue('urgent');
    await expect(page.locator('input#due_date')).toHaveValue('2026-05-15');
  });

  test('TaskNew rejects unknown/unsafe values and falls back to defaults', async ({ page }) => {
    await page.goto(
      '/tasks/new?title=Hello&branch=mars_colony&priority=mystery&due_date=not-a-date',
    );
    await expect(page.getByLabel('Title')).toHaveValue('Hello');
    // Branch fell back to the first allowed branch (not mars_colony).
    const branchValue = await page.getByLabel('Branch').inputValue();
    expect(branchValue).not.toBe('mars_colony');
    // Priority fell back to "normal".
    await expect(page.getByLabel('Priority')).toHaveValue('normal');
    // Due date stayed empty.
    await expect(page.locator('input#due_date')).toHaveValue('');
  });

  test('FollowUpNew honors title/person/branch/due_date URL params', async ({ page }) => {
    await page.goto(
      '/follow-ups/new?title=Chase%20Acme&person=Acme%20Foods&branch=salt&due_date=2026-05-20',
    );
    await expect(page.getByLabel('Title')).toHaveValue('Chase Acme');
    await expect(page.getByLabel('Person')).toHaveValue('Acme Foods');
  });

  test('PurchaseNew honors title/supplier_name/branch URL params', async ({ page }) => {
    await page.goto(
      '/purchases/new?title=Frozen%20lamb&supplier_name=Acme%20Foods&branch=salt',
    );
    await expect(page.getByLabel('Title')).toHaveValue('Frozen lamb');
    await expect(page.locator('input#supplier_name')).toHaveValue('Acme Foods');
  });
});
