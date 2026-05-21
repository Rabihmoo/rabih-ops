import { Link } from 'react-router-dom';
import { AlertTriangle, Check, MessageCircle, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/ui/status-chip';
import { BranchBadge } from '@/components/tasks/badges';
import type {
  FiredNotificationRow,
  NotificationChannel,
  NotificationRow,
  PendingNotificationRow,
} from '@/lib/notifications';

// Channel labels — only the two channels we actually emit appear in V1
// (in_app + telegram). The schema accepts email/calendar for forward
// compat, but no dispatcher writes them; if a row ever does appear with
// one of those channels, we fall through to a sentence-cased label.
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  telegram: 'Telegram',
  email: 'Email',
  calendar: 'Calendar',
};

function channelLabel(c: NotificationChannel): string {
  return CHANNEL_LABEL[c] ?? c;
}

// Map row state + log status to a single status chip the operator
// reads at a glance.
function statusChipFor(row: NotificationRow) {
  if (row.state === 'pending') {
    return <StatusChip tone="muted" size="xs">Upcoming</StatusChip>;
  }
  if (row.status === 'failed') {
    return (
      <StatusChip tone="critical" size="xs" icon={AlertTriangle}>
        Failed
      </StatusChip>
    );
  }
  return (
    <StatusChip tone="success" size="xs" icon={Check}>
      Sent
    </StatusChip>
  );
}

// Channel chip uses StatusChip with a tone that matches the rest of
// the app: Telegram is info (matches Settings card), in_app is muted.
function channelChipFor(channel: NotificationChannel) {
  const Icon = channel === 'telegram' ? Send : MessageCircle;
  const tone = channel === 'telegram' ? 'info' : 'muted';
  return (
    <StatusChip tone={tone} size="xs" icon={Icon}>
      {channelLabel(channel)}
    </StatusChip>
  );
}

function entityHref(row: NotificationRow): string | null {
  if (row.entity_type === 'task') return `/tasks/${row.entity_id}`;
  if (row.entity_type === 'follow_up') return `/follow-ups/${row.entity_id}`;
  return null;
}

function fallbackTitle(row: NotificationRow): string {
  const payload = row.payload;
  if (payload && typeof payload === 'object' && 'title' in payload) {
    const t = (payload as { title?: unknown }).title;
    if (typeof t === 'string' && t.length > 0) return t;
  }
  if (row.entity_type === 'task') return '(deleted task)';
  if (row.entity_type === 'follow_up') return '(deleted follow-up)';
  return '(deleted item)';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const absDiff = Math.abs(diff);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  const future = diff < 0;

  const fmt = (n: number, unit: string) =>
    future ? `in ${n}${unit}` : `${n}${unit} ago`;

  if (absDiff < min) return future ? 'soon' : 'just now';
  if (absDiff < hour) return fmt(Math.round(absDiff / min), 'm');
  if (absDiff < day) return fmt(Math.round(absDiff / hour), 'h');
  if (absDiff < 7 * day) return fmt(Math.round(absDiff / day), 'd');
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export interface NotificationRowActions {
  onMarkRead?: (row: FiredNotificationRow) => void;
  onCancel?: (row: PendingNotificationRow) => void;
  isMarkReadPending?: boolean;
  isCancelPending?: boolean;
}

export function NotificationRowView({
  row,
  actions,
}: {
  row: NotificationRow;
  actions?: NotificationRowActions;
}) {
  const isFired = row.state === 'fired';
  const isUnread = isFired && row.read_at === null;
  const href = entityHref(row);
  const title = row.entity?.title ?? fallbackTitle(row);
  const branch = row.entity?.branch ?? null;

  return (
    <article
      data-testid="notification-row"
      data-state={row.state}
      data-read={isFired ? (row.read_at ? 'read' : 'unread') : 'pending'}
      className={cn(
        'border-border bg-surface-1 group relative flex flex-col gap-2 rounded-md border px-4 py-3 transition-colors',
        'sm:flex-row sm:items-center sm:gap-4',
        isUnread && 'border-l-primary border-l-2 pl-[15px]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {href ? (
            <Link
              to={href}
              className={cn(
                'text-foreground line-clamp-1 text-sm hover:underline',
                isUnread ? 'font-semibold' : 'font-medium',
              )}
            >
              {title}
            </Link>
          ) : (
            <span
              className={cn(
                'text-muted-foreground line-clamp-1 text-sm',
                isUnread ? 'font-semibold' : 'font-medium',
              )}
            >
              {title}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {statusChipFor(row)}
          {channelChipFor(row.channel)}
          {branch && <BranchBadge branch={branch} />}
          <span className="text-subtle-foreground text-xs tabular-nums">
            {relativeTime(row.effective_at)}
          </span>
          {row.state === 'fired' && row.status === 'failed' && row.error && (
            <span className="text-destructive-ink ml-1 line-clamp-1 text-xs">
              {row.error}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isUnread && actions?.onMarkRead && (
          <button
            type="button"
            disabled={actions.isMarkReadPending}
            onClick={() => actions.onMarkRead?.(row as FiredNotificationRow)}
            className={cn(
              'text-foreground-72 hover:text-foreground rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              'hover:bg-surface-2 disabled:opacity-50',
            )}
            data-testid="notification-mark-read"
          >
            Mark read
          </button>
        )}
        {row.state === 'pending' && actions?.onCancel && (
          <button
            type="button"
            disabled={actions.isCancelPending}
            onClick={() => actions.onCancel?.(row)}
            className={cn(
              'text-destructive-ink hover:text-destructive-ink inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              'hover:bg-destructive-soft disabled:opacity-50',
            )}
            data-testid="notification-cancel"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        )}
      </div>
    </article>
  );
}
