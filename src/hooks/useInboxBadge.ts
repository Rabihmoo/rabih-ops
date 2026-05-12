import { useActivityInbox } from '@/hooks/useActivityInbox';

// DB-owned sources only: tasks, follow-ups, purchases, findings, documents,
// telegram reminders. Gmail and Calendar are intentionally excluded from the
// inbox badge count so the user isn't pestered by routine inbox traffic.
const DB_OWNED_FOR_BADGE = new Set([
  'task',
  'follow_up',
  'purchase',
  'inspection_finding',
  'document',
  'telegram',
]);

export function useInboxBadgeCount(): number {
  const inbox = useActivityInbox();
  const items = inbox.data?.items ?? [];
  return items.filter(
    (i) =>
      DB_OWNED_FOR_BADGE.has(i.source) &&
      (i.severity === 'critical' ||
        i.severity === 'overdue' ||
        i.severity === 'due_today'),
  ).length;
}
