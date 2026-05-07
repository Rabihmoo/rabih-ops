import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskList } from '@/hooks/useTasks';
import { useTaskFiltersStore } from '@/stores/taskFiltersStore';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { TaskListItem } from '@/components/tasks/TaskListItem';

export function TasksPage() {
  const { data, isLoading, error } = useTaskList();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {data ? `${data.length} task${data.length === 1 ? '' : 's'}` : ''}
          </span>
          <Button size="sm" asChild>
            <Link to="/tasks/new">
              <Plus className="mr-1 h-4 w-4" /> New task
            </Link>
          </Button>
        </div>
      </div>

      <TaskFilterBar />

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {isLoading && (
          <div className="text-muted-foreground p-6 text-sm">Loading tasks…</div>
        )}
        {error && (
          <div className="text-destructive p-6 text-sm">
            Could not load tasks: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && data && data.length === 0 && (
          <EmptyState />
        )}
        {!isLoading && !error && data && data.length > 0 && (
          <ul>
            {data.map((task) => (
              <li key={task.id}>
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
    waiting: 'Nothing you have delegated is open.',
    all: 'No tasks match the current filters.',
  };
  return (
    <div className="flex flex-col items-center gap-1 p-10 text-center">
      <div className="text-foreground text-sm font-medium">All clear</div>
      <div className="text-muted-foreground text-sm">{messages[bucket]}</div>
    </div>
  );
}
