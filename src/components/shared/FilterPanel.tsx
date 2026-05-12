import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';
import { StatusChip } from '@/components/ui/status-chip';

// Shared chrome around the filter bar — wraps it in a surface-1 panel with
// a thin border and consistent spacing. When `buckets` is null the divider
// between the bucket row and the controls row is suppressed so callers
// that only have controls (Contacts) don't get a stray hairline.
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
      {buckets && <div className="flex flex-wrap items-center gap-2">{buckets}</div>}
      <div className={cn(buckets && 'border-border border-t pt-3')}>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="text-foreground-56 h-3.5 w-3.5 shrink-0" />
          {controls}
          {active && (
            <StatusChip tone="info" size="xs" className="ml-auto">
              filters active
            </StatusChip>
          )}
        </div>
      </div>
    </div>
  );
}

// Segmented-control bucket selector.
//
// Phase 5 polish — the inline-flex pill row overflows narrow viewports
// with long bucket lists (Companies' 9 categories, Tasks' 8 buckets).
// We wrap the segmented control in an `overflow-x-auto` scroller so
// the buttons stay single-line (`whitespace-nowrap`) without "Needs
// repeat" wrapping inside its own pill. A thin scrollbar shows up
// only when the content actually overflows; touch swipe works on
// mobile, mouse-drag/scroll-wheel works on desktop.
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
    <div className={cn('scrollbar-thin -mx-0.5 max-w-full overflow-x-auto', className)}>
      <div
        className="bg-background border-border inline-flex rounded-md border p-0.5"
        role="tablist"
      >
        {buckets.map((b) => {
          const isActive = active === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(b.id)}
              className={cn(
                'whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground-72 hover:bg-surface-2 hover:text-foreground',
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Wrapper around the shared <SearchInput> that constrains the width to
// match the rest of the filter row. The pill style + bigger touch
// target come from the underlying component.
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
    <SearchInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('w-full sm:max-w-xs', className)}
    />
  );
}

export const FILTER_SELECT_CLASS =
  'bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/70';
