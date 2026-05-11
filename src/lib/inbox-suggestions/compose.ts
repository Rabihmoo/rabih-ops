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
 * The same SuggestionContext is reused across all items. A post-pass
 * suppresses reciprocal link_to_existing suggestions ("A → B" and
 * "B → A") keeping only the higher-scoring side.
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
  return suppressReciprocalLinks(out);
}

/**
 * Removes the lower-scoring side of every reciprocal pair of
 * link_to_existing suggestions: when item A suggests linking to B AND
 * item B suggests linking to A, only the suggestion with the higher
 * score survives. Score ties keep the suggestion whose `id` sorts
 * first (deterministic).
 *
 * Exported for direct unit testing — composeAllSuggestions runs this
 * automatically.
 */
export function suppressReciprocalLinks(
  map: Map<string, Suggestion[]>,
): Map<string, Suggestion[]> {
  // 1) Collect every link_to_existing suggestion with its (from, to) pair.
  interface Edge {
    fromId: string;
    toId: string;
    suggestion: Suggestion;
  }
  const edges: Edge[] = [];
  for (const [fromId, list] of map) {
    for (const s of list) {
      if (s.action !== 'link_to_existing' || !s.target) continue;
      const toId = `${s.target.source}:${s.target.native_id}`;
      edges.push({ fromId, toId, suggestion: s });
    }
  }
  if (edges.length === 0) return map;

  // 2) Index edges by their "from→to" key so we can look up the reverse.
  const byKey = new Map<string, Edge>();
  for (const e of edges) {
    byKey.set(`${e.fromId}->${e.toId}`, e);
  }

  // 3) Find reciprocal pairs. For each pair, mark the loser's id for removal.
  const toRemove = new Set<string>();
  const handled = new Set<string>();
  for (const e of edges) {
    const key = `${e.fromId}->${e.toId}`;
    const reverseKey = `${e.toId}->${e.fromId}`;
    if (handled.has(key) || handled.has(reverseKey)) continue;
    const reverse = byKey.get(reverseKey);
    if (!reverse) continue;

    // Pick the survivor: higher score wins; ties → lexicographically
    // smaller suggestion id wins (deterministic and test-stable).
    let loser: Suggestion;
    if (e.suggestion.score > reverse.suggestion.score) {
      loser = reverse.suggestion;
    } else if (reverse.suggestion.score > e.suggestion.score) {
      loser = e.suggestion;
    } else {
      loser =
        e.suggestion.id <= reverse.suggestion.id
          ? reverse.suggestion
          : e.suggestion;
    }
    toRemove.add(loser.id);
    handled.add(key);
    handled.add(reverseKey);
  }
  if (toRemove.size === 0) return map;

  // 4) Apply removal.
  const next = new Map<string, Suggestion[]>();
  for (const [itemId, list] of map) {
    next.set(
      itemId,
      list.filter((s) => !toRemove.has(s.id)),
    );
  }
  return next;
}
