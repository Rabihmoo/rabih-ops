import { useMemo, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import { NotificationRowView } from '@/components/notifications/NotificationRow';
import {
  useCancelMyPendingReminder,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from '@/hooks/useNotifications';
import {
  groupNotificationsByDay,
  type NotificationChannel,
  type NotificationRow,
} from '@/lib/notifications';

// V1 channels rendered as filter chips. The schema accepts email/calendar
// for forward compat but no dispatcher writes them today (verified
// against staging dispatcher inserts). We still render chips only for
// channels actually present in the response, so a chip never sits dead.
const KNOWN_CHANNELS: NotificationChannel[] = ['in_app', 'telegram'];
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  telegram: 'Telegram',
  email: 'Email',
  calendar: 'Calendar',
};

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [channel, setChannel] = useState<NotificationChannel | null>(null);

  // The page lives off two queries: the full list (subject to filters)
  // and the unread count (channel-agnostic so the header always shows
  // the same number the topbar will show in 7.4).
  const list = useNotificationsList({ limit: 200, unreadOnly, channel });
  const unread = useUnreadNotificationCount();

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const cancelPending = useCancelMyPendingReminder();

  // Stabilize `rows` reference so the downstream useMemos don't recompute
  // every render. `list.data` already changes identity only on refetch.
  const rows = useMemo<NotificationRow[]>(() => list.data ?? [], [list.data]);

  // Channels actually present in the current result set — chips for
  // anything else stay hidden so the filter row never offers a click
  // that returns zero rows.
  const presentChannels = useMemo(() => {
    const seen = new Set<NotificationChannel>();
    for (const r of rows) seen.add(r.channel);
    return KNOWN_CHANNELS.filter((c) => seen.has(c));
  }, [rows]);

  const groups = useMemo(() => groupNotificationsByDay(rows), [rows]);

  const unreadCount = unread.data ?? 0;
  const totalCount = rows.length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Notifications"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            data-testid="mark-all-read"
          >
            {markAllRead.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            )}
            Mark all read
          </Button>
        }
        stats={
          list.isLoading && !list.data ? (
            <span>Loading…</span>
          ) : (
            <>
              <HeaderStat
                count={unreadCount}
                label="unread"
                tone={unreadCount > 0 ? 'warning' : 'muted'}
              />
              <HeaderStat
                count={totalCount}
                label={totalCount === 1 ? 'total' : 'total'}
                tone="muted"
              />
            </>
          )
        }
      />

      <p className="text-muted-foreground -mt-2 text-sm">
        Every reminder fired by RabihOS for you, plus what's scheduled
        next. Failed deliveries surface here in red so you can see when
        a Telegram or in-app push didn't land.
      </p>

      <FilterRow
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={setUnreadOnly}
        channel={channel}
        onChannelChange={setChannel}
        presentChannels={presentChannels}
      />

      {list.isLoading && (
        <div className="text-muted-foreground border-border bg-card rounded-lg border p-6 text-sm">
          Loading notifications…
        </div>
      )}
      {list.error && (
        <div className="text-destructive-ink border-destructive/30 bg-destructive-soft/40 rounded-lg border p-6 text-sm">
          Could not load notifications: {(list.error as Error).message}
        </div>
      )}
      {!list.isLoading && !list.error && rows.length === 0 && (
        <div className="border-border bg-card rounded-lg border">
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            description={
              unreadOnly
                ? "You're all caught up."
                : 'Reminders set on your tasks and follow-ups will land here once they fire.'
            }
            tone="muted"
          />
        </div>
      )}

      {!list.isLoading && !list.error && groups.length > 0 && (
        <div className="space-y-6" data-testid="notifications-list">
          {groups.map((g) => (
            <section key={g.bucket} aria-label={g.label}>
              <h2 className="text-section-label text-primary-ink/80 mb-2">
                {g.label}
                <span className="text-muted-foreground ml-2 tabular-nums normal-case tracking-normal">
                  {g.rows.length}
                </span>
              </h2>
              <ul className="space-y-1.5">
                {g.rows.map((r) => (
                  <li key={r.state === 'fired' ? `f-${r.log_id}` : `p-${r.queue_id}`}>
                    <NotificationRowView
                      row={r}
                      actions={{
                        onMarkRead: (row) => markRead.mutate(row.log_id),
                        onCancel: (row) => cancelPending.mutate(row.queue_id),
                        isMarkReadPending: markRead.isPending,
                        isCancelPending: cancelPending.isPending,
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  unreadOnly,
  onUnreadOnlyChange,
  channel,
  onChannelChange,
  presentChannels,
}: {
  unreadOnly: boolean;
  onUnreadOnlyChange: (v: boolean) => void;
  channel: NotificationChannel | null;
  onChannelChange: (v: NotificationChannel | null) => void;
  presentChannels: NotificationChannel[];
}) {
  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1.5">
        <Chip selected={!unreadOnly} onClick={() => onUnreadOnlyChange(false)}>
          All
        </Chip>
        <Chip selected={unreadOnly} onClick={() => onUnreadOnlyChange(true)}>
          Unread only
        </Chip>
      </div>
      {presentChannels.length > 0 && (
        <>
          <span className="bg-border h-4 w-px" aria-hidden />
          <div className="flex items-center gap-1.5">
            <Chip
              selected={channel === null}
              onClick={() => onChannelChange(null)}
            >
              All channels
            </Chip>
            {presentChannels.map((c) => (
              <Chip
                key={c}
                selected={channel === c}
                onClick={() => onChannelChange(c)}
                data-testid={`channel-chip-${c}`}
              >
                {CHANNEL_LABEL[c]}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
  ...rest
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-pill px-3 py-1 text-xs font-medium transition-colors',
        selected
          ? 'bg-primary-soft text-primary-ink ring-primary/30 ring-1'
          : 'text-foreground-72 hover:bg-surface-2 hover:text-foreground',
      )}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  );
}
