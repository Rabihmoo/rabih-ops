import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { useActivityInbox } from '@/hooks/useActivityInbox';
import { ActivityFilterChips } from '@/components/inbox/ActivityFilterChips';
import {
  isValidFilterKey,
  matchesFilter,
  type FilterKey,
} from '@/components/inbox/activity-filter-utils';
import { ActivityRow } from '@/components/inbox/ActivityRow';
import { ActivityEmptyState } from '@/components/inbox/ActivityEmptyState';
import { ActivityListSkeleton } from '@/components/inbox/ActivityRowSkeleton';
import { SourceStatusNotice } from '@/components/inbox/SourceStatusNotice';
import { composeAllSuggestions } from '@/lib/inbox-suggestions/compose';
import {
  dismissSuggestion as persistDismissal,
  isDismissed as isDismissedIn,
  loadDismissed,
  pruneStale,
  type DismissedMap,
} from '@/lib/inbox-suggestions/dismiss';
import { GMAIL_RULES } from '@/lib/inbox-suggestions/rules/gmail';
import { CALENDAR_RULES } from '@/lib/inbox-suggestions/rules/calendar';
import { TELEGRAM_RULES } from '@/lib/inbox-suggestions/rules/telegram';
import { TASK_RULES } from '@/lib/inbox-suggestions/rules/task';
import { FOLLOWUP_RULES } from '@/lib/inbox-suggestions/rules/followup';
import { PURCHASE_RULES } from '@/lib/inbox-suggestions/rules/purchase';
import { FINDING_RULES } from '@/lib/inbox-suggestions/rules/finding';
import { DOCUMENT_RULES } from '@/lib/inbox-suggestions/rules/document';
import type { Suggestion } from '@/lib/inbox-suggestions/types';

const ALL_RULES = [
  ...GMAIL_RULES,
  ...CALENDAR_RULES,
  ...TELEGRAM_RULES,
  ...TASK_RULES,
  ...FOLLOWUP_RULES,
  ...PURCHASE_RULES,
  ...FINDING_RULES,
  ...DOCUMENT_RULES,
];

const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'all',
  critical: 'critical',
  overdue: 'overdue',
  today: "due today",
  today_emails: "today's emails",
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
  // Filter state lives in the URL so reload + back/forward preserve it.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');
  const filter: FilterKey = isValidFilterKey(filterParam) ? filterParam : 'all';

  const setFilter = useCallback(
    (key: FilterKey) => {
      const next = new URLSearchParams(searchParams);
      if (key === 'all') next.delete('filter');
      else next.set('filter', key);
      // Push so back/forward navigates between filter states.
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const inbox = useActivityInbox();

  const all = useMemo(() => inbox.data?.items ?? [], [inbox.data]);
  const filtered = useMemo(
    () => all.filter((i) => matchesFilter(i, filter)),
    [all, filter],
  );

  // Suggestion machinery -------------------------------------------------
  // dismissed map is loaded once on mount + pruned to <=30 days.
  const [dismissed, setDismissed] = useState<DismissedMap>(() =>
    pruneStale(loadDismissed()),
  );
  useEffect(() => {
    // Prune once per mount; loadDismissed already runs in the state initializer.
    setDismissed((m) => pruneStale(m));
  }, []);
  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    setDismissed(persistDismissal(suggestionId));
  }, []);

  const suggestionsByItem = useMemo<Map<string, Suggestion[]>>(() => {
    if (all.length === 0) return new Map();
    try {
      // maxPerItem=8 lets the SuggestionStrip show top-3 by default
      // with a "+N more" toggle that reveals the rest. Per-action cap
      // stays at the orchestrator default (2) so we never flood a row
      // with five "link to existing" of the same type.
      return composeAllSuggestions(all, {
        rules: ALL_RULES,
        isDismissed: (id) => isDismissedIn(id, dismissed),
        maxPerItem: 8,
      });
    } catch {
      // A bug in any rule should never blank the inbox.
      return new Map();
    }
  }, [all, dismissed]);

  // Top-line counts for the header strip.
  const critical = all.filter((i) => i.severity === 'critical').length;
  const overdue = all.filter((i) => i.severity === 'overdue').length;
  const today = all.filter((i) => i.severity === 'due_today').length;
  const incoming = all.filter((i) => i.source === 'gmail' || i.source === 'telegram').length;

  // Errors surface in the warning banner; disconnected sources surface
  // in the SourceStatusNotice strip below it.
  const warnings: string[] = [];
  if (inbox.data?.dbError) warnings.push(`Database: ${inbox.data.dbError}`);
  if (inbox.data?.gmailError) warnings.push(`Gmail: ${inbox.data.gmailError}`);
  if (inbox.data?.calendarError) warnings.push(`Calendar: ${inbox.data.calendarError}`);

  const isRefreshing = inbox.isFetching && !inbox.isLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Triage"
        title="Activity inbox"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => inbox.refetch()}
            disabled={inbox.isFetching}
            aria-busy={inbox.isFetching}
            data-testid="inbox-refresh-button"
          >
            {inbox.isFetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1 h-4 w-4" />
            )}
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
        stats={
          inbox.isLoading ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : (
            <>
              <HeaderStat count={critical} label="critical" tone="destructive" />
              <HeaderStat count={overdue} label="overdue" tone="destructive" />
              <HeaderStat count={today} label="due today" tone="warning" />
              <HeaderStat count={incoming} label="incoming" tone="muted" />
            </>
          )
        }
      />

      {warnings.length > 0 && (
        <div
          className="border-border bg-warning-soft text-warning-ink relative flex items-start gap-2 overflow-hidden rounded-lg border px-3 py-2.5 pl-4 text-xs"
          data-testid="inbox-warning-banner"
        >
          <span aria-hidden className="bg-warning absolute left-0 top-0 bottom-0 w-1" />
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

      {inbox.data && (
        <SourceStatusNotice
          statuses={[
            { source: 'gmail',    connected: inbox.data.gmailConnected },
            { source: 'calendar', connected: inbox.data.calendarConnected },
          ]}
        />
      )}

      <ActivityFilterChips items={all} active={filter} onSelect={setFilter} />

      {inbox.isLoading ? (
        <ActivityListSkeleton />
      ) : filtered.length === 0 ? (
        <ActivityEmptyState
          filtered={filter !== 'all' && all.length > 0}
          filterLabel={FILTER_LABEL[filter]}
        />
      ) : (
        <SectionedList
          items={filtered}
          suggestionsByItem={suggestionsByItem}
          onDismissSuggestion={handleDismissSuggestion}
        />
      )}
    </div>
  );
}

// =========================================================
// Sectioned list — groups items by severity with headers
// =========================================================

const SEVERITY_ORDER = ['critical', 'overdue', 'due_today', 'soon', 'info'] as const;

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  overdue: 'Overdue',
  due_today: 'Due today',
  soon: 'Coming up',
  info: 'Other',
};

function SectionedList({
  items,
  suggestionsByItem,
  onDismissSuggestion,
}: {
  items: import('@/lib/activity-inbox').ActivityItem[];
  suggestionsByItem: Map<string, Suggestion[]>;
  onDismissSuggestion: (id: string) => void;
}) {
  // Group items by severity
  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.severity;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return SEVERITY_ORDER
      .filter((s) => map.has(s))
      .map((s) => ({ severity: s, label: SEVERITY_LABEL[s], items: map.get(s)! }));
  }, [items]);

  // Skip section headers if all items are in one group
  if (groups.length <= 1) {
    return (
      <ul className="space-y-2" data-testid="inbox-list">
        {items.map((item) => (
          <li key={item.id}>
            <ActivityRow
              item={item}
              suggestions={suggestionsByItem.get(item.id) ?? []}
              onDismissSuggestion={onDismissSuggestion}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4" data-testid="inbox-list">
      {groups.map((g) => (
        <section key={g.severity}>
          <div className="text-foreground-56 mb-2 text-xs font-semibold uppercase tracking-wider" data-testid={`inbox-section-${g.severity}`}>
            {g.label} <span className="text-foreground-40 tabular-nums">({g.items.length})</span>
          </div>
          <ul className="space-y-2">
            {g.items.map((item) => (
              <li key={item.id}>
                <ActivityRow
                  item={item}
                  suggestions={suggestionsByItem.get(item.id) ?? []}
                  onDismissSuggestion={onDismissSuggestion}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
