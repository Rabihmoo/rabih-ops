import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import type { TaskRow, TaskStatus, TaskPriority } from '@/types/database';
import {
  BranchBadge,
  DueDateBadge,
  PriorityBadge,
  StatusBadge,
  TONE_BAR,
  computeDueTone,
} from './badges';

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
  const status = task.status as TaskStatus;
  const priority = task.priority as TaskPriority;
  const tone = computeDueTone(task.due_date, status, priority);

  const assigneeLabel =
    task.assigned_to == null
      ? 'Unassigned'
      : task.assigned_to === userId
        ? 'Mine'
        : 'Assigned';

  const closed = status === 'done' || status === 'cancelled';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(task.id)}
      className={cn(
        'group border-border bg-card hover:bg-surface-1 focus-visible:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors focus-visible:outline-none',
        selected && 'bg-primary-soft/30',
      )}
    >
      <span aria-hidden className={cn('w-1 shrink-0 self-stretch', TONE_BAR[tone])} />
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'truncate text-[15px] font-medium leading-snug',
                closed && 'text-muted-foreground line-through',
              )}
            >
              {task.title}
            </div>
            {task.description && !closed && (
              <div className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                {task.description}
              </div>
            )}
          </div>
          <DueDateBadge
            dueDate={task.due_date}
            status={status}
            className="mt-0.5 shrink-0"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <StatusBadge status={status} />
          <BranchBadge branch={task.branch} />
          {priority !== 'normal' && <PriorityBadge priority={priority} />}
          <span className="text-subtle-foreground text-xs">{assigneeLabel}</span>
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground/0 group-hover:text-muted-foreground mr-3 h-4 w-4 self-center shrink-0 transition-colors"
      />
    </button>
  );
}
