import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cycleIndex, type SearchResultRow } from '@/lib/global-search';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { EmptyState } from './EmptyState';
import { CommandPaletteResultRow } from './CommandPaletteResultRow';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Navigate to a result's href. Provided by the shell (3.4). */
  onNavigate?: (href: string) => void;
  /** Inject static data for DesignPreview (dev-only). */
  devResults?: SearchResultRow[];
  devRecents?: SearchResultRow[];
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  devResults,
  devRecents,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isDev = devResults !== undefined || devRecents !== undefined;
  const search = useGlobalSearch(isDev ? '' : query);

  const results = isDev
    ? (query.length >= 2 ? (devResults ?? []) : [])
    : search.results;
  const recents = isDev ? (devRecents ?? []) : search.recents;
  const isShowingRecents = isDev ? query.length < 2 : search.isShowingRecents;
  const isLoading = isDev ? false : search.isLoading;

  const visibleRows = isShowingRecents ? recents : results;

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Auto-focus the input after portal mount
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [visibleRows.length]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Scroll active row into view
  useEffect(() => {
    if (!open || visibleRows.length === 0) return;
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.querySelector('[aria-selected="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open, visibleRows.length]);

  const handleSelect = useCallback(
    (row: SearchResultRow) => {
      if (!isDev) search.selectResult(row);
      onNavigate?.(row.href);
      onClose();
    },
    [isDev, search, onNavigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const len = visibleRows.length;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => cycleIndex(i, 1, len));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => cycleIndex(i, -1, len));
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(Math.max(len - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (len > 0 && activeIndex >= 0 && activeIndex < len) {
            handleSelect(visibleRows[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visibleRows, activeIndex, handleSelect, onClose],
  );

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
        data-testid="command-palette-backdrop"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-testid="command-palette"
        onKeyDown={handleKeyDown}
        className={cn(
          'bg-card text-foreground fixed z-[70] flex flex-col overflow-hidden',
          // Mobile: bottom-sheet
          'inset-x-0 bottom-0 max-h-[80vh] rounded-t-xl',
          // Desktop: centered top-mounted modal
          'sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-24 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-xl sm:border sm:border-border sm:shadow-2xl',
        )}
      >
        {/* Search header */}
        <div className="border-border flex shrink-0 items-center gap-2 border-b px-4">
          <Search className="text-foreground-40 h-4 w-4 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search tasks, contacts, documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-foreground placeholder:text-foreground-40 h-12 flex-1 bg-transparent text-sm outline-none"
            aria-label="Search"
            data-testid="command-palette-input"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-72 hover:text-foreground sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-md"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          role="listbox"
          className="flex-1 overflow-y-auto"
          style={{ maxHeight: 'calc(80vh - 7rem)' }}
        >
          {isShowingRecents && recents.length === 0 && (
            <EmptyState
              icon={Search}
              title="Start typing to search"
              tone="muted"
              size="compact"
            />
          )}

          {isShowingRecents && recents.length > 0 && (
            <>
              <div className="text-foreground-56 px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wider">
                Recent
              </div>
              {recents.map((row, i) => (
                <CommandPaletteResultRow
                  key={`${row.type}:${row.id}`}
                  row={row}
                  isActive={i === activeIndex}
                  onClick={() => handleSelect(row)}
                />
              ))}
            </>
          )}

          {!isShowingRecents && isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          )}

          {!isShowingRecents && !isLoading && results.length === 0 && (
            <EmptyState
              icon={Search}
              title="No results"
              description="Try a different search term"
              tone="muted"
              size="compact"
            />
          )}

          {!isShowingRecents && results.length > 0 &&
            results.map((row, i) => (
              <CommandPaletteResultRow
                key={`${row.type}:${row.id}`}
                row={row}
                isActive={i === activeIndex}
                onClick={() => handleSelect(row)}
              />
            ))}
        </div>

        {/* Footer — keyboard hints (desktop only) */}
        <div className="border-border text-foreground-40 hidden shrink-0 items-center gap-4 border-t px-4 py-2 text-xs sm:flex">
          <span><kbd className="text-foreground-56 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="text-foreground-56 font-mono">↵</kbd> open</span>
          <span><kbd className="text-foreground-56 font-mono">esc</kbd> close</span>
        </div>
      </div>
    </>,
    document.body,
  );
}
