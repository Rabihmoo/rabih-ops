# ROADMAP — Rabih Ops post-Phase 4.4

What's next after the Phase 4.1 → 4.4 visual-consistency push lands on `main`.
Live status of phases tracked in `STATUS.md`; the per-phase **acceptance criteria**
below are the contract — a phase is "done" when those bullets are true on `main`
with CI green.

This document is a plan, not a license to ship. See **Project rules** below.

---

## Project rules

These bind every chunk of work below. They are non-negotiable unless explicitly
relaxed by the operator (Rabih) in a written instruction.

1. **No implementation while drafting or editing this roadmap.** Code changes
   happen in their own phase + chunk + commit, never as a side-effect of
   roadmap edits.
2. **Do not replace working modules.** Modules already shipped (Tasks,
   Follow-ups, Inspections, Purchases, Documents, Fixed Tasks, Directory,
   Activity Inbox, Calendar, Gmail, Telegram) are stable surfaces. Extend
   them; do not rewrite them under the banner of a roadmap phase.
3. **Before each large phase, produce a design-only plan and wait for
   approval.** The plan covers schema deltas, RPCs, files touched, test
   surface, and chunk breakdown. No code lands before the operator says go.
4. **One phase / one chunk at a time.** Never bundle two phases into a single
   PR. Within a phase, ship the chunks in declared order.
5. **Push and wait for CI green before starting the next chunk.** No stacking
   work on top of a red `main`.
6. **Forbidden without explicit approval:**
   - AI features of any kind (parsing, ranking, generation, embeddings).
   - Gmail write scopes (compose, send, modify, delete, label).
   - Full HR module (payroll, leave, performance reviews, contracts).
   - Full finance module (GL, invoicing, AR/AP, banking).
   - Native mobile app (React Native, iOS, Android).
   - Major database rewrites (schema replacement, RPC renumbering, RLS
     model changes, multi-tenant carve-out).
7. The **PLAN.md non-negotiables (Part 2)** stay in force — every mutation via
   SECURITY DEFINER RPC, RLS on every table, Playwright + Vitest required,
   no SQL in prod without 24h in staging, mobile responsive from commit #1.
8. **No new dependencies** in `package.json` without justification in the
   chunk plan that mentions them.

---

## Phase index

| #    | Phase                                                      | Status      |
|------|------------------------------------------------------------|-------------|
| 0    | Finish Current Work                                        | next        |
| 0.5  | Gmail Today View                                           | queued      |
| 1    | Business Memory — Notes UI                                 | queued      |
| 2  | Relationship Graph — `record_links` notes + Universal Panel  | queued      |
| 3  | Find Anything Fast — global search + Cmd-K                   | queued      |
| 4  | Full Visual Consistency — maintenance / audit                | continuous  |
| 5  | Supplier / Company Intelligence                              | queued      |
| 6  | Smart Suggestions v2                                         | queued      |
| 7  | Reminder / Notification Center                               | queued      |
| 8  | Daily Command Center Upgrade                                 | queued      |
| 9  | Reports                                                      | queued      |
| 10 | Optional Future Power                                        | gated       |

---

## Phase 0 — Finish Current Work

### Goal
Land any leftovers from the Phase 4.1 → 4.4 visual-consistency arc and the
infrastructure debt it exposed, so subsequent feature phases start from a
clean baseline.

### Why it matters
Phase 4.4 surfaced two real issues that we deferred so the polish commits
could ship cleanly: the `rpc_list_tasks` LIMIT-before-ORDER-BY bug (now
fixed) and the absence of a `purchase-detail` screenshot capture. Starting
Phase 1 on a baseline with residual TODOs makes every subsequent phase
harder to reason about.

### Dependencies
- None. This is the unblocker for everything that follows.

### Exact scope
- Re-run `scripts/design-preview-screenshot.mts` once staging has at least
  one row in every module (notably purchases) so the screenshot library is
  complete.
- Visual audit pass on surfaces the 4.x arc did **not** explicitly cover:
  `/auth/callback`, generic error/empty states, settings sub-cards, the
  recurring-template form.
- Resolve the 7 pre-existing `react-refresh/only-export-components` ESLint
  warnings or document them as intentional in a comment.
- One-shot staging hygiene: archive cleanup of the accumulated test
  templates (`Phase Z fixed …`) and any test-fixture rows orphaned by old
  CI runs.
- Confirm working tree is clean and `STATUS.md` is up-to-date with the
  shipped Phase 4 set.

### What not to do
- No new feature surfaces.
- No new RPCs or schema changes.
- No design-token changes.
- Do not refactor for "consistency" — Phase 4 already locked the patterns.
- Do not delete the screenshots/ directory or rename existing slugs.

### Likely files / tables
- `scripts/design-preview-screenshot.mts`
- `src/components/ui/button.tsx`, `src/components/ui/toaster.tsx`,
  `src/components/tasks/badges.tsx`, `src/components/inbox/ActivityFilterChips.tsx`
  (for the `react-refresh` warnings, if we choose to split them).
- `STATUS.md`
- No tables touched.

### Tests required
- All existing Playwright + Vitest stay green (146 unit, 51-ish e2e).
- No new tests strictly required, but if a lint-split moves a constant
  out of a component file, run typecheck + Vitest.

### Acceptance criteria
- `npm run lint` reports 0 warnings (or each remaining warning has an
  inline justification).
- `screenshots/` has a fresh capture per page for both themes, both
  viewports, including `purchase-detail-{dark,light}.png`.
- `STATUS.md` reflects "Phase 4.4 complete" and lists the rpc fix.
- CI green on the head of `main` for the commit that closes this phase.

### Chunk breakdown
- **0.1** Re-screenshot + add purchase-detail capture.
- **0.2** Visual audit gap fixes (settings/auth-callback/error states).
- **0.3** Lint warning split or annotate.
- **0.4** Staging hygiene + STATUS.md refresh.

---

## Phase 0.5 — Gmail Today View

### Goal
Show today's operational email in the Dashboard and the Activity Inbox
while keeping the Gmail integration strictly read-only.

### Why it matters
The V1 Gmail surface only renders `is:important is:unread`. That filter
relies on Gmail's automatic Importance signal, which routinely misses
supplier replies, partner mail, and time-sensitive operational mail
arriving today. Operators lose the "did the supplier reply yet today?"
question to that gap. This phase closes the gap without expanding
scope — `gmail.readonly` stays the only scope, no writes, no full
inbox clone.

### Dependencies
- Phase 0 complete (clean baseline).
- Existing Gmail OAuth + `gmail.readonly` already deployed in staging.
- `PROJECT_TZ` shared constant introduced in chunk G.1 (Africa/Maputo).

### Exact scope
- New shared constant `PROJECT_TZ = 'Africa/Maputo'` in
  `src/lib/timezone.ts`, plus helper `localMidnightUnix(date, tz)` that
  returns the Unix timestamp (seconds) of the local midnight starting
  the supplied date in the supplied IANA zone. **Why Maputo, not
  Johannesburg:** the project already anchors at Africa/Maputo
  (`telegram-tick` 08:00 fan-out, audit-log timestamps).
  Johannesburg has the same offset today but is a different IANA zone;
  consistency matters the day either zone adopts DST or we extend to a
  second region.
- New Edge Function `gmail-list-today` (sibling to
  `gmail-list-important`, not a replacement). Returns
  `{ important: GmailMessage[], today: GmailMessage[] }`.
  - `important` query: `is:important is:unread` (unchanged from the
    existing function — important+unread can be older than today).
  - `today` query:
    `after:<unix-local-midnight> -category:promotions -category:social -category:forums -label:muted`.
  - Both arrays capped at 50 messages.
  - Thread collapse: one message per `threadId`, latest by
    `internalDate`.
  - Metadata-only fetch (no message body) — same payload shape as the
    existing function.
- Client lib + `useGmailToday` hook returning the composed
  `{ important, today, dedupedToday }` shape (dedupedToday omits rows
  already in important; the Inbox renders both sections from the
  un-deduped sets, the Dashboard cards use the deduped sets to avoid
  visible repetition between the two cards).
- Both Gmail queries opt out of the localStorage persister via
  `meta: { persist: false }`. **This also applies retroactively to the
  existing important-emails query** so email metadata stops sitting in
  `localStorage` once this phase ships.
- React Query options for both queries: `staleTime: 2 * 60_000`,
  `gcTime: 30 * 60_000`, `refetchOnWindowFocus: true`. Manual refresh
  button on each card header calls
  `queryClient.invalidateQueries({ queryKey: ['gmail', ...] })`.
- Dashboard: new "From today" card directly under the existing
  Important Emails card. Same visual frame. Top 5 most recent rows,
  count line ("12 emails since 00:00"), footer link to
  `/inbox?source=gmail&period=today`. Empty state via the shared
  `EmptyState` component with `tone="muted"`.
- Inbox (`/inbox`): new `Today's emails` source-filter chip alongside
  existing source chips. When selected, the list renders two section
  headers — **Important & unread** then **From today** — using the
  un-deduped sets so a message that's both still appears in both
  sections.
- Row labelling derives from each message's `labelIds` (`IMPORTANT`,
  `UNREAD`) → existing `StatusChip` tones (`danger` / `warning` /
  `muted`). No new chip variants.
- Tail label when the 50-message cap hits ("Showing 50 of N — open
  Gmail for the rest").

### What not to do
- **No Gmail write scopes.** No compose, send, modify, archive,
  mark-read, label add/remove, trash, delete. Scope stays
  `gmail.readonly` and `userinfo.email` only.
- No inbox clone — no pagination beyond the 50/day cap, no infinite
  scroll, no load-more button.
- No per-sender mute UI inside RabihOS — operators mute threads or
  senders in Gmail itself. (A `user_inbox_settings` per-sender mute
  list is Phase 6's territory.)
- No background polling. Window-focus refetch + manual button are the
  only refresh paths.
- No date range picker beyond "today" — yesterday/this-week views are
  not in scope.
- Do not change the existing `gmail-list-important` function's
  contract or remove it. New function lands alongside.
- Do not bundle this phase with Phase 6 (Smart Suggestions v2). Cross-
  signal rules over email arrive in Phase 6; this phase is a read
  surface.

### Likely files / tables
- New: `src/lib/timezone.ts`, `src/lib/timezone.test.ts`,
  `src/lib/gmail-query.ts`, `src/lib/gmail-query.test.ts`,
  `src/lib/gmail-compose.ts`, `src/lib/gmail-compose.test.ts`,
  `src/hooks/useGmailToday.ts`.
- New: `supabase/functions/gmail-list-today/index.ts` (reuses
  `_shared/gmail` access-token refresh + helper).
- Updated: `src/pages/Dashboard.tsx` (compose new card),
  `src/components/dashboard/GmailTodayCard.tsx` (new),
  `src/components/inbox/ActivityFilterChips.tsx` (new chip),
  `src/pages/Inbox.tsx` (section renderer when the chip is active),
  `src/main.tsx` (persister filter honors `meta.persist=false`).
- No tables, no migrations. RPC surface unchanged.

### Tests required
- Vitest:
  - `timezone.test.ts` — `localMidnightUnix` across UTC times of day,
    a DST-observing zone (e.g. `America/New_York`) to prove the helper
    generalizes, cross-year boundary (Dec 31 23:30 UTC → Jan 1 local
    midnight unix).
  - `gmail-query.test.ts` — query builder produces exact expected `q`
    strings for both buckets including correct escaping of the unix
    timestamp.
  - `gmail-compose.test.ts` — dedupe + thread-collapse logic on mixed
    inputs (overlap between important and today, multiple messages on
    one thread, all-empty, only-important, only-today).
- Playwright (extend `tests/e2e/gmail.spec.ts`):
  - Admin happy path: connect Gmail → dashboard shows both cards
    within 5 s → Inbox `Today's emails` filter renders two section
    headers.
  - Dedupe behavior: a message present in both Important and Today
    appears in both Inbox sections (intentional), but only once across
    the dashboard cards.
  - Viewer guard: viewer reads own connected Gmail, cannot see admin's.
  - Empty state: a fixture that matches nothing renders the muted
    `EmptyState`, never a spinner or error message.
- Manual smoke (not CI, operator-run after staging deploy):
  - Cross-midnight test — send a self-test email near 00:00 Africa/Maputo
    local time, verify it appears in Today after midnight and not
    before.
  - Promotions exclusion — send a promotional-style email, verify it is
    absent from Today.
  - Muted-thread exclusion — mute a thread in Gmail, verify subsequent
    replies stay out of Today.

### Acceptance criteria
- Dashboard renders both `IMPORTANT` and `TODAY` cards on a connected
  admin account, populated within 5 s of route load on a warm cache.
- Inbox `Today's emails` chip is mutually exclusive with the other
  source chips and renders two section headers in the order
  `Important & unread` → `From today`.
- A message that satisfies both queries appears in both sections in
  the Inbox view, but only once across the two Dashboard cards.
- Promotions / social / forums / muted threads never appear in Today,
  regardless of importance status.
- Email metadata (subject, from, snippet, dates) is **not** persisted
  to `localStorage` — verified by inspecting the
  `rabih-ops-query-cache` key after the cards load and seeing no
  `gmail` entries.
- Gmail OAuth scopes are unchanged at the Google end (still
  `gmail.readonly` + `userinfo.email` + `openid`). No new consent
  prompt for existing users.
- The 50-message tail label appears when and only when the cap is
  reached.
- All new Vitest tests pass; Playwright extensions green; existing
  `gmail.spec.ts` cases continue to pass unchanged.
- CI green at the head of the commit that closes the phase.

### Chunk breakdown
- **G.1** `src/lib/timezone.ts` exporting `PROJECT_TZ = 'Africa/Maputo'`
  and `localMidnightUnix(date, tz)` helper. Vitest. Touches nothing
  else. Push.
- **G.2** Edge Function `gmail-list-today` deployed to staging. No
  client wiring. Manual smoke against the operator's JWT to verify
  payload shape and query correctness. Push (deploy is via
  `supabase functions deploy`, not in the repo build).
- **G.3** Client lib (`gmail-query.ts`, `gmail-compose.ts`) + hook
  `useGmailToday` + persister opt-out for **both** Gmail queries
  (`meta.persist=false`) + Vitest for compose/dedupe. No UI wiring
  yet. Push.
- **G.4** Dashboard "From today" card. Screenshots (dark/light ×
  desktop/mobile) for `dashboard-*` updated. Push.
- **G.5** Inbox `Today's emails` chip + section headers. Playwright
  extension. Screenshots for the populated inbox view. Push.

### Operator pre-flight (one-time, before G.2 deploy)
- Confirm the operator's Gmail account is currently connected; if not,
  reconnect via Settings before chunk G.2 is smoke-tested.
- No Google Cloud Console change required — scope set is unchanged.
- No new Edge Function secret required — `gmail-list-today` reuses the
  secrets that `gmail-list-important` already consumes.

---

## Phase 1 — Business Memory (Notes UI)

### Goal
Give Rabih a first-class place to write durable notes (meeting summaries,
decisions, observations) that survive WhatsApp / Telegram chatter.

### Why it matters
The `notes` table already shipped in migration
`20260528_notes_and_modules.sql` with full visibility rules (personal vs
work, branch scope, decision kind). Today there is no UI to read or write
it — the table is dormant. Phase 1 is the smallest delta that turns dormant
schema into a usable module.

### Dependencies
- Phase 0 complete.
- `notes` table + its visibility rule already in staging (verified).

### Exact scope
- 4 SECURITY DEFINER RPCs:
  `rpc_create_note`, `rpc_update_note`, `rpc_delete_note`, `rpc_list_notes`.
- `/notes` list page: bucket tabs (All / Decisions / Personal / Mine),
  filter row (branch, visibility, kind), same shape as Documents list.
- `/notes/new` + `/notes/:id` detail/edit page using `MarkdownEditor`.
- Visibility selector in form: `personal` ↔ `work`, with branch picker for
  work notes.
- Sidebar nav entry under Knowledge.
- Header badge pattern: kind chip (`NOTE` / `DECISION`), scope chip,
  branch chip.

### What not to do
- No AI summaries, no voice transcription, no smart tagging.
- No attachments in V1 of this phase — text-only.
- No version history (deferred to V2; the table doesn't track versions
  yet and adding it doubles scope).
- Do not extend the visibility model. The existing personal/work + branch
  rules are correct.

### Likely files / tables
- New: `src/pages/Notes.tsx`, `src/pages/NoteDetail.tsx`,
  `src/components/notes/NoteListItem.tsx`,
  `src/components/notes/NoteForm.tsx`, `src/hooks/useNotes.ts`,
  `src/lib/notes.ts`.
- New: `supabase/migrations/<date>_notes_rpcs.sql`.
- Updated: `src/components/layout/Sidebar.tsx`, `src/App.tsx` (routes).
- Tables: `notes` (no DDL change in this phase).

### Tests required
- Vitest: none (UI-only phase, no pure logic worth isolating yet).
- Playwright: `tests/e2e/notes.spec.ts` — unauthenticated redirect,
  admin happy path (create → edit → delete a decision), viewer can read
  own personal + branch work notes only, viewer cannot create work-note
  for a branch they don't have access to.

### Acceptance criteria
- Admin can create, edit, and delete both note kinds.
- Manager/viewer see notes per the visibility table from PLAN.md Part 9.
- A note flagged `kind='decision'` renders with a distinct chip in the
  list, both themes.
- Screenshot captures added for `/notes` and `/notes/:id`.
- CI green.

### Chunk breakdown
- **1.1** Migration with 4 RPCs + lib + hook.
- **1.2** `/notes` list page + nav.
- **1.3** `/notes/new` + `/notes/:id` form/editor.
- **1.4** Tests + screenshot captures.

---

## Phase 2 — Relationship Graph

### Goal
Make any two entities linkable, and surface those links uniformly on every
detail page via a single `LinkedRecordsPanel`.

### Why it matters
Operators think in chains: "this PO → this supplier → this email →
this follow-up". The `record_links` table already exists (migrations
`20260525_record_links.sql` + `20260527_record_links_widen.sql`), and a few
detail pages embed bespoke link UIs, but there is no unified affordance.
Until linking is one component everywhere, the graph is invisible.

### Dependencies
- Phase 1 complete (notes need to be a linkable entity type).

### Exact scope
- Verify `record_links` already supports `entity_type='note'`. If not, add
  a small additive migration.
- Two RPCs (likely already present from prior phases — verify):
  `rpc_link_records`, `rpc_unlink_records`. If missing, add.
- `LinkedRecordsPanel` shared component: collapsible card, lists linked
  entities grouped by type, with "Link to…" button that opens a search
  modal (reuses global-search RPC from Phase 3 — for now, a typed
  type-ahead per entity is acceptable until Phase 3 lands).
- Wire the panel into every existing detail page: TaskDetail,
  FollowUpDetail, InspectionDetail, PurchaseDetail, DocumentDetail,
  FixedTaskDetail, CompanyDetail, ContactDetail, NoteDetail.
- Unlink permission: linker, branch admin, or admin/CEO.

### What not to do
- No graph visualization, no "shortest path", no transitive traversal
  views.
- No AI relationship inference.
- Do not change `record_links` schema beyond confirming entity-type
  coverage.
- Do not bulk-link / batch-link — one link at a time, UI-driven.

### Likely files / tables
- New: `src/components/shared/LinkedRecordsPanel.tsx`,
  `src/components/shared/LinkRecordModal.tsx`, `src/lib/record-links.ts`
  (extend), `src/hooks/useRecordLinks.ts`.
- Updated: 9 detail-page components.
- Migration only if `record_links` needs note coverage.

### Tests required
- Vitest: link/unlink permission logic if extracted into pure helpers.
- Playwright: `tests/e2e/record-links.spec.ts` — admin links a task to a
  company and a note, sees both in the panel; viewer cannot unlink
  someone else's link; unlinking removes the row.

### Acceptance criteria
- Every detail page has the panel in a consistent position.
- A link created on side A is visible on side B without a refresh.
- Unlink is hidden from users who didn't create the link (unless they're
  admin/CEO).
- Screenshot captures updated for all 9 detail pages with at least one
  linked record present.
- CI green.

### Chunk breakdown
- **2.1** Migration (if needed) + RPC verification.
- **2.2** Lib + hook + permission helpers.
- **2.3** `LinkedRecordsPanel` + `LinkRecordModal` components.
- **2.4** Wire into 9 detail pages (split into 2 sub-chunks if a single PR
  feels too wide).
- **2.5** Tests + screenshots.

---

## Phase 3 — Find Anything Fast

### Goal
Single keyboard-driven palette (`Cmd-K` / `Ctrl-K`) that searches across
every linkable entity and lands on it in one keystroke.

### Why it matters
Once Phases 1 + 2 ship there are 11 entity types and growing. Click-based
navigation breaks down past ~50 of each. Fast search is the difference
between "this app is fast" and "Rabih reopens Notion".

### Dependencies
- Phase 2 (so `LinkRecordModal` can reuse the same search RPC).

### Exact scope
- One RPC `rpc_global_search(p_query text, p_limit int)` that does
  case-insensitive `ilike` across title/body of: tasks, follow-ups, notes,
  documents, companies, contacts, purchases, inspections, fixed-tasks.
  Returns a typed union with `entity_type`, `id`, `title`, `branch`,
  `updated_at`.
- Trigram index (`pg_trgm`) on title columns of the main tables to keep
  median latency under 200ms once the DB grows.
- `CommandPalette` component: opens on `Cmd-K` / `Ctrl-K` from any page,
  type-ahead with 150ms debounce, keyboard nav (arrows + enter + esc),
  recent items stored in `localStorage`.
- Existing topbar search input becomes a thin wrapper that opens the
  palette.

### What not to do
- No fuzzy scoring beyond what `pg_trgm` gives for free.
- No embeddings, no AI re-ranking.
- No search-syntax operators (`status:overdue`, `branch:salt`, etc.) —
  defer to V2.
- No "saved searches" feature.

### Likely files / tables
- New: `src/components/shared/CommandPalette.tsx`, `src/lib/search.ts`,
  `src/hooks/useGlobalSearch.ts`.
- New: `supabase/migrations/<date>_global_search_rpc.sql` (RPC + trigram
  indexes, all idempotent).
- Updated: `src/components/layout/TopBar.tsx`, `src/App.tsx` (keyboard
  shortcut listener).

### Tests required
- Vitest: result-shaping/sorting logic if extracted (likely small).
- Playwright: `tests/e2e/search.spec.ts` — open via `Cmd-K`, type partial
  query, arrow-down + enter navigates to detail, viewer sees only
  branch-visible rows.

### Acceptance criteria
- Median search response under 300ms in staging with current data.
- Palette opens from any authenticated route via shortcut and via topbar
  click.
- Entity type and branch are visible in each result row.
- CI green.

### Chunk breakdown
- **3.1** Migration: RPC + indexes.
- **3.2** `src/lib/search.ts` + hook.
- **3.3** `CommandPalette` UI + keyboard wiring.
- **3.4** Topbar + recents.
- **3.5** Tests + screenshot.

---

## Phase 4 — Full Visual Consistency (continuous)

### Goal
Keep the visual system locked. Phase 4.1 → 4.4 established the patterns
(eyebrow, status chips, badges, list-item bar accent, empty state, filter
row). This is the audit-and-protect phase that runs alongside every other
phase.

### Why it matters
Visual drift compounds. A 10th surface introduced without an audit will
not match the first 9, and retrofitting is more expensive than getting
it right per-chunk.

### Dependencies
- None — runs continuously, gated on each feature phase.

### Exact scope
- Every new surface introduced by Phases 1, 2, 3, 5, 7, 8, 9 must:
  - Use `PageHeader` with eyebrow + title + stats.
  - Use the shared `StatusChip`, `BranchBadge`, `PriorityBadge` family —
    no hand-rolled pills.
  - Use the shared `EmptyState` with `tone="muted"`.
  - Match list-item shape (left bar accent, title/eyebrow/meta row).
  - Be added to `scripts/design-preview-screenshot.mts` so it gets
    captured in both themes and both viewports.
- Quarterly: run the full screenshot script and diff against the previous
  set; investigate any drift.
- No design-token additions without a justification comment in
  `src/index.css`.

### What not to do
- Do not rebuild the design system.
- Do not swap shadcn for another UI lib.
- Do not introduce a screenshot-diffing CI job in this phase (it's a
  Phase 10 candidate; we want intentional human review first).

### Likely files / tables
- `src/components/shared/*` (audit only).
- `scripts/design-preview-screenshot.mts` (extend per new route).

### Tests required
- No phase-level tests. Per-feature phases ship their own screenshots.

### Acceptance criteria
- Every new surface added in Phases 1–9 has a screenshot capture
  alongside its PR.
- Any drift caught in a phase review is fixed before the phase merges.

### Chunk breakdown
- Continuous; no fixed chunks. Audits happen at the close of each
  feature phase as part of that phase's screenshot step.

---

## Phase 5 — Supplier / Company Intelligence

### Goal
Every interaction with a supplier rolls up to that supplier's profile so
Rabih can answer "should I keep using this supplier?" in 30 seconds.

### Why it matters
`companies` + `contacts` already exist with detail pages, but they're
read-only address books. The valuable signal — what we bought, what
arrived late, what got flagged — lives in tasks, purchases, follow-ups,
inspections. The link graph from Phase 2 makes the rollup possible.

### Dependencies
- Phase 2 (linked records).
- Phase 3 (search, used inside the "Add purchase from this supplier"
  flow).

### Exact scope
- Rolling-stats RPC `rpc_get_company_intel(p_company_id)` returning:
  `total_purchases`, `total_spend_by_status`, `avg_lead_time_days`,
  `last_contact_at`, `latest_inspection_result`, `open_follow_ups`,
  `recent_notes_count`.
- CompanyDetail page extension: a stats card above the existing linked-
  records panel; same for ContactDetail with person-scoped stats.
- "Add purchase from this supplier" CTA that prefills the purchase form
  with the company.
- Optional, lightweight tagging: a `company_tags` table (id, label,
  color) + a join table. UI for assigning tags on the company detail.
  Tags are operator-owned (admin only).

### What not to do
- No payment-terms tracking, no contract storage, no automatic
  invoicing.
- No scoring/ranking algorithm.
- No AI-driven supplier comparisons.
- No bulk import of supplier data from external systems.

### Likely files / tables
- New: `supabase/migrations/<date>_company_intel.sql` — RPC, plus tags
  tables if we go ahead with tagging.
- New: `src/components/companies/CompanyStatsCard.tsx`,
  `src/components/companies/CompanyTags.tsx`.
- Updated: `src/pages/CompanyDetail.tsx`, `src/pages/ContactDetail.tsx`,
  `src/lib/companies.ts`, `src/hooks/useCompanies.ts`.

### Tests required
- Vitest: any pure stat-aggregation helpers (lead-time math, currency
  formatting).
- Playwright: extend `tests/e2e/companies.spec.ts` — stats card renders
  with seeded purchase data; tag add/remove persists; CTA prefills
  purchase form.

### Acceptance criteria
- Opening a supplier shows last 5 purchases, average lead time, and all
  linked notes/follow-ups without an extra click.
- Tags (if shipped) are visible on the company list and detail in both
  themes.
- CI green.

### Chunk breakdown
- **5.1** Migration: intel RPC + (optionally) tags tables.
- **5.2** `lib/companies.ts` + hook extensions.
- **5.3** `CompanyStatsCard` + wire into CompanyDetail.
- **5.4** ContactDetail rollup.
- **5.5** Tag UI (conditional on operator approval; otherwise drop).
- **5.6** Tests + screenshots.

---

## Phase 6 — Smart Suggestions v2

### Goal
Activity Inbox stops being entity-local and grows cross-entity rules.

### Why it matters
v1 suggestion rules under `src/lib/inbox-suggestions/rules/` are each
scoped to one source (gmail, calendar, telegram, document, etc.). The
operator's actual pain — "supplier hasn't replied in a week", "this
recurring template hasn't spawned in 2 days" — needs rules that read from
multiple tables.

### Dependencies
- Phase 2 (links) — some rules need link traversal.
- Phase 5 (company intel) — supplier-silence rule reads from there.

### Exact scope
- 4–6 new deterministic rules:
  - `stale-follow-up` — open follow-up + last activity > N days.
  - `recurring-template-missing-instance` — template should have spawned
    today but didn't.
  - `supplier-silence` — outbound purchase or follow-up with no inbound
    reply in N days.
  - `draft-doc-aging` — document in `DRAFT` for > N days.
  - `overdue-finding` — inspection finding open past its due date.
  - One or two more, scoped by Rabih at phase-plan time.
- Each rule lives in `src/lib/inbox-suggestions/rules/<rule>.ts` with the
  existing rule interface (input rows + dismissal cache → suggestions).
- Per-user thresholds via a small `user_inbox_settings` row.

### What not to do
- No AI rules. Determinism only.
- No embedding-based similarity beyond what already exists in
  `similarity.ts`.
- Do not refactor the existing rule plumbing or the compose pipeline.
- Do not add UI for editing thresholds in this phase — defer until at
  least one operator asks for it.

### Likely files / tables
- New: rule files under `src/lib/inbox-suggestions/rules/`.
- New: matching test files (`*.test.ts`) per rule, Vitest.
- New: `user_inbox_settings` table + RPC (migration).
- Updated: `src/lib/inbox-suggestions/compose.ts` (register new rules).

### Tests required
- Vitest per rule, following the existing `gmail.test.ts` style — every
  rule ships with happy path + at least two edge cases.
- Playwright: extend `tests/e2e/inbox-suggestions.spec.ts` with one e2e
  per new rule confirming the suggestion appears in the inbox.

### Acceptance criteria
- All Vitest test files for the new rules pass; Vitest total tests rise
  proportionally (currently 146 — expect +30 to +40).
- Each rule surfaces in the staging inbox with seeded data.
- Dismiss + similarity behavior unchanged for v1 rules.
- CI green.

### Chunk breakdown
- One chunk per rule (6.1, 6.2, …). Each chunk: rule + unit tests + one
  e2e test + register in compose.

---

## Phase 7 — Reminder / Notification Center

### Goal
A single place in the app where pending reminders, snoozed items, and
digest entries pool.

### Why it matters
The reminder engine (Phase B, migration `20260516_reminder_engine.sql`)
fires telegram + email reminders, but in-app the only surface is the
Inbox badge count. Operators want a chronological "what was I supposed to
see today" log.

### Dependencies
- Phase 0 baseline.
- Optional: Phase 6 (so cross-entity suggestions also surface as
  in-app reminders).

### Exact scope
- Decide whether to add an `in_app` channel to the existing reminder
  rows or introduce a separate `notifications` table. Probably the
  former (smaller delta).
- One read RPC `rpc_list_notifications(p_limit int, p_unread_only bool)`.
- One write RPC `rpc_mark_notification_read(p_id uuid)`.
- `/notifications` page: chronological list grouped by day, per-channel
  filter (in-app / telegram / email), entity-type filter, mute control.
- Topbar badge with unread count.
- "Daily digest preview" card on the dashboard (Phase 8 will integrate
  this further).

### What not to do
- No browser push notifications.
- No SMS / voice channels.
- No per-user quiet hours UI in this phase (the engine can grow that
  later).
- Do not replace the existing reminder engine; this phase is a read
  surface plus minimal write hooks.

### Likely files / tables
- Migration: add `channel='in_app'` enum value (or value to text column),
  plus the two new RPCs.
- New: `src/pages/Notifications.tsx`, `src/components/notifications/*`,
  `src/lib/notifications.ts`, `src/hooks/useNotifications.ts`.
- Updated: `src/components/layout/TopBar.tsx` (badge).

### Tests required
- Vitest: any grouping/dedup helpers.
- Playwright: `tests/e2e/notifications.spec.ts` — admin sees own
  notifications, marks one read (badge count drops), mute a source
  (subsequent fires don't appear).

### Acceptance criteria
- The topbar badge reflects the unread count and clicking it lands on
  `/notifications`.
- Filter + mute persist across reloads (server-side state, not
  localStorage).
- CI green.

### Chunk breakdown
- **7.1** Migration + RPCs.
- **7.2** Lib + hook.
- **7.3** `/notifications` page UI.
- **7.4** Topbar badge + mute UX.
- **7.5** Tests + screenshots.

---

## Phase 8 — Daily Command Center Upgrade

### Goal
Turn the dashboard from an informational page into the launchpad for a
typical morning — every action one click away.

### Why it matters
The current dashboard ships rollup cards but doesn't capture intent.
Rabih's morning is: triage overdue, glance at today's calendar + emails,
queue up new follow-ups. The dashboard should let him close those four
actions without ever opening the sidebar.

### Dependencies
- Phase 3 (search, used by quick-capture autocomplete).
- Phase 7 (notification rollup).

### Exact scope
- "Today" rollups: overdue tasks, overdue follow-ups, due-soon, plus
  reminder/notification preview.
- Quick-capture row: one-input boxes for "new task", "new note",
  "new follow-up" with optional branch selector.
- Existing sections kept: calendar today, important emails.
- Personalization: each section is pin/unpin-able; preferences stored
  per user in a new `user_dashboard_prefs` column or row.

### What not to do
- No drag-and-drop layout.
- No widget marketplace / custom widgets.
- No theme variants beyond dark/light (already shipped).
- No reorderable sections (pinning only).

### Likely files / tables
- New: `src/components/dashboard/QuickCapture*.tsx` (3 components),
  `src/components/dashboard/PinControl.tsx`, `src/lib/dashboard-prefs.ts`.
- Updated: `src/pages/Dashboard.tsx` (rebuild composition, do not
  rewrite the data hooks).
- Migration: small additive — `user_dashboard_prefs` table or column.

### Tests required
- Vitest: pref read/write helpers.
- Playwright: extend `tests/e2e/dashboard` (or create) — quick-capture
  creates a task with one keystroke flow; pin/unpin persists across
  reload.

### Acceptance criteria
- Rabih can complete a "typical morning" — review 3 overdue items,
  create 2 follow-ups, snooze 1 reminder — without navigating away from
  `/`.
- Pins persist across browsers (server-side prefs).
- CI green.

### Chunk breakdown
- **8.1** Migration: prefs.
- **8.2** Quick-capture components.
- **8.3** Pin/unpin UX.
- **8.4** Today rollups (extend existing).
- **8.5** Tests + screenshots.

---

## Phase 9 — Reports

### Goal
Weekly + monthly rollups Rabih can read in 30 seconds and (optionally)
export to CSV for stakeholders.

### Why it matters
Decisions need trends, not snapshots. The data exists — task velocity,
supplier spend, inspection pass rate, follow-up close rate. Reports
surface it.

### Dependencies
- Most data phases done so there's something worth reporting on
  (realistically: after Phase 7).

### Exact scope
- `/reports` index page with a card per report.
- Four reports for V1:
  - **Task velocity** — created vs. finished per week per branch.
  - **Supplier spend** — total per company, optionally filtered by
    period.
  - **Inspection pass rate** — pass / issues / fail per week per branch.
  - **Follow-up close rate** — opened vs. closed per week per branch.
- One RPC per report, `stable` + `security definer`.
- Branch + date-range filters in the URL.
- CSV export per report.

### What not to do
- No PDF export, no scheduled email reports.
- No custom report builder UI.
- No chart-library upgrade — use the lib already in `package.json`
  (likely none yet; tiny inline SVG bars are acceptable).
- No real-time refresh — manual reload.

### Likely files / tables
- New: `src/pages/Reports.tsx`, `src/pages/Report<name>.tsx` (4),
  `src/components/reports/*`, `src/lib/reports.ts`.
- New: `supabase/migrations/<date>_reports_rpcs.sql`.
- Tables: none new; aggregates only.

### Tests required
- Vitest: CSV serialization helper.
- Playwright: `tests/e2e/reports.spec.ts` — each report renders with
  seeded data, branch filter narrows results, CSV download fires.

### Acceptance criteria
- All four reports render in under 500ms with current staging data.
- CSV exports open in Excel without quoting issues.
- Filters persist in URL params (shareable).
- CI green.

### Chunk breakdown
- **9.1** Migration: 4 RPCs.
- **9.2** Reports index + lib.
- **9.3** Each report's page (one chunk per).
- **9.4** CSV export.
- **9.5** Tests + screenshots.

---

## Phase 10 — Optional Future Power

Items deliberately out of V1. They appear here so we don't lose them, not
because they're approved. **Each one requires a separate green-light from
Rabih before any plan is drafted.**

- AI parsing for WhatsApp commands.
- AI / embedding-based suggestion ranking in the Activity Inbox.
- Native mobile app (React Native / iOS / Android).
- Full HR module (payroll, leave, performance reviews, contracts).
- Full finance module (GL, invoicing, AR/AP, bank reconciliation).
- Multi-tenant carve-out (other businesses on the same install).
- Webhook receivers (Zapier, n8n).
- Custom roles + per-permission grants beyond the four-role model.
- Audit-log UI for non-admins.
- Visual-regression CI (screenshot-diffing job).
- Gmail write scopes — compose, send, modify, label.

---

## How to use this document

When the operator says "let's start Phase X":

1. Re-read the Phase X section.
2. Produce a design-only plan covering: chunks, schema delta, RPCs,
   files touched, test surface, expected acceptance criteria delta.
3. Wait for approval.
4. Execute chunk 1. Push. Wait for CI green.
5. Execute chunk 2. And so on.

When uncertain, ask. The Phase 10 list is the hard stop — anything in
that list does not become work without a separate written go-ahead.
