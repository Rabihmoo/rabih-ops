import { ExternalLink, Send, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/ui/status-chip';
import { useCanMutate } from '@/hooks/usePermissions';
import {
  composeEmailStatusPill,
  type DashboardEmailRowMessage,
  type EmailLinkPresence,
  type EmailStateRow,
} from '@/lib/email-status';
import { EmailRowActionMenu } from './EmailRowActionMenu';

// Re-export so V1 consumers that imported the type from EmailRow keep
// working unchanged. The canonical definition lives in email-status.ts
// to keep the lib usable without pulling in React.
export type { DashboardEmailRowMessage };

// Phase G2.3 wire-up — shared row used by DashboardTodayEmails AND
// DashboardImportantEmails. Visual identical to the V1 inline rows
// each card used to render. New: a status pill column and a ⋮
// action menu (gated on canMutate + googleAccountId).
//
// Why a shared component: both cards had byte-identical row layouts.
// Centralising here keeps drift impossible as the row grows.

function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  message: DashboardEmailRowMessage;
  googleAccountId: string | null;
  currentState: EmailStateRow | null;
  linkPresence?: EmailLinkPresence;
}

export function EmailRow({
  message,
  googleAccountId,
  currentState,
  linkPresence,
}: Props) {
  const canMutate = useCanMutate();
  const pill = composeEmailStatusPill(currentState, linkPresence);
  const showMenu = canMutate && !!googleAccountId;
  const isLinkPill =
    !!pill &&
    (pill.label === 'Linked to task' || pill.label === 'Linked to follow-up');

  // Direction / state badges from Gmail labelIds. is_inbox stays
  // unrendered (Focused / All views already imply inbox); the Sent
  // chip surfaces whenever the message carries the SENT label so the
  // operator sees direction even in the rare self-sent edge case.
  const sentBadge = message.is_sent === true;
  const importantStar = message.is_important === true;
  const unreadSubject = message.is_unread === true;
  const subjectLabel = message.from_name ?? message.from_address ?? null;
  // Sender label flips to recipient-ish wording on Sent rows. Gmail's
  // metadata only carries the From header (always the sender, even on
  // sent mail — that's your own address); we surface it as-is and let
  // the leading Sent chip carry the direction signal.

  return (
    <li
      data-testid="dashboard-email-row"
      className="group hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {importantStar && (
            <Star
              data-testid="email-row-important-star"
              aria-label="Marked important by Gmail"
              className="text-warning-ink h-3.5 w-3.5 shrink-0 fill-current"
            />
          )}
          {sentBadge && (
            <span
              data-testid="email-row-sent-badge"
              aria-label="Sent by you"
              className="text-foreground-72 bg-surface-1 border-border inline-flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            >
              <Send className="h-2.5 w-2.5" aria-hidden /> Sent
            </span>
          )}
          <div
            data-testid="email-row-subject"
            data-unread={unreadSubject ? 'true' : 'false'}
            className={cn(
              'text-foreground line-clamp-1 text-sm',
              unreadSubject ? 'font-semibold' : 'font-medium',
            )}
          >
            {message.subject ?? '(no subject)'}
          </div>
        </div>
        <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
          <span className="text-foreground-72">
            {subjectLabel ?? 'Unknown sender'}
          </span>
          {message.snippet && (
            <>
              <span className="text-subtle-foreground"> — </span>
              <span>{message.snippet}</span>
            </>
          )}
        </div>
      </div>

      {pill && (
        <span
          className="self-center"
          data-testid={isLinkPill ? 'email-row-link-pill' : 'email-row-status-pill'}
        >
          <StatusChip tone={pill.tone} size="xs">
            {pill.label}
          </StatusChip>
        </span>
      )}

      <span className="text-subtle-foreground w-16 shrink-0 text-right text-xs tabular-nums">
        {whenLabel(message.internal_date)}
      </span>

      {showMenu && (
        <EmailRowActionMenu
          googleAccountId={googleAccountId}
          message={{
            gmailMessageId: message.id,
            gmailThreadId: message.thread_id,
            subject: message.subject,
            fromAddress: message.from_address,
            fromName: message.from_name,
            snippet: message.snippet || null,
            internalDate: message.internal_date,
          }}
          currentState={currentState}
        />
      )}

      {message.html_link && (
        <a
          href={message.html_link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in Gmail"
          className="text-muted-foreground hover:text-foreground shrink-0 self-center"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}
