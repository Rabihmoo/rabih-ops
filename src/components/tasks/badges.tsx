import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import { TASK_STATUS_LABEL, isClosedTaskStatus } from '@/lib/tasks';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import type { FollowUpStatus, TaskPriority, TaskStatus } from '@/types/database';

// Cross-module status accepted by due-tone helpers + DueDateBadge. Tasks and
// follow-ups have different status enums but share the same row chrome.
export type DueToneStatus = TaskStatus | FollowUpStatus;

// Map every TaskStatus to a StatusChip tone. Phase 4.2 — graduates the
// hand-rolled status pill to the shared StatusChip primitive. The DOM
// shape changes (rounded-pill vs rounded-xs, tracking-wide vs -wider) but
// the contract callers depend on stays intact: data-testid="task-status-
// badge" + data-status="<status>" pass through via rest props, and the
// outer span is the same element type.
const STATUS_TONE: Record<TaskStatus, StatusTone> = {
  not_started:         'muted',
  started:             'info',
  working:             'info',
  waiting_for_someone: 'warning',
  delayed:             'critical',
  finished:            'success',
  needs_repeat:        'critical',
  archived:            'muted',
};

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <StatusChip
      tone={STATUS_TONE[status]}
      size="xs"
      data-testid="task-status-badge"
      data-status={status}
      className={className}
    >
      {TASK_STATUS_LABEL[status]}
    </StatusChip>
  );
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  normal: 'Normal',
  low: 'Low',
};

const PRIORITY_TONE: Record<TaskPriority, StatusTone> = {
  urgent: 'critical',
  normal: 'muted',
  low:    'muted',
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <StatusChip tone={PRIORITY_TONE[priority]} size="xs" className={className}>
      {PRIORITY_LABEL[priority]}
    </StatusChip>
  );
}

export function BranchBadge({ branch, className }: { branch: string; className?: string }) {
  const meta = (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
    branch as BranchCode
  ];
  if (!meta) {
    return (
      <span className={cn('text-subtle-foreground text-xs', className)}>{branch}</span>
    );
  }
  return (
    <span
      className={cn(
        'text-foreground-72 inline-flex items-center gap-1.5 text-xs font-medium',
        className,
      )}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.name}
    </span>
  );
}

// Returns the urgency tone of a task row based on status + due date + priority.
// Drives both the left-edge bar on list rows and the colour of the due-date label.
export type RowTone = 'destructive' | 'warning' | 'primary' | 'muted' | 'success';

export function computeDueTone(
  dueDate: string | null,
  status: DueToneStatus,
  priority?: TaskPriority,
): RowTone {
  // Closed states (finished/archived/done/cancelled) are visually demoted
  // regardless of date.
  if (status === 'finished' || status === 'done') return 'success';
  if (status === 'archived' || status === 'cancelled') return 'muted';
  // delayed and needs_repeat always carry weight regardless of date.
  if (status === 'delayed' || status === 'needs_repeat') return 'destructive';
  if (status === 'waiting_for_someone') return 'warning';
  if (!dueDate) return priority === 'urgent' ? 'destructive' : 'muted';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'destructive';
  if (diff === 0) return 'warning';
  if (priority === 'urgent') return 'destructive';
  if (status === 'working' || status === 'started') return 'primary';
  return 'muted';
}

const TONE_TEXT: Record<RowTone, string> = {
  destructive: 'text-destructive-ink',
  warning: 'text-warning-ink',
  primary: 'text-primary-ink',
  success: 'text-success-ink',
  muted: 'text-muted-foreground',
};

export const TONE_BAR: Record<RowTone, string> = {
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  primary: 'bg-primary',
  success: 'bg-success',
  muted: 'bg-transparent',
};

export function DueDateBadge({
  dueDate,
  status,
  className,
}: {
  dueDate: string | null;
  status: DueToneStatus;
  className?: string;
}) {
  if (!dueDate) {
    return (
      <span className={cn('text-subtle-foreground text-xs', className)}>No due date</span>
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  const tone = computeDueTone(dueDate, status);

  let label: string;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff < 0) label = `${Math.abs(diff)}d overdue`;
  else if (diff < 7) label = `In ${diff}d`;
  else label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <span
      className={cn('text-xs font-medium tabular-nums', TONE_TEXT[tone], className)}
    >
      {label}
    </span>
  );
}

// Re-export for callers that branch on closed/active.
export { isClosedTaskStatus };
