// Phase G2.3 foundation — RabihOS-owned email status taxonomy and the
// pure composer that decides which label/tone to surface on a Gmail
// row in the Dashboard or Inbox.
//
// This module is intentionally PURE — it does NOT import the Supabase
// client or anything that needs runtime env vars. That keeps it
// usable from vitest without bootstrapping the app. Matches the
// pattern of src/lib/record-relations.ts (which is also pure).
//
// State storage + RPCs live in supabase/migrations/20260602_email_states.sql
// (G2.1). Hook wrappers live in src/hooks/useEmailStates.ts.

import type { StatusTone } from '@/components/ui/status-chip';

// =====================================================================
// Types
// =====================================================================

/**
 * The four stored statuses in email_states.status (CHECK-constrained
 * at the DB layer). linked_to_task / linked_to_follow_up are NOT
 * stored — they're derived at display time by checking whether an
 * email_links row exists for (entity_type, gmail_message_id).
 */
export type EmailStatus = 'pending' | 'followed_up' | 'done' | 'dismissed';

/**
 * Shape returned by rpc_email_state_for_message / rpc_email_states_for_user.
 * Mirrors the email_states columns plus jsonb-serialised timestamps.
 */
export interface EmailStateRow {
  user_id: string;
  google_account_id: string;
  gmail_message_id: string;
  status: EmailStatus;
  gmail_thread_id: string | null;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string | null;
  internal_date: string | null;
  note: string | null;
  set_at: string;
  updated_at: string;
}

/**
 * Optional derived signal — whether the message is linked to a task
 * or follow-up via email_links. Computed by the caller from the
 * `email_links` table; the composer treats both as boolean flags.
 * Both default to false when not provided.
 */
export interface EmailLinkPresence {
  hasTaskLink?: boolean;
  hasFollowUpLink?: boolean;
}

export interface EmailStatusPill {
  label: string;
  tone: StatusTone;
}

// =====================================================================
// Label / tone tables
// =====================================================================

const STATUS_LABEL: Record<EmailStatus, string> = {
  pending:     'Pending',
  followed_up: 'Followed up',
  done:        'Done',
  dismissed:   'Dismissed',
};

const STATUS_TONE: Record<EmailStatus, StatusTone> = {
  pending:     'warning',
  followed_up: 'info',
  done:        'success',
  dismissed:   'muted',
};

const LINKED_TASK_PILL: EmailStatusPill = {
  label: 'Linked to task',
  tone:  'info',
};

const LINKED_FOLLOW_UP_PILL: EmailStatusPill = {
  label: 'Linked to follow-up',
  tone:  'purple',
};

export function emailStatusLabel(status: EmailStatus): string {
  return STATUS_LABEL[status];
}

export function emailStatusTone(status: EmailStatus): StatusTone {
  return STATUS_TONE[status];
}

// =====================================================================
// Pill composer — the single source of truth for what shows on a row
// =====================================================================

/**
 * Composes the pill to render for a given email row. Returns null when
 * there's nothing to surface (no state, no links).
 *
 * Priority (highest wins):
 *   1. Linked to task            (derived from email_links)
 *   2. Linked to follow-up       (derived from email_links)
 *   3. Explicit status from email_states (Pending / Followed up /
 *      Done / Dismissed)
 *   4. null                      (no row, no link → no pill)
 *
 * Why derived-link wins over explicit status: once the user has taken
 * action by linking the email to a task or follow-up, that's a stronger
 * signal of "I'm working on this" than a pending/done classification.
 * The explicit status remains in email_states for history; the UI just
 * displays the linked status because it's more useful.
 *
 * Why this lives as a pure function: every email-row surface (Dashboard
 * Today, Dashboard Important, Inbox tabs, LinkedEmailsCard pills)
 * composes the same way. Centralising here keeps drift impossible.
 */
export function composeEmailStatusPill(
  state: EmailStateRow | null | undefined,
  links: EmailLinkPresence = {},
): EmailStatusPill | null {
  if (links.hasTaskLink)     return LINKED_TASK_PILL;
  if (links.hasFollowUpLink) return LINKED_FOLLOW_UP_PILL;
  if (state)                 return { label: emailStatusLabel(state.status), tone: emailStatusTone(state.status) };
  return null;
}

// =====================================================================
// Available actions for a row, given its current state
// =====================================================================

/**
 * Returns the action menu items the UI should render for an email
 * row. Drives the future ⋮ menu without needing every consumer to
 * duplicate "Clear" visibility logic.
 *
 * - `pending` / `done` / `dismissed` / `followed_up` are always
 *   available (lets the user transition to any state from any
 *   state).
 * - `clear` is only available when a state row exists — clearing a
 *   nonexistent row is a no-op the UI shouldn't suggest.
 */
export type EmailStatusAction =
  | 'mark_pending'
  | 'mark_done'
  | 'mark_followed_up'
  | 'mark_dismissed'
  | 'clear';

export function availableEmailActions(
  state: EmailStateRow | null | undefined,
): EmailStatusAction[] {
  const actions: EmailStatusAction[] = [
    'mark_pending',
    'mark_followed_up',
    'mark_done',
    'mark_dismissed',
  ];
  if (state) actions.push('clear');
  return actions;
}

export const EMAIL_ACTION_LABEL: Record<EmailStatusAction, string> = {
  mark_pending:     'Mark pending',
  mark_followed_up: 'Followed up',
  mark_done:        'Mark done',
  mark_dismissed:   'Dismiss',
  clear:            'Clear status',
};

/**
 * Maps an action to the status it sets, or null for `clear` which
 * deletes the row. Used by the (future) ⋮ menu handler to decide
 * which RPC to call.
 */
export function emailActionToStatus(
  action: EmailStatusAction,
): EmailStatus | null {
  switch (action) {
    case 'mark_pending':     return 'pending';
    case 'mark_followed_up': return 'followed_up';
    case 'mark_done':        return 'done';
    case 'mark_dismissed':   return 'dismissed';
    case 'clear':            return null;
  }
}

// =====================================================================
// Dashboard email-row shape + adapter
// =====================================================================
// The DashboardEmailRowMessage type lives here (not in EmailRow.tsx)
// so the lib stays self-contained and pure — no React / Supabase
// imports needed. EmailRow.tsx re-imports this type. Keeps adapters
// (below) vitest-clean and avoids a lib ↔ component circular dep.

/**
 * Minimal shape both GmailImportantMessage, GmailTodayMessage, and
 * adapter-wrapped email_state rows satisfy. EmailRow.tsx renders
 * from this shape.
 */
export interface DashboardEmailRowMessage {
  id: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string;
  internal_date: string | null;
  // V1 GmailImportantMessage allows null (degenerate case where Gmail
  // didn't surface a link); GmailTodayMessage always populates it;
  // the email_state adapter always populates it.
  html_link: string | null;
}

/**
 * Standard Gmail web URL for a message. The optional accountEmail
 * appends `?authuser=<email>` so a browser signed into multiple
 * Google accounts opens the right mailbox. Harmless in single-
 * account mode (Gmail ignores when only one account is signed in).
 */
export function gmailMessageLink(
  messageId: string,
  accountEmail?: string | null,
): string {
  const params = accountEmail
    ? `?authuser=${encodeURIComponent(accountEmail)}`
    : '';
  return `https://mail.google.com/mail/u/0/${params}#inbox/${messageId}`;
}

/**
 * Wrap an email_state snapshot in the shape EmailRow expects. Lets
 * DB-only surfaces (Pending card, future Done/Followed-up tabs)
 * reuse the same row component the Gmail-fed cards use.
 *
 * Falls back when fields the snapshot didn't capture:
 *   - thread_id null  → use message_id (single-message thread is
 *     a safe default; the row's "Open in Gmail" link uses the
 *     message id anyway)
 *   - snippet null    → empty string (EmailRow renders snippet only
 *     when truthy, so empty string suppresses the " — snippet" tail)
 */
export function emailStateRowToDashboardMessage(
  state: EmailStateRow,
  accountEmail?: string | null,
): DashboardEmailRowMessage {
  return {
    id: state.gmail_message_id,
    thread_id: state.gmail_thread_id ?? state.gmail_message_id,
    subject: state.subject,
    from_address: state.from_address,
    from_name: state.from_name,
    snippet: state.snippet ?? '',
    internal_date: state.internal_date,
    html_link: gmailMessageLink(state.gmail_message_id, accountEmail),
  };
}
