import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskList } from '@/hooks/useTasks';
import { useTaskFiltersStore } from '@/stores/taskFiltersStore';
import { useCanMutate } from '@/hooks/usePermissions';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { TaskListItem } from '@/components/tasks/TaskListItem';

export function TasksPage() {
  const { data, isLoading, error } = useTaskList();
  const navigate = useNavigate();
  const canMutate = useCanMutate();
  const count = data?.length ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground text-sm">
            {data
              ? count === 0
                ? 'No matching tasks'
                : `${count} ${count === 1 ? 'task' : 'tasks'}`
              : 'Loading tasks…'}
          </p>
        </div>
        {canMutate && (
          <Button size="sm" asChild>
            <Link to="/tasks/new" data-testid="new-task-button">
              <Plus className="mr-1 h-4 w-4" /> New task
            </Link>
          </Button>
        )}
      </header>

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
        {!isLoading && !error && data && data.length === 0 && <EmptyState />}
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

function EmptyState() {
  const bucket = useTaskFiltersStore((s) => s.bucket);
  const messages: Record<typeof bucket, string> = {
    today: 'Nothing due today. A quiet day is a good day.',
    overdue: 'No overdue tasks. Stay on top of it.',
    mine: 'No tasks assigned to you.',
    waiting: 'Nothing you have delegated is still open.',
    all: 'No tasks match the current filters.',
  };
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <div className="text-foreground text-base font-semibold tracking-tight">
        All clear.
      </div>
      <div className="text-muted-foreground max-w-md text-sm">{messages[bucket]}</div>
    </div>
  );
}
