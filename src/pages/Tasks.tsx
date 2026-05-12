import { Link, useNavigate } from 'react-router-dom';
import { ListChecks, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskList } from '@/hooks/useTasks';
import { useTaskFiltersStore } from '@/stores/taskFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { TaskListItem } from '@/components/tasks/TaskListItem';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import type { TaskStatus } from '@/types/database';

export function TasksPage() {
  const { data, isLoading, error } = useTaskList();
  const navigate = useNavigate();
  const canMutate = useCanMutate();
  const count = data?.length ?? 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const isActive = (s: TaskStatus) => s !== 'finished' && s !== 'archived';
  const overdueCount =
    data?.filter(
      (t) =>
        t.due_date != null &&
        t.due_date < todayIso &&
        isActive(t.status as TaskStatus),
    ).length ?? 0;
  const todayCount =
    data?.filter(
      (t) => t.due_date === todayIso && isActive(t.status as TaskStatus),
    ).length ?? 0;
  const urgentCount = data?.filter((t) => t.priority === 'urgent').length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        actions={
          canMutate && (
            <Button size="sm" asChild>
              <Link to="/tasks/new" data-testid="new-task-button">
                <Plus className="mr-1 h-4 w-4" /> New task
              </Link>
            </Button>
          )
        }
        stats={
          data ? (
            <>
              <HeaderStat count={count} label={count === 1 ? 'task' : 'tasks'} />
              {overdueCount > 0 && (
                <HeaderStat
                  count={overdueCount}
                  label="overdue"
                  tone="destructive"
                />
              )}
              {todayCount > 0 && (
                <HeaderStat count={todayCount} label="due today" tone="warning" />
              )}
              {urgentCount > 0 && (
                <HeaderStat count={urgentCount} label="urgent" tone="destructive" />
              )}
            </>
          ) : (
            <span>Loading…</span>
          )
        }
      />

      <TaskFilterBar />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading tasks…</div>
        )}
        {error && (
          <div className="text-destructive-ink p-6 text-sm">
            Could not load tasks: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && data && data.length === 0 && <TasksEmpty />}
        {!isLoading && !error && data && data.length > 0 && (
          <ul>
            {data.map((task) => (
              <li key={task.id} className="last:[&>button]:border-b-0">
                <TaskListItem task={task} onSelect={(id) => navigate(`/tasks/${id}`)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TasksEmpty() {
  const bucket = useTaskFiltersStore((s) => s.bucket);
  const canMutate = useCanMutate();

  const COPY: Record<typeof bucket, { title: string; description: string }> = {
    today: {
      title: 'Nothing due today',
      description: 'A quiet day on the floor. Tap "New task" to add one.',
    },
    overdue: {
      title: 'Nothing is overdue',
      description: "You're ahead of schedule. Worth keeping it that way.",
    },
    mine: {
      title: 'No tasks assigned to you',
      description: 'When someone hands you something, it will show up here.',
    },
    waiting: {
      title: 'No tasks waiting on others',
      description: 'Tasks marked waiting_for_someone will surface here.',
    },
    delayed: {
      title: 'No tasks marked delayed',
      description: 'Tasks explicitly marked delayed (with a reason) appear here.',
    },
    repeat: {
      title: 'Nothing flagged needs_repeat',
      description: 'Finished work that gets sent back for redo will land here.',
    },
    active: {
      title: 'No active tasks match the current filters',
      description: 'Active = anything not finished or archived. Loosen the filters above.',
    },
    history: {
      title: 'No history yet',
      description: 'Finished and archived tasks will appear here for the audit trail.',
    },
  };

  // True all-clear: no tasks at all under the default (active) bucket.
  // Anything else is a filtered empty — stays muted per the Phase 4.2 rule.
  const isAllClear = bucket === 'active';
  const c = COPY[bucket];
  return (
    <EmptyState
      icon={isAllClear ? ShieldCheck : ListChecks}
      title={c.title}
      description={c.description}
      tone={isAllClear ? 'hero' : 'muted'}
      size={isAllClear ? 'tall' : 'default'}
      action={
        canMutate && bucket !== 'overdue' && bucket !== 'today' && bucket !== 'history' ? (
          <Button size="sm" asChild>
            <Link to="/tasks/new">
              <Plus className="mr-1 h-4 w-4" /> New task
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
