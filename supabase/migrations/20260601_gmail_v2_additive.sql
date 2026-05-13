-- Rabih Ops — Phase G2.0: Gmail V2 additive migration
-- =====================================================================
-- First of two passes for the Gmail V2 schema rework. This pass is
-- ENTIRELY additive: it adds columns + backfills. It does NOT change
-- primary keys, drop check constraints, or set NOT NULL on existing
-- columns. V1 client code, RPCs, and Edge Functions keep working
-- unchanged.
--
-- Pass 2 (G2.0.b, separate migration) will:
--   1. Swap google_oauth_tokens PK from (user_id, service) to
--      (user_id, service, google_account_id).
--   2. Add a partial unique index enforcing exactly one default
--      account per (user_id, service).
--   3. Enforce NOT NULL on email_links.google_account_id once the
--      backfill below has been confirmed comprehensive in staging.
--
-- Split into two passes per CLAUDE.md PLAN rule #4 ("No SQL runs in
-- production without 24h in staging first") so the destructive ALTER
-- TABLE on the PK gets its own soak window separate from the
-- harmless column additions.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + WHERE-clauses on the
-- backfill so a replay does nothing.

begin;

-- =====================================================================
-- 1. google_oauth_tokens — multi-account markers
-- =====================================================================
-- google_account_id already exists and is NOT NULL on this table; we
-- only need is_default + nickname to support the multi-account UI.
-- Pass 2 changes the PK to include google_account_id.

alter table public.google_oauth_tokens
  add column if not exists is_default boolean not null default false;

comment on column public.google_oauth_tokens.is_default is
  'True for the user''s default account per (user_id, service). G2.0.b adds a partial unique index enforcing exactly one default per (user, service). Backfilled true for every V1 row since each user has at most one account per service at V1 time.';

alter table public.google_oauth_tokens
  add column if not exists nickname text;

comment on column public.google_oauth_tokens.nickname is
  'Optional user-set label for the account (e.g. "Work", "Personal"). UI renders this when set; falls back to google_email. Max length enforced at the RPC layer, not the schema.';

-- Backfill: every existing row becomes its own default. Idempotent —
-- once true, the predicate excludes it from a replay.
update public.google_oauth_tokens
   set is_default = true
 where is_default = false;

-- =====================================================================
-- 2. email_links — account scoping
-- =====================================================================
-- Snapshot which Gmail account the message came from. Required so a
-- user with two connected accounts (personal + work) can disambiguate
-- and so multi-account "open in Gmail" can route to the correct
-- mailbox via ?authuser=. Pass 2 will enforce NOT NULL.

alter table public.email_links
  add column if not exists google_account_id text;

comment on column public.email_links.google_account_id is
  'The Gmail account (Google user id) the message belongs to. Nullable in G2.0 to allow safe backfill; G2.0.b enforces NOT NULL after the backfill below is confirmed comprehensive. New rows from G2.2+ code must populate this column.';

-- Backfill: for each row, look up the linker''s token row. At V1 time
-- there''s at most one Gmail account per user so the join is
-- deterministic. order by is_active desc, connected_at desc breaks
-- ties safely if a user happens to have connected + disconnected
-- (prefer their currently-active row; fall back to most recent).
update public.email_links el
   set google_account_id = (
     select t.google_account_id
       from public.google_oauth_tokens t
      where t.user_id = el.user_id
        and t.service = 'gmail'
      order by t.is_active desc, t.connected_at desc
      limit 1
   )
 where el.google_account_id is null;

commit;
