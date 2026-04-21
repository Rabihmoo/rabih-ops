\# Rabih Ops — V1 Plan (Corrected)



\*\*Version:\*\* 1.0 Final

\*\*Prepared for:\*\* Rabih El Moughabat

\*\*Date:\*\* April 21, 2026

\*\*Incorporates feedback from:\*\* Claude Opus 4.7, ChatGPT, Gemini



\---



\## Part 1 — What Changed From The First Plan



The first plan was 75% right but too ambitious. This version corrects 7 critical mistakes based on peer review:



| Original Plan | Corrected Plan |

|---|---|

| 7 weeks to production | \*\*10-12 weeks\*\* to production |

| AI parses WhatsApp from day 1 | \*\*Strict regex commands only\*\* in V1. AI parsing in V3. |

| Offline mode mentioned, not architected | \*\*PWA + IndexedDB explicitly\*\* from commit #1 |

| Magic link auth for everyone | \*\*Magic link for you+CEO+managers\*\*. No kitchen staff login in V1. |

| 9 modules in MVP | \*\*4 modules in V1\*\*: Tasks, Follow-ups, Inspections, Dashboard |

| Start right after Cater \& Co | \*\*Mid-June 2026 start\*\* — use Notion for 7 weeks first |

| Migrate Notion data | \*\*Start fresh\*\*. Notion becomes read-only archive |



\---



\## Part 2 — Lessons From Cater \& Co (Non-Negotiable Rules)



These are the same as before. Repeated here because they're the foundation.



1\. \*\*Every mutation goes through a SECURITY DEFINER RPC.\*\* Zero direct table writes from JS.

2\. \*\*RLS policies written for the actual auth role (anon).\*\* Tested before any feature ships.

3\. \*\*No feature ships without a Playwright test\*\* covering happy path + one failure case.

4\. \*\*No SQL runs in production without 24h in staging first.\*\*

5\. \*\*Every RPC returns final state.\*\* Caller verifies state, doesn't trust success.

6\. \*\*Every database column has a comment.\*\* Every RPC has a docstring.

7\. \*\*Mobile responsive from commit #1.\*\* Not retrofitted.

8\. \*\*No secrets in code or `.env` in repo.\*\* Supabase Vault or env vars only.

9\. \*\*Pre-commit hooks run ESLint + type check.\*\* Block broken commits.

10\. \*\*Feature branches + PR reviews.\*\* Never commit directly to main.



\---



\## Part 3 — V1 Scope (LOCKED)



\### What V1 Includes



\*\*4 modules, nothing more:\*\*



1\. \*\*Authentication\*\* — Magic link login (email) for you, CEO, managers

2\. \*\*Users \& Branches\*\* — Seed data, role-based permissions, branch scoping

3\. \*\*Tasks\*\* — CRUD, by branch, category, priority, due date

4\. \*\*Follow-ups\*\* — CRUD, by person, due date, with reminder support

5\. \*\*Inspections\*\* — CRUD with findings, offline-capable

6\. \*\*Dashboard\*\* — Today's priorities, overdue items, per-user view

7\. \*\*Audit Log\*\* — Every mutation logged automatically

8\. \*\*WhatsApp Bot (basic)\*\* — 4 strict commands only: `!task`, `!followup`, `!done`, `!today`



\### What V1 Does NOT Include



These are V2/V3, not V1:



\- ❌ Supplier payments

\- ❌ Purchases tracking

\- ❌ Employee HR log

\- ❌ Training tracker

\- ❌ Client feedback

\- ❌ Social media planner

\- ❌ Inventory counts

\- ❌ AI-powered WhatsApp parsing

\- ❌ Push notifications (web push)

\- ❌ Reports / analytics

\- ❌ Data imports

\- ❌ Integration with Cater \& Co data



\*\*Rule: if you find yourself saying "we should also add X" during V1, write it down as a V2 feature. Don't build it.\*\*



\---



\## Part 4 — Tech Stack (Locked)



\### Frontend



\- \*\*React 18\*\* + \*\*Vite\*\* (fast builds)

\- \*\*Tailwind CSS\*\* + \*\*shadcn/ui\*\* (professional components out of the box)

\- \*\*TanStack Query\*\* (React Query) — server state, caching, optimistic updates

\- \*\*Zustand\*\* — client state

\- \*\*React Hook Form\*\* + \*\*Zod\*\* — forms and validation

\- \*\*Workbox\*\* (via Vite PWA plugin) — offline support, service worker

\- \*\*localforage\*\* (IndexedDB wrapper) — offline data queue



\### Backend



\- \*\*Supabase\*\* (2 projects: staging + production)

\- Postgres, Auth, Storage, Edge Functions

\- RLS enabled on every table

\- SECURITY DEFINER RPCs for every mutation



\### Deployment



\- \*\*Cloudflare Pages\*\* — auto-deploy from GitHub on push to `main`

\- \*\*GitHub Actions\*\* — CI runs Playwright tests on every push



\### Monitoring



\- \*\*Sentry\*\* — frontend + backend errors (free tier)

\- \*\*Supabase logs\*\* — database query monitoring

\- \*\*Custom audit log\*\* — business-level tracking



\### WhatsApp



\- \*\*Twilio WhatsApp Business API\*\*

\- \*\*Supabase Edge Function\*\* as the webhook handler

\- \*\*No AI parsing in V1.\*\* Strict regex commands only.



\---



\## Part 5 — WhatsApp Bot V1 (4 Commands Only)



\### Why Strict Commands Instead of AI



LLMs hallucinate. An AI misinterpreting "salt needs 5kg of beef, cancel the chicken" creates operational chaos. V1 uses predictable regex patterns. AI comes in V3 after the data flow is proven.



\### Supported Commands



```

!task \[branch] \[priority] \[description]

!followup \[person] \[date] \[description]

!done \[id or title]

!today

```



\### Examples



```

User: !task salt urgent fix drain in kitchen

Bot:  ✅ Task #247 added — SALT, Urgent. Fix drain in kitchen.



User: !followup ricky 28/04 confirm ethanol shipment

Bot:  ✅ Follow-up #89 added — Ricky, due 28/04. Confirm ethanol shipment.



User: !done 247

Bot:  ✅ Task #247 marked done.



User: !today

Bot:  📋 Today:

&#x20;     - #245 (URGENT) Call Ayaz about full moon video

&#x20;     - #89 Confirm ethanol with Ricky

&#x20;     - #248 Inspect BBQ kitchen

```



\### Error Handling



```

User: fix the drain

Bot:  ❌ Command not recognized. Try:

&#x20;     !task \[branch] \[priority] \[description]

&#x20;     !followup \[person] \[date] \[description]

&#x20;     !done \[id]

&#x20;     !today

&#x20;     

&#x20;     Type !help for full list.

```



\### Architecture



```

WhatsApp message

&#x20;    ↓

Twilio webhook

&#x20;    ↓

Supabase Edge Function

&#x20;    ↓

Regex parse → validate → call RPC

&#x20;    ↓

Reply via Twilio

```



No Claude API in V1. Just pattern matching. Dead simple, impossible to hallucinate.



\---



\## Part 6 — Offline Mode Architecture



Kitchen freezers and deep corners drop signal. Inspections MUST work offline.



\### Strategy



\- Vite PWA plugin generates a service worker

\- App shell cached on first load

\- Read queries cached in IndexedDB via TanStack Query persistence

\- Write mutations queued in IndexedDB when offline

\- Background sync when connection returns

\- Visual indicator when offline ("⚡ Offline — 3 actions queued")



\### Specific Pages That Must Work Offline



\- ✅ Inspection form (create + add findings)

\- ✅ Task creation

\- ✅ Follow-up creation

\- ✅ Mark task/follow-up done



\### Pages That Don't Need Offline



\- Settings

\- User management

\- Reports (V2)



\---



\## Part 7 — Database Schema V1 (Final)



\### Core Tables



```sql

\-- Users extend Supabase auth.users

CREATE TABLE users (

&#x20; id UUID PRIMARY KEY REFERENCES auth.users(id),

&#x20; email TEXT NOT NULL UNIQUE,

&#x20; full\_name TEXT NOT NULL,

&#x20; role TEXT NOT NULL CHECK (role IN ('admin','ceo','manager','viewer')),

&#x20; branches TEXT\[] NOT NULL DEFAULT '{}',

&#x20; phone TEXT,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

&#x20; updated\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

COMMENT ON TABLE users IS 'Internal users with role-based access';

COMMENT ON COLUMN users.branches IS 'Array of branch codes user can access, or \["all"] for admins';



\-- Branches seeded once

CREATE TABLE branches (

&#x20; code TEXT PRIMARY KEY,

&#x20; name TEXT NOT NULL,

&#x20; color TEXT NOT NULL,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

\-- Seeded: bbqhouse, salt, centralkitchen, cleaning



\-- Tasks

CREATE TABLE tasks (

&#x20; id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20; title TEXT NOT NULL,

&#x20; description TEXT,

&#x20; branch TEXT NOT NULL REFERENCES branches(code),

&#x20; category TEXT NOT NULL CHECK (category IN ('operations','hr','training','maintenance','social\_media','follow\_up','other')),

&#x20; priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),

&#x20; status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in\_progress','done','blocked','cancelled')),

&#x20; due\_date DATE,

&#x20; assigned\_to UUID REFERENCES users(id),

&#x20; created\_by UUID NOT NULL REFERENCES users(id),

&#x20; completed\_at TIMESTAMPTZ,

&#x20; completion\_note TEXT,

&#x20; deleted\_at TIMESTAMPTZ,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

&#x20; updated\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

COMMENT ON TABLE tasks IS 'Operational tasks across branches';



\-- Follow-ups

CREATE TABLE follow\_ups (

&#x20; id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20; title TEXT NOT NULL,

&#x20; person TEXT NOT NULL,

&#x20; branch TEXT REFERENCES branches(code),

&#x20; category TEXT NOT NULL CHECK (category IN ('call','whatsapp','email','meeting','check\_in\_person')),

&#x20; due\_date DATE NOT NULL,

&#x20; priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),

&#x20; status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','snoozed','cancelled')),

&#x20; notes TEXT,

&#x20; outcome TEXT,

&#x20; assigned\_to UUID REFERENCES users(id),

&#x20; created\_by UUID NOT NULL REFERENCES users(id),

&#x20; completed\_at TIMESTAMPTZ,

&#x20; deleted\_at TIMESTAMPTZ,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

&#x20; updated\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



\-- Inspections

CREATE TABLE inspections (

&#x20; id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20; branch TEXT NOT NULL REFERENCES branches(code),

&#x20; area TEXT NOT NULL CHECK (area IN ('kitchen','storage','service\_area','cold\_room','dry\_store','staff\_area','full\_branch')),

&#x20; inspection\_date DATE NOT NULL,

&#x20; result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','pass','issues\_found','failed')),

&#x20; general\_notes TEXT,

&#x20; inspected\_by UUID NOT NULL REFERENCES users(id),

&#x20; deleted\_at TIMESTAMPTZ,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

&#x20; updated\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



\-- Inspection findings (child table)

CREATE TABLE inspection\_findings (

&#x20; id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20; inspection\_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

&#x20; severity TEXT NOT NULL CHECK (severity IN ('minor','major','critical')),

&#x20; description TEXT NOT NULL,

&#x20; action\_required TEXT,

&#x20; responsible TEXT,

&#x20; follow\_up\_date DATE,

&#x20; status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in\_progress','resolved','escalated')),

&#x20; resolved\_at TIMESTAMPTZ,

&#x20; resolution\_note TEXT,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

&#x20; updated\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



\-- Audit log

CREATE TABLE audit\_log (

&#x20; id BIGSERIAL PRIMARY KEY,

&#x20; user\_id UUID REFERENCES users(id),

&#x20; action TEXT NOT NULL,

&#x20; entity\_type TEXT NOT NULL,

&#x20; entity\_id UUID,

&#x20; before\_state JSONB,

&#x20; after\_state JSONB,

&#x20; ip\_address TEXT,

&#x20; source TEXT CHECK (source IN ('web','whatsapp','api')),

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



\-- WhatsApp messages (debugging)

CREATE TABLE whatsapp\_messages (

&#x20; id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20; phone TEXT NOT NULL,

&#x20; direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),

&#x20; message\_text TEXT NOT NULL,

&#x20; parsed\_command TEXT,

&#x20; parsed\_params JSONB,

&#x20; response\_text TEXT,

&#x20; error TEXT,

&#x20; created\_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

```



\*\*Total: 7 tables in V1.\*\* Down from 20+ in the first plan. Simpler is better.



\---



\## Part 8 — RPCs V1 (Complete List)



\### Tasks

\- `rpc\_create\_task(branch, category, title, priority, due\_date, assigned\_to, description) → task\_id`

\- `rpc\_update\_task(task\_id, updates jsonb) → task`

\- `rpc\_complete\_task(task\_id, completion\_note) → task`

\- `rpc\_delete\_task(task\_id) → success` (soft delete)



\### Follow-ups

\- `rpc\_create\_follow\_up(person, branch, category, title, due\_date, priority, notes) → follow\_up\_id`

\- `rpc\_mark\_follow\_up\_done(follow\_up\_id, outcome) → follow\_up`

\- `rpc\_snooze\_follow\_up(follow\_up\_id, new\_due\_date, reason) → follow\_up`



\### Inspections

\- `rpc\_create\_inspection(branch, area, date, general\_notes) → inspection\_id`

\- `rpc\_add\_inspection\_finding(inspection\_id, severity, description, action\_required, responsible, follow\_up\_date) → finding\_id`

\- `rpc\_complete\_inspection(inspection\_id, result) → inspection`

\- `rpc\_resolve\_finding(finding\_id, resolution\_note) → finding`



\### Dashboard

\- `rpc\_get\_user\_dashboard(user\_id) → jsonb` (today's priorities, overdue, assigned)



\### WhatsApp

\- `rpc\_process\_whatsapp\_command(phone, command, params jsonb) → response\_text`



\*\*Total: 12 RPCs in V1.\*\* Clean, focused, testable.



\---



\## Part 9 — Permissions Matrix V1



| Role | Tasks | Follow-ups | Inspections | Users | Dashboard |

|---|---|---|---|---|---|

| Admin (you) | All branches CRUD | All branches CRUD | All branches CRUD | Full management | Company-wide |

| CEO | All branches CRUD | All branches CRUD | All branches CRUD | Read only | Company-wide |

| Manager | Own branch CRUD | Own branch CRUD | Own branch CRUD | Own profile | Own branch |

| Viewer | Own branch read | Own branch read | Own branch read | Own profile | Own branch |



RLS policies enforce this at the database level. Tested with Playwright.



\---



\## Part 10 — UI/UX Design



\### Core Principles



1\. \*\*Dashboard first.\*\* You log in, you see exactly what needs attention. Nothing else.

2\. \*\*Branch color coding everywhere.\*\* BBQ=orange, SALT=blue, CK=green, Cleaning=gray.

3\. \*\*Priority badges.\*\* Red/yellow/green dot next to every item.

4\. \*\*1-click actions from list view.\*\* Complete, done, snooze.

5\. \*\*Keyboard shortcuts.\*\* `N` for new task, `F` for new follow-up, `I` for new inspection.

6\. \*\*Command palette.\*\* `Cmd+K` to search anything.

7\. \*\*Mobile: bottom sheets instead of full pages.\*\*

8\. \*\*Dark mode default.\*\*



\### Pages V1



\- `/login` — magic link entry

\- `/` — dashboard

\- `/tasks` — tasks list + kanban toggle

\- `/tasks/new` — create task (mobile bottom sheet)

\- `/tasks/:id` — task detail

\- `/follow-ups` — follow-ups list grouped by due date

\- `/follow-ups/new` — create follow-up

\- `/follow-ups/:id` — detail

\- `/inspections` — list of inspections

\- `/inspections/new` — inspection form (offline-capable)

\- `/inspections/:id` — detail with findings

\- `/settings` — profile, preferences



\*\*12 pages in V1.\*\* Everything else is V2.



\---



\## Part 11 — Timeline (Realistic 10-12 Weeks)



\### Phase 0 — Planning \& Setup (Week 1)



\- \[ ] This plan approved by you

\- \[ ] GitHub repo created, branches set up

\- \[ ] Two Supabase projects created

\- \[ ] Cloudflare Pages project

\- \[ ] Sentry project

\- \[ ] Twilio account with WhatsApp sandbox

\- \[ ] CLAUDE.md for the repo

\- \[ ] Schema SQL finalized

\- \[ ] Low-fi wireframes drawn



\### Phase 1 — Foundation (Weeks 2-3)



\- \[ ] Auth working (magic link)

\- \[ ] Users + branches tables + seed data

\- \[ ] All RLS policies + tests

\- \[ ] Audit log trigger on every table

\- \[ ] Basic shell UI (sidebar, header, responsive layout)

\- \[ ] Login page

\- \[ ] Dashboard page (empty)

\- \[ ] User settings page



\### Phase 2 — Tasks (Weeks 4-5)



\- \[ ] Tasks table + RPCs + RLS

\- \[ ] Tasks list page (filters: branch, status, priority)

\- \[ ] Tasks kanban view

\- \[ ] Create/edit/complete task flows

\- \[ ] Playwright tests for all task flows

\- \[ ] Dashboard shows today's tasks



\### Phase 3 — Follow-ups (Weeks 6-7)



\- \[ ] Follow-ups table + RPCs + RLS

\- \[ ] Follow-ups list grouped by due date

\- \[ ] Create/mark done/snooze flows

\- \[ ] Playwright tests

\- \[ ] Dashboard shows follow-ups due today + overdue



\### Phase 4 — Inspections + Offline (Weeks 8-9)



\- \[ ] Inspections + findings tables + RPCs + RLS

\- \[ ] Inspections list page

\- \[ ] New inspection form (mobile-optimized)

\- \[ ] Findings management within inspection

\- \[ ] PWA setup (Workbox, service worker, manifest)

\- \[ ] Offline queue via IndexedDB

\- \[ ] Background sync

\- \[ ] Offline indicator in UI

\- \[ ] Playwright tests including offline scenarios



\### Phase 5 — WhatsApp Bot (Weeks 10-11)



\- \[ ] Twilio webhook Edge Function

\- \[ ] Regex command parser (4 commands)

\- \[ ] `rpc\_process\_whatsapp\_command` with phone-to-user mapping

\- \[ ] Error messages and help command

\- \[ ] Manual testing with your phone

\- \[ ] Add 1-2 managers for beta testing

\- \[ ] Playwright tests for the Edge Function logic



\### Phase 6 — Polish \& Launch (Week 12)



\- \[ ] Security audit (RLS, RPC permissions, secret scanning)

\- \[ ] Performance check (Lighthouse scores > 90)

\- \[ ] Mobile testing on iOS + Android

\- \[ ] Backup strategy documented

\- \[ ] User guide written (English, for managers)

\- \[ ] Onboarding flow for first-time users

\- \[ ] Launch to production

\- \[ ] Keep Notion as read-only archive



\---



\## Part 12 — Testing Strategy



\### What We Test



\*\*Playwright E2E (primary):\*\*

\- Every happy path (create task, complete task, etc.)

\- Critical failure paths (permissions, validation)

\- Offline scenarios for inspections

\- WhatsApp command flows

\- Role-based access (can a manager see SALT branch tasks?)



\*\*Vitest Unit (secondary):\*\*

\- Regex command parser

\- Date/time utilities

\- Permission helper functions



\*\*Manual:\*\*

\- Mobile real-device testing (your phone + 1 manager's phone)

\- Cross-browser (Chrome + Safari)



\### What We Don't Test in V1



\- Load/stress testing (your traffic is 10 users, not 10,000)

\- Full UI regression testing (too slow for V1 pace)



\---



\## Part 13 — Pre-Launch Period (Weeks Now → Mid-June)



\### The "Notion Pain Points" Log



During the 7 weeks before we start coding, keep a Google Doc called "Notion Pain Points" and add every frustration:



\- "Takes 5 taps to add a task on phone"

\- "Can't see all urgent items across branches in one view"

\- "No reminder when follow-up becomes overdue"



These become real V1 requirements based on actual usage, not theory.



\### Cater \& Co Wind-Down



Before starting Rabih Ops:



\- \[ ] TK-002 closed (flaky tests fixed)

\- \[ ] Remaining CK test expansion done

\- \[ ] Production deployment checklist cleared

\- \[ ] No urgent Cater \& Co bugs open

\- \[ ] Take 1 weekend off, clear your head



\### What Not To Do



\- ❌ Don't start coding V1 features early

\- ❌ Don't expand Notion schema further

\- ❌ Don't build a "quick prototype" that becomes technical debt

\- ❌ Don't show the idea to CEO until V1 is ready



\---



\## Part 14 — Cost Estimate



\### Monthly Infrastructure (Production)



| Service | Cost |

|---|---|

| Supabase (2 projects) | $0-25/mo (free tier works initially) |

| Cloudflare Pages | $0 |

| Twilio WhatsApp | $5-20/mo based on volume |

| Sentry | $0 (free tier) |

| Domain | $1/mo ($12/year) |

| \*\*Total\*\* | \*\*$6-46/month\*\* |



\### Development Cost



\- Your time (priceless)

\- Claude API usage for Claude Code (covered by Max plan)

\- Zero external developers



\### Compare To Alternatives



\- Notion Team 4 users: $40/month forever, generic UI

\- Monday.com 4 users: $40-60/month forever, still not WhatsApp-native

\- Custom solution you own: $30/month + one-time build effort



\---



\## Part 15 — Success Criteria for V1



V1 is successful when:



\- ✅ You open Rabih Ops instead of Notion every morning for 2 weeks straight

\- ✅ At least 1 manager uses the WhatsApp bot daily

\- ✅ Zero follow-ups fall through the cracks (none overdue > 3 days without action)

\- ✅ You complete 5+ inspections offline in kitchen areas without app crashes

\- ✅ Zero critical bugs for 1 month post-launch

\- ✅ Audit log shows clear history of who did what



If we hit these, we start V2 (payments, purchases, employees).



\---



\## Part 16 — Decisions Locked



Based on your answers + peer review:



| Decision | Locked Answer |

|---|---|

| Framework | React + Vite + Tailwind + shadcn/ui |

| Backend | Supabase (2 projects) |

| Start date | Mid-June 2026 (\~Week of June 15) |

| Beta tester | You + 1 trusted manager (NOT the CEO yet) |

| Data migration | Start fresh, Notion becomes archive |

| Timeline | 10-12 weeks |

| WhatsApp in V1 | Strict regex commands only, NO AI parsing |

| Auth | Magic link for V1, WhatsApp OTP for V2 if needed |

| Device | Personal phones only, no dedicated tablets |

| Offline support | Required for inspections (PWA + IndexedDB) |



\---



\## Part 17 — Next Step



1\. \*\*Read this plan one more time.\*\* Note anything that still feels wrong or missing.

2\. \*\*Between now and mid-June:\*\* use Notion daily. Log pain points. Close Cater \& Co work.

3\. \*\*Week of June 15:\*\* we start Phase 0. Claude Code executes. I review every PR. You approve production deploys.



No code runs before then. No scope expands. No shortcuts taken.



This is the plan.



\---



\*Corrected plan combines: Claude Opus 4.7 architecture + ChatGPT reality check + Gemini risk analysis.\*

\*V1 ships in 10-12 weeks starting mid-June 2026.\*

