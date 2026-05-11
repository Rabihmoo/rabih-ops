import type { ActivityItem } from '../activity-inbox';
import {
  buildSuggestionContext,
  type Suggestion,
  type SuggestionContext,
  type SuggestionRule,
} from './types';

export interface ComposeOptions {
  /** Rules to run. Order doesn't matter — output is sorted by score desc. */
  rules: SuggestionRule[];
  /** Optional dismissal predicate; suggestions for which this returns true are dropped. */
  isDismissed?: (suggestionId: string) => boolean;
  /** Max suggestions per item after capping. Default 3. */
  maxPerItem?: number;
  /** Suggestions with score < this are dropped. Default 0.4. */
  scoreFloor?: number;
  /** Max number of suggestions of the same action per item. Default 2. */
  maxPerAction?: number;
  /** Wall clock; passed through to rules via SuggestionContext.now. */
  now?: Date;
}

const DEFAULTS = {
  maxPerItem: 3,
  scoreFloor: 0.4,
  maxPerAction: 2,
};

/**
 * Run all rules over a single item, apply score floor + dismissal filter,
 * sort by score desc, and apply per-action diversity + per-item caps.
 *
 * Pure. Deterministic for a given (item, ctx, rules, dismissed).
 */
export function composeSuggestionsForItem(
  item: ActivityItem,
  ctx: SuggestionContext,
  opts: ComposeOptions,
): Suggestion[] {
  const maxPerItem = opts.maxPerItem ?? DEFAULTS.maxPerItem;
  const scoreFloor = opts.scoreFloor ?? DEFAULTS.scoreFloor;
  const maxPerAction = opts.maxPerAction ?? DEFAULTS.maxPerAction;

  // Collect.
  const raw: Suggestion[] = [];
  for (const rule of opts.rules) {
    try {
      raw.push(...rule(item, ctx));
    } catch {
      // A misbehaving rule must not blank the inbox — drop its output
      // for this item and continue. Rule authors run with vitest, this
      // is the production safety net.
    }
  }

  // Hard floor + dismissal.
  const filtered = raw.filter((s) => {
    if (s.score < scoreFloor) return false;
    if (opts.isDismissed && opts.isDismissed(s.id)) return false;
    return true;
  });

  // De-dupe identical ids (rule overlap or accidental double-emission).
  const seenIds = new Set<string>();
  const deduped: Suggestion[] = [];
  for (const s of filtered) {
    if (seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    deduped.push(s);
  }

  // Stable score-desc sort. Ties broken by rule id alphabetically for
  // reproducible ordering (and so unit tests can assert exact arrays).
  deduped.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.rule.localeCompare(b.rule);
  });

  // Per-action diversity cap + per-item cap.
  const perAction = new Map<string, number>();
  const out: Suggestion[] = [];
  for (const s of deduped) {
    const c = perAction.get(s.action) ?? 0;
    if (c >= maxPerAction) continue;
    perAction.set(s.action, c + 1);
    out.push(s);
    if (out.length >= maxPerItem) break;
  }
  return out;
}

/**
 * Run rules over every item and return a Map<itemId, Suggestion[]>.
 * The same SuggestionContext is reused across all items.
 *
 * NOTE: G2.1 does not yet implement reciprocal-link suppression
 * ("if Gmail X suggests Task Y, Task Y must not suggest Gmail X").
 * That post-pass lands in G2.5 once link_to_existing rules exist.
 */
export function composeAllSuggestions(
  items: ActivityItem[],
  opts: ComposeOptions,
): Map<string, Suggestion[]> {
  const ctx = buildSuggestionContext(items, opts.now ?? new Date());
  const out = new Map<string, Suggestion[]>();
  for (const item of items) {
    out.set(item.id, composeSuggestionsForItem(item, ctx, opts));
  }
  return out;
}
