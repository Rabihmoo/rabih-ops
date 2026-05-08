import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ListChecks,
  Loader2,
  PhoneCall,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUserProfile, useSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useTaskFiltersStore, type TaskBucket } from '@/stores/taskFiltersStore';
import { useFollowUpFiltersStore } from '@/stores/followUpFiltersStore';
import { listTasks, type TaskListFilters } from '@/lib/tasks';
import { listFollowUps, effectiveDueDate } from '@/lib/follow-ups';
import type { FollowUpRow, TaskRow } from '@/types/database';
import { DueDateBadge, BranchBadge, PriorityBadge } from '@/components/tasks/badges';
import { FollowUpCategoryBadge } from '@/components/follow-ups/badges';

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
      // No created_by filter at the RPC; client filter below.
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
          (t) => t.created_by === userId && t.assigned_to !== null && t.assigned_to !== userId,
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

export function DashboardPage() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const userId = useAuthStore((s) => s.profile?.id);
  const displayName =
    profile?.full_name ?? session?.user.email?.split('@')[0] ?? 'there';

  const today = useBucketTasks('today', userId);
  const overdue = useBucketTasks('overdue', userId);
  const mine = useBucketTasks('mine', userId);
  const waiting = useBucketTasks('waiting', userId);
  const followUpsToday = useFollowUpsDueToday();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {displayName}
        </h1>
        <p className="text-muted-foreground text-sm">
          Here's what needs your attention today.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <DashboardTile
          bucket="today"
          title="Today"
          icon={<ListChecks className="text-primary h-5 w-5" />}
          query={today}
        />
        <DashboardTile
          bucket="overdue"
          title="Overdue"
          icon={<AlertTriangle className="text-destructive h-5 w-5" />}
          query={overdue}
        />
        <DashboardTile
          bucket="mine"
          title="My tasks"
          icon={<Clock className="text-primary h-5 w-5" />}
          query={mine}
        />
        <DashboardTile
          bucket="waiting"
          title="Waiting on others"
          icon={<Users className="text-primary h-5 w-5" />}
          query={waiting}
        />
        <FollowUpsTodayTile query={followUpsToday} />
      </div>
    </div>
  );
}

function DashboardTile({
  bucket,
  title,
  icon,
  query,
}: {
  bucket: TaskBucket;
  title: string;
  icon: React.ReactNode;
  query: { data?: TaskRow[]; isLoading: boolean; error: unknown };
}) {
  const setBucket = useTaskFiltersStore((s) => s.setBucket);
  const resetGranular = useTaskFiltersStore((s) => s.resetGranular);
  const list = query.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold">
          {query.isLoading ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : query.error ? (
            <span className="text-destructive text-sm">error</span>
          ) : (
            list.length
          )}
        </div>
        <ul className="space-y-1.5">
          {list.slice(0, 3).map((t) => (
            <li key={t.id} className="text-sm">
              <Link
                to={`/tasks/${t.id}`}
                className="hover:text-foreground text-muted-foreground line-clamp-1 hover:underline"
              >
                {t.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <BranchBadge branch={t.branch} />
                <PriorityBadge priority={t.priority as 'urgent' | 'normal' | 'low'} />
                <DueDateBadge
                  dueDate={t.due_date}
                  status={
                    t.status as 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled'
                  }
                />
              </div>
            </li>
          ))}
        </ul>
        <Link
          to="/tasks"
          onClick={() => {
            resetGranular();
            setBucket(bucket);
          }}
          className="text-primary inline-flex items-center text-xs hover:underline"
        >
          View all <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function FollowUpsTodayTile({
  query,
}: {
  query: { data?: FollowUpRow[]; isLoading: boolean; error: unknown };
}) {
  const setBucket = useFollowUpFiltersStore((s) => s.setBucket);
  const resetGranular = useFollowUpFiltersStore((s) => s.resetGranular);
  const list = query.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Follow-ups today</CardTitle>
        <PhoneCall className="text-primary h-5 w-5" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold">
          {query.isLoading ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : query.error ? (
            <span className="text-destructive text-sm">error</span>
          ) : (
            list.length
          )}
        </div>
        <ul className="space-y-1.5">
          {list.slice(0, 3).map((f) => (
            <li key={f.id} className="text-sm">
              <Link
                to={`/follow-ups/${f.id}`}
                className="hover:text-foreground text-muted-foreground line-clamp-1 hover:underline"
              >
                {f.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <FollowUpCategoryBadge category={f.category as 'call' | 'whatsapp' | 'email' | 'meeting' | 'check_in_person'} />
                {f.branch && <BranchBadge branch={f.branch} />}
                <PriorityBadge priority={f.priority as 'urgent' | 'normal' | 'low'} />
                <DueDateBadge
                  dueDate={effectiveDueDate(f)}
                  status={
                    (f.status === 'done' || f.status === 'cancelled'
                      ? f.status
                      : 'todo') as 'todo' | 'done' | 'cancelled'
                  }
                />
              </div>
            </li>
          ))}
        </ul>
        <Link
          to="/follow-ups"
          onClick={() => {
            resetGranular();
            setBucket('today');
          }}
          className="text-primary inline-flex items-center text-xs hover:underline"
        >
          View all <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
