import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useActivityInbox } from '@/hooks/useActivityInbox';
import {
  ActivityFilterChips,
  matchesFilter,
  type FilterKey,
} from '@/components/inbox/ActivityFilterChips';
import { ActivityRow } from '@/components/inbox/ActivityRow';
import { ActivityEmptyState } from '@/components/inbox/ActivityEmptyState';

const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'all',
  critical: 'critical',
  overdue: 'overdue',
  today: "due today",
  gmail: 'email',
  calendar: 'calendar',
  task: 'task',
  follow_up: 'follow-up',
  purchase: 'purchase',
  inspection_finding: 'finding',
  document: 'document',
  telegram: 'reminder',
};

export function ActivityInboxPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const inbox = useActivityInbox();

  const all = useMemo(() => inbox.data?.items ?? [], [inbox.data]);
  const filtered = useMemo(
    () => all.filter((i) => matchesFilter(i, filter)),
    [all, filter],
  );

  // Top-line counts for the header strip.
  const critical = all.filter((i) => i.severity === 'critical').length;
  const overdue = all.filter((i) => i.severity === 'overdue').length;
  const today = all.filter((i) => i.severity === 'due_today').length;
  const incoming = all.filter((i) => i.source === 'gmail' || i.source === 'telegram').length;

  // Surface partial failures without blanking the page.
  const warnings: string[] = [];
  if (inbox.data?.dbError) warnings.push(`Database: ${inbox.data.dbError}`);
  if (inbox.data?.gmailError) warnings.push(`Gmail: ${inbox.data.gmailError}`);
  if (inbox.data?.calendarError) warnings.push(`Calendar: ${inbox.data.calendarError}`);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Activity inbox
          </h1>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inbox.refetch()}
            disabled={inbox.isFetching}
            data-testid="inbox-refresh-button"
          >
            {inbox.isFetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {inbox.isLoading ? (
            'Loading…'
          ) : (
            <>
              <CountChip n={critical} label="critical" tone="destructive" />
              <CountChip n={overdue} label="overdue" tone="destructive" />
              <CountChip n={today} label="due today" tone="warning" />
              <CountChip n={incoming} label="incoming" tone="muted" />
            </>
          )}
        </p>
      </header>

      {warnings.length > 0 && (
        <div
          className="border-border bg-warning-soft text-warning-ink flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
          data-testid="inbox-warning-banner"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-medium">Some sources are degraded.</div>
            <ul className="space-y-0.5 opacity-90">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ActivityFilterChips items={all} active={filter} onSelect={setFilter} />

      {inbox.isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <ActivityEmptyState
          filtered={filter !== 'all' && all.length > 0}
          filterLabel={FILTER_LABEL[filter]}
        />
      ) : (
        <ul className="space-y-1.5" data-testid="inbox-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <ActivityRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CountChip({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: 'destructive' | 'warning' | 'muted';
}) {
  const empty = n === 0;
  return (
    <span
      className={cn(
        'mr-3 inline-flex items-baseline gap-1 text-xs',
        empty && 'text-subtle-foreground',
        !empty && tone === 'destructive' && 'text-destructive-ink',
        !empty && tone === 'warning' && 'text-warning-ink',
        !empty && tone === 'muted' && 'text-muted-foreground',
      )}
    >
      <span className="font-semibold tabular-nums">{n}</span>
      <span>{label}</span>
    </span>
  );
}
