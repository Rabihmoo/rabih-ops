import { Inbox, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useGmailLinkStatus } from '@/hooks/useGmail';
import { useEmailStatesForUser } from '@/hooks/useEmailStates';
import { emailStateRowToDashboardMessage } from '@/lib/email-status';
import { EmailRow } from './EmailRow';

/**
 * RabihOS-pending emails surfaced regardless of age. Reads
 * email_states.status='pending' for the caller — no Gmail roundtrip,
 * so pending items stay visible even after the message ages out of
 * Today's bucket or out of Gmail's `newer_than:7d` important window.
 *
 * Self-hides when:
 *   - Gmail isn't connected (V1 — keeps the Dashboard mental model
 *     consistent with Today / Important cards).
 *   - There are 0 pending rows (zero-noise UX: nothing to do means
 *     no card).
 *
 * TODO(V2.x): the snapshot stored in email_states survives Gmail
 *   disconnect, so the Pending card could also render in the
 *   not-connected case (with the ⋮ action menu disabled until the
 *   user reconnects). Out of scope for this chunk; flagged so a
 *   future relaxation is intentional, not accidental.
 */
export function DashboardPendingEmails() {
  const status = useGmailLinkStatus();
  const accountId = status.data?.google_account_id ?? null;
  const accountEmail = status.data?.email ?? null;

  // DB-only — no Gmail call. 200 matches the G2.1 RPC cap and the
  // partial index on email_states (user_id, set_at desc) where
  // status='pending'.
  const pending = useEmailStatesForUser({
    googleAccountId: accountId,
    status: ['pending'],
    limit: 200,
  });

  if (!status.data?.connected) return null;
  const rows = pending.data ?? [];
  if (!pending.isLoading && rows.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="border-border mb-1 flex items-baseline justify-between border-b pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Pending emails
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {rows.length}
            </span>
          </div>
          <span className="text-subtle-foreground text-xs">
            {status.data?.email}
          </span>
        </div>

        {pending.isLoading && (
          <div className="text-muted-foreground py-3 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!pending.isLoading && pending.error && (
          <div className="text-destructive-ink text-xs">
            Could not load pending emails: {(pending.error as Error).message}
          </div>
        )}

        {!pending.isLoading && !pending.error && rows.length > 0 && (
          <ul className="divide-border divide-y">
            {rows.map((state) => (
              <EmailRow
                key={`${state.google_account_id}:${state.gmail_message_id}`}
                message={emailStateRowToDashboardMessage(state, accountEmail)}
                googleAccountId={accountId}
                currentState={state}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
