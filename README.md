# Rabih Ops

Operations management for BBQ House, SALT, Central Kitchen, and Executive Cleaning.

Dashboard, tasks, follow-ups, inspections (offline-capable), audit log, and a WhatsApp command bot — all in one PWA.

## Status

V1 in development. Scope and milestones are locked in [`PLAN.md`](./PLAN.md). Long-form context for contributors lives in [`CLAUDE.md`](./CLAUDE.md).

Currently Phase 0 / early Phase 1:

- [x] React + Vite + TS scaffold, Tailwind + shadcn primitives, PWA, offline queue
- [x] Supabase schema, RLS, 12 RPCs deployed to staging
- [x] Magic-link auth flow, protected routes, responsive layout
- [x] Dashboard shell, placeholders for Tasks / Follow-ups / Inspections
- [ ] Tasks module (Phase 2)
- [ ] Follow-ups module (Phase 3)
- [ ] Inspections + full offline (Phase 4)
- [ ] WhatsApp bot (Phase 5)

## Tech stack

React 18 · Vite · TypeScript · Tailwind · shadcn/ui · TanStack Query · Zustand · React Hook Form · Zod · Workbox (PWA) · localforage · Supabase (Postgres + Auth + RLS) · Playwright · GitHub Actions.

## Local development

```bash
npm install
cp .env.example .env.local    # then fill in values
npm run dev                   # http://localhost:5173
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (write) |
| `npm run test` | Vitest (unit) |
| `npm run e2e` | Playwright (E2E, builds then runs) |
| `npm run db:push` | Apply `supabase/migrations/*.sql` + `supabase/seed.sql` to the staging project |

## Environment

Everything lives in `.env.local` (gitignored). See [`.env.example`](./.env.example) for required keys.

Client-visible values are prefixed `VITE_`. Server-only values (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`) must never appear in client code.

## Database

```
supabase/migrations/
  20260421_initial_schema.sql
  20260421_rls.sql
  20260421_rpcs.sql
supabase/seed.sql
```

8 tables (users, branches, tasks, follow_ups, inspections, inspection_findings, audit_log, whatsapp_messages), RLS policies, and 12 SECURITY DEFINER RPCs. Every mutation is audit-logged.

Deploy to staging:

```bash
npm run db:push
```

## Contributing

- Work on feature branches, open a PR, let CI run Playwright.
- Every new mutation = new RPC + RLS review + Playwright test.
- Every schema change ships in a new `supabase/migrations/*.sql` file — never edit prior ones.

## License

Private, internal tooling. Not for redistribution.
