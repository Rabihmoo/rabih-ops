import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { effectiveDueDate } from '@/lib/follow-ups';
import type {
  FollowUpRow,
  FollowUpStatus,
  FollowUpCategory,
  TaskPriority,
} from '@/types/database';
import { BranchBadge, DueDateBadge, PriorityBadge } from '@/components/tasks/badges';
import { FollowUpStatusBadge, FollowUpCategoryBadge } from './badges';

// DueDateBadge expects a TaskStatus literal; map FollowUpStatus to the closest
// equivalent so the colour signal (overdue red, today amber) still works.
function asTaskStatus(s: FollowUpStatus): 'todo' | 'done' | 'cancelled' {
  if (s === 'done') return 'done';
  if (s === 'cancelled') return 'cancelled';
  return 'todo';
}

export function FollowUpListItem({
  followUp,
  onSelect,
}: {
  followUp: FollowUpRow;
  onSelect?: (id: string) => void;
}) {
  const userId = useAuthStore((s) => s.profile?.id);
  const assigneeLabel =
    followUp.assigned_to == null
      ? 'Unassigned'
      : followUp.assigned_to === userId
        ? 'Mine'
        : 'Assigned';
  const due = effectiveDueDate(followUp);
  const isSnoozed = followUp.snoozed_until !== null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(followUp.id)}
      className={cn(
        'border-border bg-card hover:bg-accent/40 flex w-full flex-col gap-2 border-b px-4 py-3 text-left transition-colors',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm font-medium',
              followUp.status === 'done' && 'text-muted-foreground line-through',
            )}
          >
            {followUp.title}
          </div>
          {followUp.person && (
            <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
              with {followUp.person}
            </div>
          )}
        </div>
        <DueDateBadge
          dueDate={due}
          status={asTaskStatus(followUp.status as FollowUpStatus)}
          className="shrink-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FollowUpCategoryBadge category={followUp.category as FollowUpCategory} />
        {followUp.branch && <BranchBadge branch={followUp.branch} />}
        <PriorityBadge priority={followUp.priority as TaskPriority} />
        <FollowUpStatusBadge status={followUp.status as FollowUpStatus} />
        {followUp.task_id && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <Link2 className="h-3 w-3" /> linked
          </span>
        )}
        {isSnoozed && (
          <span className="text-violet-300 text-xs">
            (originally {followUp.due_date})
          </span>
        )}
        <span className="text-muted-foreground text-xs">· {assigneeLabel}</span>
      </div>
    </button>
  );
}
