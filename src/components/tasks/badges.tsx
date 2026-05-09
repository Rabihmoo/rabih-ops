import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import type { TaskPriority, TaskStatus } from '@/types/database';

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary-soft text-primary-ink',
  blocked: 'bg-warning-soft text-warning-ink',
  done: 'bg-success-soft text-success-ink',
  cancelled: 'bg-muted text-subtle-foreground line-through',
};

const PILL_BASE =
  'inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider';

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, STATUS_CLASSES[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  normal: 'Normal',
  low: 'Low',
};

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  urgent: 'bg-destructive-soft text-destructive-ink',
  normal: 'bg-muted text-muted-foreground',
  low: 'bg-transparent text-subtle-foreground',
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, PRIORITY_CLASSES[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </span>
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
        'text-foreground/90 inline-flex items-center gap-1.5 text-xs font-medium',
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
export type RowTone = 'destructive' | 'warning' | 'primary' | 'muted';

export function computeDueTone(
  dueDate: string | null,
  status: TaskStatus | 'pending' | 'snoozed',
  priority?: TaskPriority,
): RowTone {
  const closed = status === 'done' || status === 'cancelled';
  if (closed) return 'muted';
  if (!dueDate) return priority === 'urgent' ? 'destructive' : 'muted';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'destructive';
  if (diff === 0) return 'warning';
  if (priority === 'urgent') return 'destructive';
  if (status === 'in_progress') return 'primary';
  return 'muted';
}

const TONE_TEXT: Record<RowTone, string> = {
  destructive: 'text-destructive-ink',
  warning: 'text-warning-ink',
  primary: 'text-primary-ink',
  muted: 'text-muted-foreground',
};

export const TONE_BAR: Record<RowTone, string> = {
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  primary: 'bg-primary',
  muted: 'bg-transparent',
};

export function DueDateBadge({
  dueDate,
  status,
  className,
}: {
  dueDate: string | null;
  status: TaskStatus | 'pending' | 'snoozed';
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
