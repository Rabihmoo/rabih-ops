import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CircleDollarSign,
  Clock,
  Hand,
  ListChecks,
  Loader2,
  PackageCheck,
  PhoneCall,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardTile } from '@/components/ui/dashboard-tile';
import { AmbientBackground } from '@/components/ui/ambient-background';
import { PageHeader } from '@/components/shared/PageHeader';
import { useCurrentUserProfile, useSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useTaskFiltersStore, type TaskBucket } from '@/stores/taskFiltersStore';
import { useFollowUpFiltersStore } from '@/stores/followUpFiltersStore';
import { listTasks, type TaskListFilters } from '@/lib/tasks';
import { listFollowUps, effectiveDueDate } from '@/lib/follow-ups';
import { listCriticalFindings, type CriticalFinding } from '@/lib/inspections';
import {
  formatCurrency,
  formatQty,
  listPurchaseDashboard,
  type PendingDelivery,
  type PurchaseReminder,
  type UnpaidPurchase,
} from '@/lib/purchase-requests';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import { EmptyState } from '@/components/shared/EmptyState';
import { DashboardCalendarToday } from '@/components/dashboard/DashboardCalendarToday';
import { DashboardImportantEmails } from '@/components/dashboard/DashboardImportantEmails';
import { DashboardPendingEmails } from '@/components/dashboard/DashboardPendingEmails';
import { DashboardTodayEmails } from '@/components/dashboard/DashboardTodayEmails';
import { useDismissReminder, useMyReminders } from '@/hooks/useReminders';
import {
  REMINDER_KIND_LABEL,
  reminderTargetPath,
  type MyReminder,
} from '@/lib/reminders';
import { toast } from '@/components/ui/toast';
import type {
  Currency,
  FollowUpRow,
  TaskPriority,
  TaskRow,
} from '@/types/database';

// =========================================================
// Data hooks (unchanged from prior dashboard)
// =========================================================

const todayIso = () => new Date().toISOString().slice(0, 10);

function useBucketTasks(bucket: TaskBucket, userId: string | undefined) {
  const today = todayIso();

  let filters: TaskListFilters = { limit: 50 };
  switch (bucket) {
    case 'today':
      filters = { ...filters, dueBefore: today, dueAfter: today };
      break;
    case 'overdue':
      filters = { ...filters, dueBefore: today };
      break;
    case 'mine':
      filters = { ...filters, assignedTo: userId ?? null };
      break;
    case 'waiting':
      filters = { ...filters, status: 'waiting_for_someone' };
      break;
    case 'delayed':
      filters = { ...filters, status: 'delayed' };
      break;
    case 'repeat':
      filters = { ...filters, status: 'needs_repeat' };
      break;
    case 'history':
      filters = { ...filters, includeDone: true, includeArchived: true };
      break;
    case 'active':
    default:
      break;
  }

  return useQuery({
    queryKey: ['tasks', 'dashboard', bucket, userId, today],
    queryFn: async (): Promise<TaskRow[]> => {
      const rows = await listTasks(filters);
      if (bucket === 'overdue') {
        return rows.filter(
          (t) =>
            t.due_date != null &&
            t.due_date < today &&
            t.status !== 'finished' &&
            t.status !== 'archived',
        );
      }
      return rows;
    },
    enabled: bucket === 'mine' ? !!userId : true,
  });
}

function useFollowUpsDueToday() {
  const today = todayIso();
  return useQuery({
    queryKey: ['follow-ups', 'dashboard', 'today', today],
    queryFn: async (): Promise<FollowUpRow[]> => {
      const rows = await listFollowUps({
        dueBefore: today,
        dueAfter: today,
        limit: 50,
      });
      return rows.filter((r) => r.status !== 'done' && r.status !== 'cancelled');
    },
  });
}

function useDashboardCriticalFindings() {
  return useQuery({
    queryKey: ['inspections', 'dashboard', 'critical-findings'],
    queryFn: () => listCriticalFindings(20),
  });
}

function useDashboardPurchases() {
  return useQuery({
    queryKey: ['purchases', 'dashboard'],
    queryFn: () => listPurchaseDashboard(20),
  });
}

// =========================================================
// Greeting + date helpers
// =========================================================

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

function todayHumanLabel(): string {
  // Pinned to en-US so the dashboard chrome reads the same on every machine,
  // regardless of browser locale. Switch to a user-preference setting later
  // if multi-language UX is added.
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// =========================================================
// Tone (urgency color) mapping
// =========================================================

type Tone = 'destructive' | 'warning' | 'primary' | 'muted';

const TONE_CLASS: Record<
  Tone,
  { number: string; label: string; icon: string; bar: string }
> = {
  destructive: {
    number: 'text-destructive-ink',
    label: 'text-destructive-ink',
    icon: 'text-destructive',
    bar: 'bg-destructive',
  },
  warning: {
    number: 'text-warning-ink',
    label: 'text-warning-ink',
    icon: 'text-warning',
    bar: 'bg-warning',
  },
  primary: {
    number: 'text-primary-ink',
    label: 'text-primary-ink',
    icon: 'text-primary',
    bar: 'bg-primary',
  },
  muted: {
    number: 'text-foreground-72',
    label: 'text-muted-foreground',
    icon: 'text-muted-foreground',
    bar: 'bg-border',
  },
};

// =========================================================
// Compact rows for the lists below the tiles
// =========================================================

function relativeDue(due: string | null, now: Date): { text: string; tone: Tone } {
  if (!due) return { text: 'No date', tone: 'muted' };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(due + 'T00:00:00');
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, tone: 'destructive' };
  if (diffDays === 0) return { text: 'Today', tone: 'warning' };
  if (diffDays === 1) return { text: 'Tomorrow', tone: 'muted' };
  return { text: `In ${diffDays}d`, tone: 'muted' };
}

const DUE_TONE_CLASS: Record<Tone, string> = {
  destructive: 'text-destructive-ink',
  warning: 'text-warning-ink',
  primary: 'text-primary-ink',
  muted: 'text-muted-foreground',
};

function BranchTag({ branch }: { branch: string | null }) {
  if (!branch) {
    return <span className="text-subtle-foreground">cross-branch</span>;
  }
  const meta = (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
    branch as BranchCode
  ];
  if (!meta) {
    return <span className="text-subtle-foreground">{branch}</span>;
  }
  return (
    <span className="text-foreground-72 inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.name}
    </span>
  );
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  if (priority === 'urgent') {
    return (
      <span className="bg-destructive-soft text-destructive-ink rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        urgent
      </span>
    );
  }
  if (priority === 'low') {
    return (
      <span className="text-subtle-foreground text-[10px] uppercase tracking-wider">low</span>
    );
  }
  return null;
}

function DashboardTaskRow({ task, now }: { task: TaskRow; now: Date }) {
  const due = relativeDue(task.due_date, now);
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">{task.title}</div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <BranchTag branch={task.branch} />
          <PriorityChip priority={task.priority as TaskPriority} />
        </div>
      </div>
      <span className={cn('shrink-0 text-xs font-medium tabular-nums', DUE_TONE_CLASS[due.tone])}>
        {due.text}
      </span>
    </Link>
  );
}

function DashboardFollowUpRow({
  followUp,
  now,
}: {
  followUp: FollowUpRow;
  now: Date;
}) {
  const due = relativeDue(effectiveDueDate(followUp), now);
  return (
    <Link
      to={`/follow-ups/${followUp.id}`}
      className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {followUp.title}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <span className="capitalize">{followUp.category.replace('_', ' ')}</span>
          {followUp.person && (
            <>
              <span className="text-subtle-foreground">·</span>
              <span>{followUp.person}</span>
            </>
          )}
          {followUp.branch && (
            <>
              <span className="text-subtle-foreground">·</span>
              <BranchTag branch={followUp.branch} />
            </>
          )}
        </div>
      </div>
      <span className={cn('shrink-0 text-xs font-medium tabular-nums', DUE_TONE_CLASS[due.tone])}>
        {due.text}
      </span>
    </Link>
  );
}

// =========================================================
// Compact list section
// =========================================================

function CompactList<T>({
  label,
  count,
  tone,
  items,
  isLoading,
  emptyText,
  viewAllTo,
  onViewAll,
  renderItem,
}: {
  label: string;
  count: number;
  tone: Tone;
  items: T[];
  isLoading: boolean;
  emptyText: string;
  viewAllTo: string;
  onViewAll: () => void;
  renderItem: (item: T) => React.ReactNode;
}) {
  const t = TONE_CLASS[count > 0 ? tone : 'muted'];
  const previewCount = 5;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="border-border mb-2 flex items-baseline justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.bar)} />
            <span className={cn('text-xs font-semibold uppercase tracking-wider', t.label)}>
              {label}
            </span>
            <span className={cn('text-xs tabular-nums', t.label)}>{count}</span>
          </div>
          {count > 0 && (
            <Link
              to={viewAllTo}
              onClick={onViewAll}
              className="text-muted-foreground hover:text-foreground inline-flex items-center text-xs"
            >
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          )}
        </div>
        {isLoading ? (
          <div className="text-muted-foreground py-3 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground py-3 text-sm">{emptyText}</div>
        ) : (
          <>
            <div className="divide-border divide-y">
              {items.slice(0, previewCount).map(renderItem)}
            </div>
            {items.length > previewCount && (
              <div className="text-subtle-foreground pt-3 text-xs">
                + {items.length - previewCount} more
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================================
// Page
// =========================================================

export function DashboardPage() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const userId = useAuthStore((s) => s.profile?.id);

  const setTaskBucket = useTaskFiltersStore((s) => s.setBucket);
  const resetTaskGranular = useTaskFiltersStore((s) => s.resetGranular);
  const setFollowUpBucket = useFollowUpFiltersStore((s) => s.setBucket);
  const resetFollowUpGranular = useFollowUpFiltersStore((s) => s.resetGranular);

  const overdue = useBucketTasks('overdue', userId);
  const today = useBucketTasks('today', userId);
  const mine = useBucketTasks('mine', userId);
  const waiting = useBucketTasks('waiting', userId);
  const delayed = useBucketTasks('delayed', userId);
  const repeat = useBucketTasks('repeat', userId);
  const followUpsToday = useFollowUpsDueToday();
  const criticalFindings = useDashboardCriticalFindings();
  const purchases = useDashboardPurchases();
  const reminders = useMyReminders({ unreadOnly: true, limit: 50 });
  const dismissReminder = useDismissReminder();
  const pendingDeliveries = purchases.data?.pending_deliveries ?? [];
  const unpaidPurchases = purchases.data?.unpaid ?? [];
  const purchaseReminders = purchases.data?.reminders_today ?? [];

  const displayName = profile?.full_name ?? session?.user.email?.split('@')[0] ?? 'there';
  const greeting = timeOfDayGreeting();
  const dateLabel = todayHumanLabel();

  const goToTasksBucket = (bucket: TaskBucket) => () => {
    resetTaskGranular();
    setTaskBucket(bucket);
  };
  const goToFollowUpsToday = () => {
    resetFollowUpGranular();
    setFollowUpBucket('today');
  };

  const now = new Date();

  // "All clear" — every actionable list is empty AND not loading.
  const ready =
    !overdue.isLoading &&
    !today.isLoading &&
    !followUpsToday.isLoading &&
    !criticalFindings.isLoading &&
    !waiting.isLoading &&
    !delayed.isLoading &&
    !repeat.isLoading &&
    !purchases.isLoading;
  const allClear =
    ready &&
    (overdue.data?.length ?? 0) === 0 &&
    (today.data?.length ?? 0) === 0 &&
    (waiting.data?.length ?? 0) === 0 &&
    (delayed.data?.length ?? 0) === 0 &&
    (repeat.data?.length ?? 0) === 0 &&
    (followUpsToday.data?.length ?? 0) === 0 &&
    (criticalFindings.data?.length ?? 0) === 0 &&
    (reminders.data?.length ?? 0) === 0 &&
    pendingDeliveries.length === 0 &&
    unpaidPurchases.length === 0 &&
    purchaseReminders.length === 0;

  return (
    <AmbientBackground intensity="subtle" className="-mx-4 -mt-4 -mb-[76px] px-4 pt-4 pb-[76px] md:-mx-6 md:-my-6 md:px-6 md:py-6">
      <div className="space-y-6">
      <PageHeader
        eyebrow={dateLabel}
        title={`${greeting}, ${displayName}.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <DashboardTile
          label="Critical findings"
          tone="destructive"
          icon={ShieldAlert}
          count={criticalFindings.data?.length ?? null}
          isLoading={criticalFindings.isLoading}
          to="/inspections"
          onView={() => {
            /* no bucket — list shows recent inspections, findings opened via detail */
          }}
        />
        <DashboardTile
          label="Overdue"
          tone="destructive"
          icon={AlertTriangle}
          count={overdue.data?.length ?? null}
          isLoading={overdue.isLoading}
          to="/tasks"
          onView={goToTasksBucket('overdue')}
        />
        <DashboardTile
          label="Today"
          tone="warning"
          icon={ListChecks}
          count={today.data?.length ?? null}
          isLoading={today.isLoading}
          to="/tasks"
          onView={goToTasksBucket('today')}
        />
        <DashboardTile
          label="My tasks"
          tone="primary"
          icon={Clock}
          count={mine.data?.length ?? null}
          isLoading={mine.isLoading}
          to="/tasks"
          onView={goToTasksBucket('mine')}
        />
        <DashboardTile
          label="Waiting"
          tone="warning"
          icon={Hand}
          count={waiting.data?.length ?? null}
          isLoading={waiting.isLoading}
          to="/tasks"
          onView={goToTasksBucket('waiting')}
        />
        <DashboardTile
          label="Delayed"
          tone="destructive"
          icon={TimerReset}
          count={delayed.data?.length ?? null}
          isLoading={delayed.isLoading}
          to="/tasks"
          onView={goToTasksBucket('delayed')}
        />
        <DashboardTile
          label="Needs repeat"
          tone="destructive"
          icon={Repeat2}
          count={repeat.data?.length ?? null}
          isLoading={repeat.isLoading}
          to="/tasks"
          onView={goToTasksBucket('repeat')}
        />
        <DashboardTile
          label="Follow-ups today"
          tone="primary"
          icon={PhoneCall}
          count={followUpsToday.data?.length ?? null}
          isLoading={followUpsToday.isLoading}
          to="/follow-ups"
          onView={goToFollowUpsToday}
        />
      </div>

      {/* Today's Google Calendar — under the stat tiles, above the
          actionable lists. Renders nothing when not connected. */}
      <DashboardCalendarToday />

      {/* RabihOS-pending emails (DB-only — survives Gmail age-out).
          Self-hides when 0 pending or Gmail not connected. */}
      <DashboardPendingEmails />

      {/* Today's Gmail messages (since local midnight in PROJECT_TZ).
          Renders nothing when not connected. */}
      <DashboardTodayEmails />

      {/* Important unread Gmail messages from the last 7 days.
          Renders nothing when not connected. */}
      <DashboardImportantEmails />

      {allClear ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldCheck}
              tone="success"
              size="tall"
              title="All clear."
              description="Nothing overdue, nothing due today, no follow-ups to chase, no critical findings open."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(reminders.data?.length ?? 0) > 0 && (
            <CompactList
              label="Reminders"
              tone="primary"
              count={reminders.data?.length ?? 0}
              items={reminders.data ?? []}
              isLoading={reminders.isLoading}
              emptyText="No new reminders."
              viewAllTo="/"
              onViewAll={() => {}}
              renderItem={(r: MyReminder) => (
                <DashboardReminderRow
                  key={r.id}
                  reminder={r}
                  isDismissing={dismissReminder.isPending}
                  onDismiss={async () => {
                    try {
                      await dismissReminder.mutateAsync(r.id);
                    } catch (err) {
                      toast({
                        title: 'Could not dismiss',
                        description: err instanceof Error ? err.message : 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  }}
                />
              )}
            />
          )}

          {(criticalFindings.data?.length ?? 0) > 0 && (
            <CompactList
              label="Critical findings"
              tone="destructive"
              count={criticalFindings.data?.length ?? 0}
              items={criticalFindings.data ?? []}
              isLoading={criticalFindings.isLoading}
              emptyText="No open critical findings."
              viewAllTo="/inspections"
              onViewAll={() => {}}
              renderItem={(f) => <DashboardCriticalFindingRow key={f.id} finding={f} />}
            />
          )}

          {(pendingDeliveries.length > 0 ||
            unpaidPurchases.length > 0 ||
            purchaseReminders.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {pendingDeliveries.length > 0 && (
                <CompactList
                  label="Pending deliveries"
                  tone={
                    pendingDeliveries.some((p) => p.is_overdue)
                      ? 'destructive'
                      : 'warning'
                  }
                  count={pendingDeliveries.length}
                  items={pendingDeliveries}
                  isLoading={false}
                  emptyText="No deliveries scheduled."
                  viewAllTo="/purchases"
                  onViewAll={() => {}}
                  renderItem={(p) => (
                    <DashboardPendingDeliveryRow key={p.id} delivery={p} />
                  )}
                />
              )}
              {unpaidPurchases.length > 0 && (
                <CompactList
                  label="Unpaid purchases"
                  tone="warning"
                  count={unpaidPurchases.length}
                  items={unpaidPurchases}
                  isLoading={false}
                  emptyText="Everything's paid up."
                  viewAllTo="/purchases"
                  onViewAll={() => {}}
                  renderItem={(p) => <DashboardUnpaidRow key={p.id} purchase={p} />}
                />
              )}
              {purchaseReminders.length > 0 && (
                <CompactList
                  label="Reminders today"
                  tone="primary"
                  count={purchaseReminders.length}
                  items={purchaseReminders}
                  isLoading={false}
                  emptyText="No reminders today."
                  viewAllTo="/purchases"
                  onViewAll={() => {}}
                  renderItem={(p) => (
                    <DashboardPurchaseReminderRow key={p.id} reminder={p} />
                  )}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CompactList
              label="Overdue"
              tone="destructive"
              count={overdue.data?.length ?? 0}
              items={overdue.data ?? []}
              isLoading={overdue.isLoading}
              emptyText="Nothing overdue. Stay on top of it."
              viewAllTo="/tasks"
              onViewAll={goToTasksBucket('overdue')}
              renderItem={(t) => <DashboardTaskRow key={t.id} task={t} now={now} />}
            />
            <CompactList
              label="Due today"
              tone="warning"
              count={today.data?.length ?? 0}
              items={today.data ?? []}
              isLoading={today.isLoading}
              emptyText="Nothing scheduled for today."
              viewAllTo="/tasks"
              onViewAll={goToTasksBucket('today')}
              renderItem={(t) => <DashboardTaskRow key={t.id} task={t} now={now} />}
            />
            <CompactList
              label="Follow-ups today"
              tone="primary"
              count={followUpsToday.data?.length ?? 0}
              items={followUpsToday.data ?? []}
              isLoading={followUpsToday.isLoading}
              emptyText="No follow-ups due today."
              viewAllTo="/follow-ups"
              onViewAll={goToFollowUpsToday}
              renderItem={(f) => (
                <DashboardFollowUpRow key={f.id} followUp={f} now={now} />
              )}
            />
          </div>

          {((waiting.data?.length ?? 0) > 0 ||
            (delayed.data?.length ?? 0) > 0 ||
            (repeat.data?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {(waiting.data?.length ?? 0) > 0 && (
                <CompactList
                  label="Waiting on others"
                  tone="warning"
                  count={waiting.data?.length ?? 0}
                  items={waiting.data ?? []}
                  isLoading={waiting.isLoading}
                  emptyText="No tasks waiting."
                  viewAllTo="/tasks"
                  onViewAll={goToTasksBucket('waiting')}
                  renderItem={(t) => <DashboardTaskRow key={t.id} task={t} now={now} />}
                />
              )}
              {(delayed.data?.length ?? 0) > 0 && (
                <CompactList
                  label="Delayed"
                  tone="destructive"
                  count={delayed.data?.length ?? 0}
                  items={delayed.data ?? []}
                  isLoading={delayed.isLoading}
                  emptyText="Nothing flagged delayed."
                  viewAllTo="/tasks"
                  onViewAll={goToTasksBucket('delayed')}
                  renderItem={(t) => <DashboardTaskRow key={t.id} task={t} now={now} />}
                />
              )}
              {(repeat.data?.length ?? 0) > 0 && (
                <CompactList
                  label="Needs repeat"
                  tone="destructive"
                  count={repeat.data?.length ?? 0}
                  items={repeat.data ?? []}
                  isLoading={repeat.isLoading}
                  emptyText="Nothing flagged for repeat."
                  viewAllTo="/tasks"
                  onViewAll={goToTasksBucket('repeat')}
                  renderItem={(t) => <DashboardTaskRow key={t.id} task={t} now={now} />}
                />
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </AmbientBackground>
  );
}

const AREA_LABEL_DASH: Record<string, string> = {
  kitchen: 'Kitchen',
  storage: 'Storage',
  service_area: 'Service area',
  cold_room: 'Cold room',
  dry_store: 'Dry store',
  staff_area: 'Staff area',
  full_branch: 'Full branch',
};

function BranchInline({ branch }: { branch: string | null }) {
  if (!branch) return null;
  const meta = (
    BRANCHES as Record<string, { name: string; color: string } | undefined>
  )[branch as BranchCode];
  if (!meta) return null;
  return (
    <span className="text-foreground-72 inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.name}
    </span>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function DashboardPendingDeliveryRow({ delivery }: { delivery: PendingDelivery }) {
  return (
    <Link
      to={`/purchases/${delivery.id}`}
      className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {delivery.title}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <span className="truncate">{delivery.supplier_name}</span>
          <span className="text-subtle-foreground">·</span>
          <BranchInline branch={delivery.branch} />
          {delivery.qty_ordered != null && delivery.qty_received != null && (
            <>
              <span className="text-subtle-foreground">·</span>
              <span className="tabular-nums">
                {formatQty(delivery.qty_received)} / {formatQty(delivery.qty_ordered)}
              </span>
            </>
          )}
        </div>
      </div>
      <span
        className={cn(
          'shrink-0 text-xs font-medium tabular-nums',
          delivery.is_overdue ? 'text-destructive-ink' : 'text-warning-ink',
        )}
      >
        {delivery.is_overdue && (
          <PackageCheck className="mr-1 inline h-3 w-3 -translate-y-px" />
        )}
        {shortDate(delivery.expected_delivery_date)}
      </span>
    </Link>
  );
}

function DashboardUnpaidRow({ purchase }: { purchase: UnpaidPurchase }) {
  const remaining =
    purchase.total_amount != null
      ? purchase.total_amount - (purchase.amount_paid ?? 0)
      : null;
  return (
    <Link
      to={`/purchases/${purchase.id}`}
      className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {purchase.title}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <span className="truncate">{purchase.supplier_name}</span>
          <span className="text-subtle-foreground">·</span>
          <BranchInline branch={purchase.branch} />
          <span className="text-subtle-foreground">·</span>
          <span className="capitalize">{purchase.payment_status}</span>
        </div>
      </div>
      <span className="text-warning-ink shrink-0 text-xs font-semibold tabular-nums">
        <CircleDollarSign className="mr-1 inline h-3 w-3 -translate-y-px" />
        {remaining != null
          ? formatCurrency(remaining, purchase.currency as Currency)
          : formatCurrency(purchase.total_amount, purchase.currency as Currency)}
      </span>
    </Link>
  );
}

function DashboardPurchaseReminderRow({ reminder }: { reminder: PurchaseReminder }) {
  return (
    <Link
      to={`/purchases/${reminder.id}`}
      className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {reminder.title}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <span className="truncate">{reminder.supplier_name}</span>
          <span className="text-subtle-foreground">·</span>
          <BranchInline branch={reminder.branch} />
          {reminder.expected_delivery_date && (
            <>
              <span className="text-subtle-foreground">·</span>
              <span>delivery {shortDate(reminder.expected_delivery_date)}</span>
            </>
          )}
        </div>
      </div>
      <span className="text-primary-ink shrink-0 text-xs font-semibold uppercase tracking-wider">
        <Bell className="mr-1 inline h-3 w-3 -translate-y-px" />
        today
      </span>
    </Link>
  );
}

function DashboardReminderRow({
  reminder,
  onDismiss,
  isDismissing,
}: {
  reminder: MyReminder;
  onDismiss: () => void;
  isDismissing: boolean;
}) {
  const title = reminder.entity?.title ?? '(deleted)';
  const branch = reminder.entity?.branch ?? null;
  const branchMeta =
    branch != null
      ? (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
          branch as BranchCode
        ]
      : undefined;
  const fired = reminder.fired_at ? new Date(reminder.fired_at) : new Date(reminder.fire_at);
  const minutes = Math.max(0, Math.round((Date.now() - fired.getTime()) / 60000));
  const ago =
    minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;

  return (
    <div className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors">
      <Link to={reminderTargetPath(reminder)} className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">{title}</div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          <span className="text-primary-ink">{REMINDER_KIND_LABEL[reminder.kind]}</span>
          {branchMeta && (
            <>
              <span className="text-subtle-foreground">·</span>
              <span className="text-foreground-72 inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: branchMeta.color }}
                />
                {branchMeta.name}
              </span>
            </>
          )}
          <span className="text-subtle-foreground">·</span>
          <span className="tabular-nums">{ago}</span>
        </div>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        disabled={isDismissing}
        aria-label="Dismiss reminder"
        data-testid={`dismiss-reminder-${reminder.id}`}
        className="text-muted-foreground hover:bg-surface-2 hover:text-foreground shrink-0 rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-50"
      >
        Dismiss
      </button>
    </div>
  );
}

function DashboardCriticalFindingRow({ finding }: { finding: CriticalFinding }) {
  const branchMeta = (
    BRANCHES as Record<string, { name: string; color: string } | undefined>
  )[finding.inspection_branch as BranchCode];
  return (
    <Link
      to={`/inspections/${finding.inspection_id}`}
      className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="bg-destructive mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {finding.description}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
          {branchMeta && (
            <span className="text-foreground-72 inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: branchMeta.color }}
              />
              {branchMeta.name}
            </span>
          )}
          <span className="text-subtle-foreground">·</span>
          <span>{AREA_LABEL_DASH[finding.inspection_area] ?? finding.inspection_area}</span>
          {finding.responsible && (
            <>
              <span className="text-subtle-foreground">·</span>
              <span>→ {finding.responsible}</span>
            </>
          )}
        </div>
      </div>
      <span className="text-destructive-ink shrink-0 text-xs font-semibold uppercase tracking-wider">
        critical
      </span>
    </Link>
  );
}
