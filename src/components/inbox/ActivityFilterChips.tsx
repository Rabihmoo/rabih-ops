import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/lib/activity-inbox';
import {
  FILTER_CHIPS,
  matchesFilter,
  type FilterKey,
} from './activity-filter-utils';

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
      {FILTER_CHIPS.map(({ key, label }) => {
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
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all duration-150',
              isActive
                ? 'border-primary bg-primary-soft text-primary-ink shadow-glow-blue'
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
