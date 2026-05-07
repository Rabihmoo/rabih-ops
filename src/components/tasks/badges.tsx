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
  todo: 'bg-slate-700/40 text-slate-100',
  in_progress: 'bg-blue-700/40 text-blue-100',
  blocked: 'bg-amber-700/40 text-amber-100',
  done: 'bg-emerald-700/40 text-emerald-100',
  cancelled: 'bg-zinc-700/40 text-zinc-300 line-through',
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        STATUS_CLASSES[status],
        className,
      )}
    >
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
  urgent: 'bg-red-700/40 text-red-100',
  normal: 'bg-slate-700/40 text-slate-200',
  low: 'bg-zinc-800/60 text-zinc-400',
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        PRIORITY_CLASSES[priority],
        className,
      )}
    >
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
      <span className={cn('text-muted-foreground text-xs', className)}>
        {branch}
      </span>
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

export function DueDateBadge({
  dueDate,
  status,
  className,
}: {
  dueDate: string | null;
  status: TaskStatus;
  className?: string;
}) {
  if (!dueDate) {
    return <span className={cn('text-muted-foreground text-xs', className)}>No due date</span>;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  const isOpen = status !== 'done' && status !== 'cancelled';
  const isOverdue = isOpen && diffDays < 0;
  const isToday = isOpen && diffDays === 0;

  let label: string;
  if (isToday) label = 'Today';
  else if (diffDays === 1) label = 'Tomorrow';
  else if (diffDays === -1) label = 'Yesterday';
  else if (isOverdue) label = `Overdue ${Math.abs(diffDays)}d`;
  else if (diffDays > 0 && diffDays < 7) label = `In ${diffDays}d`;
  else label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <span
      className={cn(
        'text-xs font-medium',
        isOverdue ? 'text-red-400' : isToday ? 'text-amber-300' : 'text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}
