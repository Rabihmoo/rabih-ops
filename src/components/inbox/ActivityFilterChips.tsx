import { cn } from '@/lib/utils';
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

const CHIPS: { key: FilterKey; label: string }[] = [
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

const VALID_KEYS = new Set<string>(CHIPS.map((c) => c.key));

export function isValidFilterKey(s: string | null | undefined): s is FilterKey {
  return typeof s === 'string' && VALID_KEYS.has(s);
}

export function ActivityFilterChips({
  items,
  active,
  onSelect,
}: {
  items: ActivityItem[];
  active: FilterKey;
  onSelect: (key: FilterKey) => void;
}) {
  return (
    <div className="-mx-1 flex flex-wrap gap-1.5">
      {CHIPS.map(({ key, label }) => {
        const count = items.filter((i) => matchesFilter(i, key)).length;
        const isActive = active === key;
        const isEmpty = count === 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            data-testid={`inbox-filter-${key}`}
            data-active={isActive ? 'true' : 'false'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'border-primary bg-primary-soft text-primary-ink'
                : 'border-border bg-card text-muted-foreground hover:bg-surface-1 hover:text-foreground',
              isEmpty && !isActive && 'opacity-60',
            )}
          >
            <span className="font-medium">{label}</span>
            <span
              className={cn(
                'tabular-nums',
                isActive ? 'text-primary-ink' : 'text-subtle-foreground',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
