# CLAUDE.md — Rabih Ops

Context for future Claude Code sessions. Read this before making changes.

## What this is

Rabih Ops is an operations-management app for four businesses:

- **BBQ House** (`bbqhouse`) — restaurant
- **SALT** (`salt`) — restaurant
- **Central Kitchen** (`centralkitchen`) — production kitchen
- **Executive Cleaning** (`cleaning`) — cleaning services

Primary user is Rabih (admin). CEO + branch managers are the other human users. Kitchen/line staff do **not** log in in V1 — they interact only via the WhatsApp bot (Phase 5).

The full product plan lives in `PLAN.md`. Read it before doing non-trivial work. Scope is **locked** — Part 3 lists what V1 does and doesn't include. Don't build beyond it.

## Non-negotiable rules (from `PLAN.md` Part 2)

1. Every mutation goes through a `SECURITY DEFINER` RPC. Zero direct table writes from JS.
2. RLS is enabled on every table. Only `SELECT` policies exist — writes are blocked unless they come through an RPC.
3. No feature ships without a Playwright test covering the happy path + one failure case.
4. No SQL runs in production without 24h in staging first. (Currently staging-only.)
5. Every RPC returns final state (row as jsonb). The caller verifies state; never trust success alone.
6. Every table column has a `COMMENT`. Every RPC has a docstring.
7. Mobile responsive from commit #1 — never retrofit.
8. No secrets in code or in `.env*` files committed to the repo.
9. Pre-commit / CI runs ESLint + typecheck. Don't land broken commits.
10. Feature branches + PR reviews. Never commit directly to `main` once beta users exist (we're pre-beta — direct commits to `main` are still OK for infra bootstrapping).

## Tech stack

- **Frontend**: React 18 + Vite + TypeScript, Tailwind + shadcn/ui components, TanStack Query (with localStorage persister), Zustand, React Hook Form + Zod.
- **Offline**: `vite-plugin-pwa` (Workbox) + `localforage` queue in `src/lib/offlineQueue.ts`.
- **Backend**: Supabase (Postgres + Auth). RLS everywhere. SECURITY DEFINER RPCs only.
- **Routing**: react-router-dom 7.
- **Testing**: Playwright for E2E (`tests/e2e`), Vitest for units (not yet wired).
- **Deployment target** (later): Cloudflare Pages.
- **CI**: GitHub Actions, `.github/workflows/ci.yml`.

## Repo layout

```
src/
  main.tsx               TanStack Query provider, router, React root
  App.tsx                Routes + top-level layout
  index.css              Tailwind + CSS variables (light + dark)
  pages/                 One file per route
  components/
    ui/                  shadcn primitives (button, card, input, label, toaster)
    layout/              AppLayout, Sidebar, TopBar, OfflineIndicator, PagePlaceholder
    auth/                ProtectedRoute
  hooks/
    useAuth.ts           useSession, useCurrentUserProfile, signInWithMagicLink, signOut
  lib/
    supabase.ts          Typed Supabase client (singleton)
    rpc.ts               callRpc<T>() helper
    branches.ts          BRANCHES + BRANCH_LIST constants
    offlineQueue.ts      localforage-backed mutation queue
    utils.ts             cn()
  stores/
    uiStore.ts           Zustand store for UI state (branch filter)
  types/
    database.ts          Hand-written until `supabase gen types` replaces it
supabase/
  migrations/
    20260421_initial_schema.sql   Tables + indexes + triggers
    20260421_rls.sql              RLS policies + branch-access helpers
    20260421_rpcs.sql             12 RPCs + audit helper + user bootstrap
  seed.sql                        4 branches
scripts/
  db-push.ts             Applies migrations + seed to staging via Supabase Management API
  db-verify.ts           Smoke-checks tables, RPCs, policies, seed
tests/
  e2e/                   Playwright specs
```

## Environment

`.env.local` is gitignored. Required keys:

```
SUPABASE_URL=…                # staging project URL
SUPABASE_ANON_KEY=…           # public anon key
SUPABASE_SERVICE_ROLE_KEY=…   # service role (scripts only, NEVER shipped to client)
SUPABASE_ACCESS_TOKEN=…       # personal access token for Management API
SUPABASE_PROJECT_REF=…        # staging project ref (also works for prod when we have one)
APP_ENV=staging
```

Vite reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV`. These are currently duplicated into `.env` (also gitignored). Never use service-role keys in the client.

## Running locally

```
npm install
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
npm run typecheck
npm run lint
npm run e2e       # builds, starts preview, runs Playwright
npm run db:push   # apply migrations + seed to staging
```

The Playwright config boots `npm run build && npm run preview -- --host 127.0.0.1 --port 4173` itself — don't start it manually.

## Deploying database changes

1. Write a new file in `supabase/migrations/` named `<yyyymmdd>_<slug>.sql`. Use `begin;` / `commit;` and make it idempotent (`create … if not exists`, `drop policy if exists`, etc.).
2. Apply to staging: `npm run db:push`.
3. Verify: `node --env-file=.env.local --experimental-strip-types scripts/db-verify.ts`.

Each migration should:

- Stay inside one transaction.
- Add comments to every new column and function.
- Update RLS and RPCs together when the schema changes — never leave a table with writes enabled but no RPC to drive them.

## Permissions model (Part 9 of PLAN.md)

| Role     | Tasks / Follow-ups / Inspections | Users        | Dashboard     |
| -------- | -------------------------------- | ------------ | ------------- |
| admin    | All branches CRUD                | Full manage  | Company-wide  |
| ceo      | All branches CRUD                | Read only    | Company-wide  |
| manager  | Own branch CRUD                  | Own profile  | Own branch    |
| viewer   | Own branch read only             | Own profile  | Own branch    |

All branch checks go through `public.current_user_can_access_branch(text)`. Mutation RPCs also call `public._can_mutate()` which bars `viewer`.

## WhatsApp bot (Phase 5 — not yet built)

V1 uses **strict regex commands only**: `!task`, `!followup`, `!done`, `!today`. Never add AI parsing in V1 — that's V3. The Edge Function webhook will call `rpc_process_whatsapp_command` which is currently a stub logging to `whatsapp_messages`.

## Things to avoid

- Adding libraries not already in `package.json` without reading `PLAN.md` Part 4 first.
- Touching production (no prod project exists yet — staging only).
- Adding direct table inserts/updates/deletes from the client. Always a new RPC.
- Committing `.env`, `.env.local`, or anything containing `sbp_`, `sb_secret_`, or `eyJ…` JWTs.
- Expanding V1 scope (see Part 3 LOCKED list).

## Current state (set during overnight Phase 0/1 bootstrap, 2026-04-21)

- Phase 0 complete: scaffold, config, lint/prettier, CI config, shadcn primitives, PWA.
- Phase 1 partial: auth flow (magic link) wired, protected route, sidebar/topbar layout, dashboard shell, settings page, placeholders for Tasks/Follow-ups/Inspections. DB deployed to staging with all 8 tables, 12+ RPCs, and 4-branch seed. Offline indicator in place.
- Not yet done in Phase 1: audit log triggers (currently RPC-driven which is fine), user bootstrap flow wiring on login, Playwright test for auth round-trip (needs a seeded test user).
- Phases 2–6 not started.
