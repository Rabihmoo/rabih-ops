import { cn } from '@/lib/utils';
import type {
  CalendarFilterKey,
  ChipCounts,
} from '@/lib/calendar-filters';

interface ChipDef {
  key: CalendarFilterKey;
  label: string;
}

const CHIPS: ChipDef[] = [
  { key: 'today',     label: 'Today' },
  { key: 'upcoming',  label: 'Upcoming 7d' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'unlinked',  label: 'Unlinked' },
  { key: 'linked',    label: 'Linked' },
  { key: 'ignored',   label: 'Ignored' },
];

export function CalendarFilterChips({
  active,
  counts,
  onSelect,
}: {
  active: CalendarFilterKey;
  counts: ChipCounts;
  onSelect: (key: CalendarFilterKey) => void;
}) {
  return (
    <div className="-mx-1 flex flex-wrap gap-1.5">
      {CHIPS.map(({ key, label }) => {
        const isActive = active === key;
        const count = counts[key];
        const isEmpty = count === 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            data-testid={`calendar-filter-${key}`}
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
              {count === null ? '—' : count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
