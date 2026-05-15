// Pure helpers for the F1 follow-up status taxonomy. Lives outside React
// so the label/tone/transition logic can be vitested without bootstrapping
// the app — same pattern as email-status.ts and record-relations.ts.
//
// DB stores: pending | working | waiting | no_answer | postponed | done | cancelled
// UI shows:  Pending | Working on it | Waiting for someone | No answer |
//            Postponed | Done | Cancelled

import type { StatusTone } from '@/components/ui/status-chip';
import type { FollowUpStatus } from '@/types/database';

// Order matters — drives the filter chip strip and any list grouping
// done by status. Open / in-flight / closed buckets are visually grouped
// when needed; the array stays flat for simplicity.
export const FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  'pending',
  'working',
  'waiting',
  'no_answer',
  'postponed',
  'done',
  'cancelled',
];

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  pending:    'Pending',
  working:    'Working on it',
  waiting:    'Waiting for someone',
  no_answer:  'No answer',
  postponed:  'Postponed',
  done:       'Done',
  cancelled:  'Cancelled',
};

// Tones picked to mirror the operational meaning:
//   pending  = unstarted    → muted
//   working  = in-flight    → info
//   waiting  = blocked      → warning  (visually flags "not on me right now")
//   no_answer= soft-stuck   → warning  (call to action: chase again)
//   postponed= scheduled    → muted    (deferred, not actionable yet)
//   done     = closed ok    → success
//   cancelled= closed no-op → muted
const STATUS_TONE: Record<FollowUpStatus, StatusTone> = {
  pending:    'muted',
  working:    'info',
  waiting:    'warning',
  no_answer:  'warning',
  postponed:  'muted',
  done:       'success',
  cancelled:  'muted',
};

export function followUpStatusLabel(status: FollowUpStatus | string): string {
  if (status in STATUS_LABEL) return STATUS_LABEL[status as FollowUpStatus];
  // Defensive fallback for any future / unknown value — Title-case the raw
  // string with underscores replaced by spaces. Keeps the UI legible if a
  // new status appears in DB before the frontend bundle catches up.
  const cleaned = status.replace(/_/g, ' ').trim();
  return cleaned.length === 0
    ? 'Unknown'
    : cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function followUpStatusTone(status: FollowUpStatus | string): StatusTone {
  return (STATUS_TONE as Record<string, StatusTone>)[status] ?? 'muted';
}

// Buckets used to group statuses in filter UIs. "open" = anything not done
// or cancelled. "closed" = done or cancelled. These are derivable from the
// flat list above but having them named keeps the consumer code clean.
export const OPEN_STATUSES: FollowUpStatus[] = [
  'pending', 'working', 'waiting', 'no_answer', 'postponed',
];
export const CLOSED_STATUSES: FollowUpStatus[] = ['done', 'cancelled'];

export function isOpenStatus(status: FollowUpStatus | string): boolean {
  return OPEN_STATUSES.includes(status as FollowUpStatus);
}

// Transition validator. Returns true if `to` is a legal next state from
// `from`. The matrix is permissive on purpose (operators sometimes need
// to reopen a done follow-up) — only outright nonsensical transitions
// are rejected. The RPC enforces idempotency separately (same-status
// updates are no-ops, not errors).
//
// Rules:
//   - any status → cancelled (always possible)
//   - any status → done      (always possible)
//   - any status → pending   (re-open, including from done/cancelled)
//   - working / waiting / no_answer / postponed → any other open status
//
// The validator exists for the UI quick-action menu to grey out
// nonsensical options. It does NOT replace the RPC-level CHECK, which
// only enforces the value set, not the transition graph.
export function isValidStatusTransition(
  from: FollowUpStatus | string,
  to: FollowUpStatus | string,
): boolean {
  if (from === to) return true; // idempotent, treated as legal
  // Every status can reach every other status in V1. The graph is
  // intentionally flat; we keep the function for forward compat (e.g.
  // V2 may want "cancelled can only re-open via explicit re-open
  // button") and to give the UI a single source-of-truth hook.
  return (
    FOLLOW_UP_STATUSES.includes(to as FollowUpStatus) &&
    FOLLOW_UP_STATUSES.includes(from as FollowUpStatus)
  );
}
