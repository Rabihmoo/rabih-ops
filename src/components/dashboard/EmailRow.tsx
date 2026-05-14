import { ExternalLink } from 'lucide-react';
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

  return (
    <li
      data-testid="dashboard-email-row"
      className="group hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {message.subject ?? '(no subject)'}
        </div>
        <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
          <span className="text-foreground-72">
            {message.from_name ?? message.from_address ?? 'Unknown sender'}
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
