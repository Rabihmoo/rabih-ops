import type { ActivityItem, ActivitySource } from '../activity-inbox';

// =========================================================
// Action vocabulary
// =========================================================
// Note: there is no `dismiss` action in the vocabulary by design.
// Dismissal is local UI state managed by the dismiss store; it is
// not a business action that goes through a mutation RPC.

export type SuggestionAction =
  | 'create_task'
  | 'create_follow_up'
  | 'create_purchase_request'
  | 'link_to_existing'   // navigate to a specific task / follow-up / etc.
  | 'open_related'       // navigate to an entity this row already references
  | 'link_document';     // open the LinkedDocumentsCard picker on the target

// =========================================================
// Suggestion shape
// =========================================================

export interface SuggestionTarget {
  source: ActivitySource;
  native_id: string;
  title: string;
}

export interface SuggestionPrefill {
  title?: string;
  branch?: string | null;
  person?: string;
  supplier_name?: string;
  due_date?: string;          // ISO yyyy-mm-dd
  description?: string;
  priority?: 'low' | 'normal' | 'urgent';
}

export interface Suggestion {
  /** Stable id: `${item.id}:${rule}[:${target.source}:${target.native_id}]`. Used for dismissal. */
  id: string;
  /** Rule that produced this suggestion (telemetry / debugging). */
  rule: string;
  action: SuggestionAction;
  label: string;
  /** One-line plain-English explanation. Required — every suggestion must explain itself. */
  reason: string;
  /** 0..1. Used for ranking. Hard floor in compose. */
  score: number;
  /** For link_to_existing / open_related. */
  target?: SuggestionTarget;
  /** For create_*. Honored by the new-form pages via URL params. */
  prefill?: SuggestionPrefill;
}

// =========================================================
// Rule contract
// =========================================================

/**
 * A SuggestionRule is a pure function that inspects one ActivityItem
 * (with whole-inbox context for cross-row matching) and emits zero or
 * more suggestions. Rules MUST be deterministic and side-effect-free.
 */
export type SuggestionRule = (
  item: ActivityItem,
  ctx: SuggestionContext,
) => Suggestion[];

export interface SuggestionContext {
  /** The full inbox snapshot the user is currently looking at. */
  items: ActivityItem[];
  /** Pre-bucketed for cheap per-rule lookups. Mirrors items[].source. */
  bySource: Readonly<Record<ActivitySource, ActivityItem[]>>;
  /** Wall clock the orchestrator is operating against (test-overridable). */
  now: Date;
}

/** Helper for tests + the orchestrator. */
export function buildSuggestionContext(
  items: ActivityItem[],
  now: Date = new Date(),
): SuggestionContext {
  const bySource: Record<ActivitySource, ActivityItem[]> = {
    gmail: [],
    calendar: [],
    telegram: [],
    task: [],
    follow_up: [],
    purchase: [],
    inspection_finding: [],
    document: [],
  };
  for (const it of items) bySource[it.source].push(it);
  return { items, bySource, now };
}
