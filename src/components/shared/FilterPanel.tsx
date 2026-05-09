import type { ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared chrome around the filter bar — wraps it in a surface-1 panel with
// a thin border and consistent spacing.
export function FilterPanel({
  buckets,
  controls,
  active,
  className,
}: {
  buckets: ReactNode;
  controls: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-surface-1 border-border space-y-3 rounded-lg border p-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{buckets}</div>
      <div className="border-border border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          {controls}
          {active && (
            <span className="bg-primary-soft text-primary-ink ml-auto inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              filters active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Segmented-control bucket selector.
export function BucketGroup<TBucket extends string>({
  buckets,
  active,
  onSelect,
  className,
}: {
  buckets: { id: TBucket; label: string }[];
  active: TBucket;
  onSelect: (bucket: TBucket) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-background border-border inline-flex rounded-md border p-0.5',
        className,
      )}
    >
      {buckets.map((b) => {
        const isActive = active === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className={cn(
              'rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

// Wrapper around the search <Input> that adds a leading icon, keeping the
// filter row visually consistent.
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-card border-border focus-visible:ring-ring/70 h-9 w-full rounded-md border pl-7.5 pr-3 text-sm placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ paddingLeft: '1.875rem' }}
      />
    </div>
  );
}

export const FILTER_SELECT_CLASS =
  'bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/70';
