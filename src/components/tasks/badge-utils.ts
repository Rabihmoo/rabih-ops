// Pure tone helpers shared across task / follow-up / inspection /
// purchase list rows. Split out of components/tasks/badges.tsx so that
// file only exports React components and is eligible for Vite fast
// refresh.

import type { FollowUpStatus, TaskPriority, TaskStatus } from '@/types/database';

// Cross-module status accepted by due-tone helpers + DueDateBadge. Tasks
// and follow-ups have different status enums but share the same row
// chrome.
export type DueToneStatus = TaskStatus | FollowUpStatus;

// Drives both the left-edge bar on list rows and the colour of the
// due-date label.
export type RowTone = 'destructive' | 'warning' | 'primary' | 'muted' | 'success';

/**
 * Returns the urgency tone of a task row based on status + due date
 * + priority. Closed states (finished/archived/done/cancelled) are
 * visually demoted regardless of date. `delayed` and `needs_repeat`
 * always carry weight regardless of date.
 */
export function computeDueTone(
  dueDate: string | null,
  status: DueToneStatus,
  priority?: TaskPriority,
): RowTone {
  if (status === 'finished' || status === 'done') return 'success';
  if (status === 'archived' || status === 'cancelled') return 'muted';
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

export const TONE_TEXT: Record<RowTone, string> = {
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
