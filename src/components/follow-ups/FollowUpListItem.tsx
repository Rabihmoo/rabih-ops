import { ChevronRight, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { effectiveDueDate } from '@/lib/follow-ups';
import type {
  FollowUpRow,
  FollowUpStatus,
  FollowUpCategory,
  TaskPriority,
} from '@/types/database';
import {
  BranchBadge,
  DueDateBadge,
  PriorityBadge,
} from '@/components/tasks/badges';
import { TONE_BAR, computeDueTone } from '@/components/tasks/badge-utils';
import { FollowUpStatusBadge, FollowUpCategoryBadge } from './badges';

export function FollowUpListItem({
  followUp,
  onSelect,
}: {
  followUp: FollowUpRow;
  onSelect?: (id: string) => void;
}) {
  const userId = useAuthStore((s) => s.profile?.id);
  const status = followUp.status as FollowUpStatus;
  const priority = followUp.priority as TaskPriority;
  const due = effectiveDueDate(followUp);
  const tone = computeDueTone(due, status, priority);

  const assigneeLabel =
    followUp.assigned_to == null
      ? 'Unassigned'
      : followUp.assigned_to === userId
        ? 'Mine'
        : 'Assigned';

  const isSnoozed = followUp.snoozed_until !== null;
  const closed = status === 'done' || status === 'cancelled';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(followUp.id)}
      className={cn(
        'group border-border bg-card hover:bg-surface-1 focus-visible:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors focus-visible:outline-none',
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
              {followUp.title}
            </div>
            {(followUp.person || followUp.description) && !closed && (
              <div className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                {followUp.person ? `with ${followUp.person}` : followUp.description}
              </div>
            )}
          </div>
          <DueDateBadge
            dueDate={due}
            status={status}
            className="mt-0.5 shrink-0"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <FollowUpStatusBadge status={status} />
          <FollowUpCategoryBadge category={followUp.category as FollowUpCategory} />
          {followUp.branch && <BranchBadge branch={followUp.branch} />}
          {priority !== 'normal' && <PriorityBadge priority={priority} />}
          {followUp.task_id && (
            <span className="text-subtle-foreground inline-flex items-center gap-1 text-xs">
              <Link2 className="h-3 w-3" /> linked
            </span>
          )}
          {isSnoozed && (
            <span className="text-subtle-foreground text-xs">
              originally due {followUp.due_date}
            </span>
          )}
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
