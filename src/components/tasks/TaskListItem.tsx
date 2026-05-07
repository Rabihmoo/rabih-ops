import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import type { TaskRow, TaskStatus, TaskPriority } from '@/types/database';
import { BranchBadge, DueDateBadge, PriorityBadge, StatusBadge } from './badges';

export function TaskListItem({
  task,
  selected,
  onSelect,
}: {
  task: TaskRow;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const userId = useAuthStore((s) => s.profile?.id);
  const assigneeLabel =
    task.assigned_to == null
      ? 'Unassigned'
      : task.assigned_to === userId
        ? 'Mine'
        : 'Assigned';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(task.id)}
      className={cn(
        'border-border bg-card hover:bg-accent/40 flex w-full flex-col gap-2 border-b px-4 py-3 text-left transition-colors',
        selected && 'bg-accent/60 border-l-primary border-l-2',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm font-medium',
              task.status === 'done' && 'text-muted-foreground line-through',
            )}
          >
            {task.title}
          </div>
          {task.description && (
            <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
              {task.description}
            </div>
          )}
        </div>
        <DueDateBadge
          dueDate={task.due_date}
          status={task.status as TaskStatus}
          className="shrink-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BranchBadge branch={task.branch} />
        <PriorityBadge priority={task.priority as TaskPriority} />
        <StatusBadge status={task.status as TaskStatus} />
        <span className="text-muted-foreground text-xs">· {assigneeLabel}</span>
      </div>
    </button>
  );
}
