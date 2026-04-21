# STATUS — 2026-04-21 overnight Phase 0/1 bootstrap

Everything from STEP 1–5 is **done locally and on the staging DB** except the final `git push`. That push is **blocked** on a GitHub permissions problem that only you can resolve.

---

## What's done

### Local repo (5 clean commits on `main`)

```
b710b5e docs: add README and CLAUDE.md for future sessions
695f0b3 ci: add Playwright smoke tests + GitHub Actions workflow
3172842 feat(db): initial schema, RLS, 12 RPCs, seed — deployed to staging
d75a327 feat(app): magic-link auth, protected layout, dashboard shell
22d853a chore(setup): scaffold React + Vite + Tailwind + shadcn PWA
```

- Vite 6 + React 18 + TS strict, Tailwind 3 + shadcn primitives, PWA via `vite-plugin-pwa`, `localforage` queue, TanStack Query (with localStorage persister), Zustand, RHF + Zod.
- `src/` laid out per `CLAUDE.md` (pages, components/ui, components/layout, components/auth, hooks, lib, stores, types).
- Auth: Supabase magic link, PKCE flow, `/auth/callback`, `ProtectedRoute`, session hook with `onAuthStateChange` sync.
- UI: responsive `AppLayout` with desktop sidebar + mobile bottom nav, top bar with sign-out, offline indicator, dark-mode default.
- Dashboard: “Welcome back, {name}” + three placeholder cards (Today's Priorities, Overdue, Assigned).
- Settings page showing profile fields.
- Playwright smoke tests pass locally on chromium (`npm run e2e`).

### Database on staging (`efuqczfleixbhnyisiia`)

Verified via `scripts/db-verify.ts`:

- **8 tables**: users, branches, tasks, follow_ups, inspections, inspection_findings, audit_log, whatsapp_messages
- **13 functions** (12 required RPCs per PLAN.md Part 8 + `rpc_bootstrap_user`): rpc_create_task, rpc_update_task, rpc_complete_task, rpc_delete_task, rpc_create_follow_up, rpc_mark_follow_up_done, rpc_snooze_follow_up, rpc_create_inspection, rpc_add_inspection_finding, rpc_complete_inspection, rpc_resolve_finding, rpc_get_user_dashboard, rpc_process_whatsapp_command, rpc_bootstrap_user
- **8 RLS policies** (SELECT-only; writes blocked unless via RPC)
- **4 seed branches**: bbqhouse / salt / centralkitchen / cleaning

### CI

- `.github/workflows/ci.yml` runs typecheck + lint + build + Playwright on push and PR. It will start running as soon as the repo exists on GitHub.

---

## What's blocking the push

`git push` to `https://github.com/Rabihmoo/rabih-ops.git` fails with **403 Write access to repository not granted**.

Diagnosis:

- `GITHUB_TOKEN` in `.env.local` authenticates as user `Rabihmoo` ✅
- Header `X-OAuth-Scopes:` is empty → this is a **fine-grained PAT**, not a classic one.
- `GET /user/repos` returns only `Rabihmoo/rabih-assistant` → the token is scoped to that single repo.
- `POST /user/repos` returns 404 → the token lacks “Administration: write” at the user level, so it can't create `rabih-ops` either.

### Two ways to unblock (pick one)

1. **Create the repo manually** at <https://github.com/new> (owner `Rabihmoo`, name `rabih-ops`, private). Then either regenerate the fine-grained PAT with access to both `rabih-assistant` *and* `rabih-ops`, or issue a classic PAT with `repo` scope, and paste it into `.env.local` as `GITHUB_TOKEN`. Next session runs:

   ```bash
   cd C:/Users/user/Desktop/rabih-ops
   git push "https://x-access-token:${GITHUB_TOKEN}@github.com/Rabihmoo/rabih-ops.git" main:main
   ```

2. **Regenerate the existing fine-grained PAT** at <https://github.com/settings/tokens?type=beta> with:
   - Resource owner: `Rabihmoo`
   - Repository access: **All repositories** (or add `rabih-ops` explicitly once it exists)
   - Repository permissions:
     - Contents: **Read and write**
     - Administration: **Read and write** *(only needed if you want the next session to auto-create the repo via API)*
     - Workflows: **Read and write** (needed because the first push includes `.github/workflows/ci.yml`)
     - Metadata: Read-only (mandatory, auto-selected)

   Update `GITHUB_TOKEN` in `.env.local` and run the same push command as above.

I deliberately did **not** force-push, rewrite history, or commit any fallback on your behalf. Nothing has been pushed yet — everything is safely on local `main`.

---

## Follow-ups for the next session (in priority order)

1. Unblock + push (above).
2. Add the two GitHub Actions secrets so CI doesn't fall back to placeholder Supabase env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (staging values).
3. Wire `rpc_bootstrap_user` into the auth flow: call it once inside `src/hooks/useAuth.ts` after the first `SIGNED_IN` event so new users automatically get a `public.users` row. Admin still has to promote them from `viewer` manually (by design).
4. Generate real Supabase types (`npx supabase gen types typescript --project-id efuqczfleixbhnyisiia > src/types/supabase.ts`) and replace the hand-rolled `src/types/database.ts`.
5. Start Phase 2 (Tasks module) per `PLAN.md` timeline.

## Environment notes

- `.env.local` contains all secrets and is gitignored.
- `.env` (VITE-prefixed copies for Vite) is also gitignored — you'll need to recreate it on a new machine from `.env.example`.
- `SUPABASE_ACCESS_TOKEN` in `.env.local` is scoped to the staging project only; `npm run db:push` uses it.

## Known warnings (non-blocking)

- Two ESLint `react-refresh/only-export-components` warnings in `button.tsx` / `toaster.tsx`. Standard shadcn pattern — safe to leave.
- Bundled JS is ~580 kB (gzip 168 kB). Vite warns about chunk size. We can add `manualChunks` later; not worth it at this scope.
- Git warns about LF→CRLF on Windows. Cosmetic; not breaking anything.
