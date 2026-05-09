import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ListChecks,
  Loader2,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUserProfile, useSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useTaskFiltersStore, type TaskBucket } from '@/stores/taskFiltersStore';
import { useFollowUpFiltersStore } from '@/stores/followUpFiltersStore';
import { listTasks, type TaskListFilters } from '@/lib/tasks';
import { listFollowUps, effectiveDueDate } from '@/lib/follow-ups';
import { listCriticalFindings, type CriticalFinding } from '@/lib/inspections';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import { EmptyState } from '@/components/shared/EmptyState';
import type { FollowUpRow, TaskPriority, TaskRow } from '@/types/database';

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
      // No created_by filter at the RPC; client-filtered below.
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
            t.status !== 'done' &&
            t.status !== 'cancelled',
        );
      }
      if (bucket === 'waiting') {
        if (!userId) return [];
        return rows.filter(
          (t) =>
            t.created_by === userId &&
            t.assigned_to !== null &&
            t.assigned_to !== userId,
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
    number: 'text-foreground/85',
    label: 'text-muted-foreground',
    icon: 'text-muted-foreground',
    bar: 'bg-border',
  },
};

// =========================================================
// Stat tile
// =========================================================

function StatTile({
  label,
  tone,
  icon: Icon,
  count,
  isLoading,
  to,
  onView,
}: {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  count: number | null;
  isLoading: boolean;
  to: string;
  onView: () => void;
}) {
  const isEmpty = (count ?? 0) === 0;
  const t = isEmpty ? TONE_CLASS.muted : TONE_CLASS[tone];

  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', t.bar)} aria-hidden />
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className={cn('text-xs font-semibold uppercase tracking-wider', t.label)}>
            {label}
          </span>
          <Icon className={cn('h-4 w-4', t.icon)} />
        </div>
        <div
          className={cn(
            'mt-3 text-4xl font-bold tabular-nums tracking-tight leading-none',
            t.number,
          )}
        >
          {isLoading ? (
            <Loader2 className="text-muted-foreground h-7 w-7 animate-spin" />
          ) : (
            (count ?? '—')
          )}
        </div>
        <Link
          to={to}
          onClick={onView}
          className="text-muted-foreground hover:text-foreground mt-4 inline-flex items-center text-xs font-medium transition-colors"
        >
          View all <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

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
    <span className="text-foreground/85 inline-flex items-center gap-1.5">
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
          <div className="flex items-baseline gap-2">
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
  const followUpsToday = useFollowUpsDueToday();
  const criticalFindings = useDashboardCriticalFindings();

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
    !criticalFindings.isLoading;
  const allClear =
    ready &&
    (overdue.data?.length ?? 0) === 0 &&
    (today.data?.length ?? 0) === 0 &&
    (followUpsToday.data?.length ?? 0) === 0 &&
    (criticalFindings.data?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          {greeting}, {displayName}.
        </h1>
        <p className="text-muted-foreground text-sm">{dateLabel}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatTile
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
        <StatTile
          label="Overdue"
          tone="destructive"
          icon={AlertTriangle}
          count={overdue.data?.length ?? null}
          isLoading={overdue.isLoading}
          to="/tasks"
          onView={goToTasksBucket('overdue')}
        />
        <StatTile
          label="Today"
          tone="warning"
          icon={ListChecks}
          count={today.data?.length ?? null}
          isLoading={today.isLoading}
          to="/tasks"
          onView={goToTasksBucket('today')}
        />
        <StatTile
          label="My tasks"
          tone="primary"
          icon={Clock}
          count={mine.data?.length ?? null}
          isLoading={mine.isLoading}
          to="/tasks"
          onView={goToTasksBucket('mine')}
        />
        <StatTile
          label="Waiting on others"
          tone="muted"
          icon={Users}
          count={waiting.data?.length ?? null}
          isLoading={waiting.isLoading}
          to="/tasks"
          onView={goToTasksBucket('waiting')}
        />
        <StatTile
          label="Follow-ups today"
          tone="primary"
          icon={PhoneCall}
          count={followUpsToday.data?.length ?? null}
          isLoading={followUpsToday.isLoading}
          to="/follow-ups"
          onView={goToFollowUpsToday}
        />
      </div>

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
        </div>
      )}
    </div>
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
            <span className="text-foreground/85 inline-flex items-center gap-1.5">
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
