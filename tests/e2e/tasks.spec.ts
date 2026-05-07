import { test, expect } from '@playwright/test';

// These tests verify route gating on the Tasks module without requiring an
// authenticated session. Real happy-path coverage (create → list → comment →
// complete) and the viewer-guard test need a Playwright auth helper that mints
// a Supabase session via the service role — that's tracked as a follow-up and
// lives outside this commit because it requires a service-role secret in CI.

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
    // arbitrary uuid-shaped path; ProtectedRoute should redirect before the
    // detail page even tries to fetch.
    await page.goto('/tasks/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.fixme('happy path: create → list → comment → complete (needs auth helper)', async () => {
  // TODO: requires a Playwright fixture that mints a Supabase session from the
  // service role key. The fixture should sign in as a manager with branch
  // access to "salt", then walk through:
  //   1. visit /tasks/new, fill TaskForm, submit
  //   2. confirm /tasks/<id> shows the new task with status=todo
  //   3. add a comment, confirm it appears
  //   4. mark done, confirm the row disappears from the default 'today' view
  //   5. confirm an audit entry exists for create+comment+complete
});

test.fixme('viewer guard: cannot create or comment (needs auth helper)', async () => {
  // TODO: sign in as a viewer; expect the "+ New task" button to be hidden or
  // the rpc to error with 42501 if the form is force-submitted; expect the
  // comment composer to not render in the detail view.
});
