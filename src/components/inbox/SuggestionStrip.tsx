import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Info, Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/lib/activity-inbox';
import type { Suggestion } from '@/lib/inbox-suggestions/types';
import { buildSuggestionUrl } from '@/lib/inbox-suggestions/url';
import { trackSuggestionAction } from '@/lib/inbox-suggestions/telemetry';

const DEFAULT_VISIBLE = 3;

export function SuggestionStrip({
  parentItem,
  suggestions,
  onDismiss,
}: {
  parentItem: ActivityItem;
  suggestions: Suggestion[];
  onDismiss: (suggestionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (suggestions.length === 0) return null;
  const visible = showAll
    ? suggestions
    : suggestions.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = Math.max(0, suggestions.length - DEFAULT_VISIBLE);
  const totalLabel =
    suggestions.length === 1 ? 'suggestion' : 'suggestions';

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        data-testid={`inbox-suggest-affordance-${parentItem.id}`}
        className={cn(
          'text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors',
        )}
      >
        <Lightbulb className="h-3 w-3 shrink-0" />
        <span className="tabular-nums">{suggestions.length}</span>
        <span>{totalLabel}</span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
      </button>

      {expanded && (
        <ul
          className="border-border bg-surface-1 mt-1 space-y-1 rounded-md border p-2"
          data-testid={`inbox-suggest-list-${parentItem.id}`}
        >
          {visible.map((s) => (
            <SuggestionChip
              key={s.id}
              parentItem={parentItem}
              suggestion={s}
              onDismiss={onDismiss}
            />
          ))}
          {hiddenCount > 0 && (
            <li>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll((v) => !v);
                }}
                data-testid={`inbox-suggest-show-more-${parentItem.id}`}
                className={cn(
                  'text-muted-foreground hover:text-foreground hover:bg-surface-2 w-full rounded px-2 py-1 text-left text-[11px] transition-colors',
                )}
              >
                {showAll ? 'Show fewer' : `+${hiddenCount} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function SuggestionChip({
  parentItem,
  suggestion,
  onDismiss,
}: {
  parentItem: ActivityItem;
  suggestion: Suggestion;
  onDismiss: (id: string) => void;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const { url, external } = buildSuggestionUrl(suggestion, parentItem);

  const handleAction = () => {
    trackSuggestionAction({
      rule: suggestion.rule,
      action: suggestion.action,
      itemId: parentItem.id,
      suggestionId: suggestion.id,
    });
  };

  // The label is the only flex-grow element; the buttons stay shrink-0
  // so they remain reachable on narrow viewports.
  const labelSpan = (
    <span className="text-foreground line-clamp-2 min-w-0 flex-1 break-words text-left">
      {suggestion.label}
    </span>
  );

  return (
    <li
      className="border-border bg-card flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs"
      data-testid={`inbox-suggest-${suggestion.id}`}
    >
      <div className="flex items-center gap-1.5">
        {external ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={suggestion.reason}
            onClick={handleAction}
            data-testid={`inbox-suggest-link-${suggestion.id}`}
            className="hover:bg-surface-2 flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-0.5"
          >
            {labelSpan}
          </a>
        ) : (
          <Link
            to={url}
            title={suggestion.reason}
            onClick={handleAction}
            data-testid={`inbox-suggest-link-${suggestion.id}`}
            className="hover:bg-surface-2 flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-0.5"
          >
            {labelSpan}
          </Link>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setReasonOpen((v) => !v);
          }}
          aria-label="Show reason"
          data-testid={`inbox-suggest-info-${suggestion.id}`}
          className="text-muted-foreground hover:text-foreground shrink-0 p-1"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(suggestion.id);
          }}
          aria-label="Dismiss suggestion"
          data-testid={`inbox-suggest-dismiss-${suggestion.id}`}
          className="text-muted-foreground hover:text-destructive-ink shrink-0 p-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {reasonOpen && (
        <div
          className="text-muted-foreground border-border break-words border-t pt-1"
          data-testid={`inbox-suggest-reason-${suggestion.id}`}
        >
          {suggestion.reason}
        </div>
      )}
    </li>
  );
}
