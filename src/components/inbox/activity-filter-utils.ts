// Pure utility module for the Activity Inbox source-filter chips.
//
// Split out of ActivityFilterChips.tsx so the renderer component file
// only exports React components and is eligible for Vite fast refresh.

import type { ActivityItem } from '@/lib/activity-inbox';

export type FilterKey =
  | 'all'
  | 'critical'
  | 'overdue'
  | 'today'
  | 'gmail'
  | 'calendar'
  | 'task'
  | 'follow_up'
  | 'purchase'
  | 'inspection_finding'
  | 'document'
  | 'telegram';

export interface FilterChip {
  key: FilterKey;
  label: string;
}

export const FILTER_CHIPS: FilterChip[] = [
  { key: 'all',                label: 'All' },
  { key: 'critical',           label: 'Critical' },
  { key: 'overdue',            label: 'Overdue' },
  { key: 'today',              label: 'Today' },
  { key: 'gmail',              label: 'Email' },
  { key: 'calendar',           label: 'Calendar' },
  { key: 'task',               label: 'Tasks' },
  { key: 'follow_up',          label: 'Follow-ups' },
  { key: 'purchase',           label: 'Purchases' },
  { key: 'inspection_finding', label: 'Findings' },
  { key: 'document',           label: 'Documents' },
  { key: 'telegram',           label: 'Telegram' },
];

const VALID_KEYS = new Set<string>(FILTER_CHIPS.map((c) => c.key));

export function matchesFilter(item: ActivityItem, key: FilterKey): boolean {
  switch (key) {
    case 'all':
      return true;
    case 'critical':
      return item.severity === 'critical';
    case 'overdue':
      return item.severity === 'overdue';
    case 'today':
      return item.severity === 'due_today';
    default:
      return item.source === key;
  }
}

export function isValidFilterKey(
  s: string | null | undefined,
): s is FilterKey {
  return typeof s === 'string' && VALID_KEYS.has(s);
}
