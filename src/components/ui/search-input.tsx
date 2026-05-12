import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// Search-shell styling. Cosmetic-only in Phase 3 — no Cmd-K wiring,
// no submit handler, no autocomplete. The kbd hint is visual.
//
// Use this anywhere a free-text search input is needed (topbar today,
// page-level search later). Form inputs stay on the default <Input>.

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Render a `⌘K` style hint at the trailing edge. Defaults to false. */
  kbdHint?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, kbdHint, ...props }, ref) => {
    return (
      <div className={cn('relative w-full', className)}>
        <Search
          className="text-foreground-40 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          ref={ref}
          type="search"
          className={cn(
            'bg-surface-1 border-border placeholder:text-foreground-40 text-foreground',
            'focus-visible:ring-ring focus-visible:bg-card',
            'h-10 w-full rounded-pill border pl-9 pr-3 text-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2',
            kbdHint && 'pr-14',
          )}
          {...props}
        />
        {kbdHint && (
          <kbd
            aria-hidden
            className="text-foreground-56 bg-surface-2 border-border pointer-events-none absolute right-2.5 top-1/2 inline-flex h-6 -translate-y-1/2 items-center rounded-md border px-1.5 font-mono text-[10px] tracking-wide"
          >
            {kbdHint}
          </kbd>
        )}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';
