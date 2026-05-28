# STATUS — 2026-05-28 V1 Complete

Rabih Ops V1 is fully shipped. All phases from the ROADMAP are merged to
`main` with CI green. The app is deployed on Cloudflare Pages with
staging Supabase.

---

## Phase summary

| Phase | Description | PRs | Tests added |
|-------|-------------|-----|-------------|
| 0 | Scaffold, config, PWA, auth | pre-#8 | baseline |
| 0.5 | Gmail Today View (G.1–G.5) | pre-#8, #28 | 4 Playwright |
| 1 | Business Memory — Notes UI | pre-#8 | — |
| 2 | Relationship Graph + Universal Panel | pre-#8 | — |
| 3 | Global Search / Cmd-K | #13–#18 | 12 vitest, 7 Playwright |
| 4 | Full Visual Consistency | continuous | — |
| 5 | Supplier / Company Intelligence | #19–#22 | 25 vitest, 8 Playwright |
| 6 | Smart Suggestions v2 | #31–#32 | 33 vitest, 3 Playwright |
| 7 | Reminder / Notification Center | #8–#12, #29–#30 | 12 vitest, 3 Playwright |
| 8 | Daily Command Center | #23–#27 | 15 vitest, 11 Playwright |
| 9 | Reports | #33–#39 | 18 vitest, 8 Playwright |
| B | Reminder engine | pre-#8 | — |
| C | Telegram bot | pre-#8 | — |
| D | Google Calendar | pre-#8 | — |
| F | Gmail integration | pre-#8 | — |

## Test counts

- **Vitest**: 522 unit tests across 34 test files
- **Playwright**: ~170 e2e specs across 30+ spec files
- **Total**: ~692 automated tests

## Infrastructure

- Branch protection on `main` — required CI check `build, lint, e2e`, strict mode
- Cloudflare Pages auto-deploy on push to `main`
- Staging Supabase with all migrations applied (20260421 → 20260619)
- GitHub Actions CI: typecheck + lint + build + Playwright

## Database schema (staging)

- **Tables**: users, branches, tasks, follow_ups, inspections, inspection_findings, purchase_requests, documents, notes, companies, contacts, comments, attachments, audit_log, whatsapp_messages, telegram_messages, telegram_user_links, notifications_queue, notification_log, record_links, email_links, document_links, calendar_event_links, email_states, google_oauth_tokens, oauth_state, company_branches, contact_branches, user_notification_mutes, user_inbox_settings, user_dashboard_pins (via users.dashboard_pins column)
- **Report RPCs**: rpc_report_task_velocity, rpc_report_supplier_spend, rpc_report_inspection_pass_rate, rpc_report_follow_up_close_rate
- **All writes via SECURITY DEFINER RPCs**. RLS enabled on every table with SELECT-only policies.

## V2 backlog (parked)

- Company tags (label + color, admin manage)
- Inbox settings editing UI
- Pin section reordering
- Auto-link purchase→company
- Calendar two-way sync
- Gmail write scopes
- Native mobile (PWA-first audit)
- AI assistant (read-and-surface first)

## `origin/main` tip: `b047130`
