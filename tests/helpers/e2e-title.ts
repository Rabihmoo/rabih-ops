// Canonical helper for naming Playwright-created records.
//
// Why this exists:
//   The post-test cleanup script (scripts/cleanup-test-data.mjs) catches
//   test pollution two ways — by created_by IN (e2e fixture users) and by
//   title-prefix match against a known allowlist. The user-id match is
//   the source of truth; the prefix path is defense-in-depth and also
//   gives operators a visual signal when a stray row leaks past cleanup.
//
//   New tests should call e2eTitle() to construct any user-visible name
//   they're about to write to the database (task title, follow-up title,
//   note title, document title, company name, contact full_name, etc.).
//   The "[E2E]" prefix is allowlisted in cleanup-test-data.mjs.
//
//   The trailing timestamp prevents collisions between parallel test
//   runs and makes individual rows traceable to a wall-clock moment if
//   debugging is needed.
//
// Example:
//   import { e2eTitle } from '../helpers/e2e-title';
//   const title = e2eTitle('overdue task');
//   // → "[E2E] overdue task 1779021080881"

export function e2eTitle(label: string): string {
  return `[E2E] ${label} ${Date.now()}`;
}
