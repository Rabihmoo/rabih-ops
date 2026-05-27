// Pure projection helpers for Company / Contact Intelligence cards.
//
// All helpers operate on RecordRelation[] — no RPC calls, no hooks.
// The to_entity_status field (added in 5.1) enables open/closed filtering.

import type { RecordRelation } from './record-relations';

// =====================================================================
// Status classification
// =====================================================================

/** Terminal statuses per entity type. Anything NOT in this set is "open". */
const CLOSED_STATUSES: Record<string, Set<string>> = {
  task: new Set(['done', 'cancelled']),
  follow_up: new Set(['done', 'cancelled']),
  purchase_request: new Set(['fully_received', 'cancelled']),
  inspection: new Set(['pass']),
  document: new Set(['archived']),
};

/** True if the relation's linked entity is in an open (non-terminal) state.
 *  Returns false for rows without to_entity_status (external, notes, etc.). */
export function isOpenStatus(row: RecordRelation): boolean {
  if (!row.to_entity_status || !row.to_entity_type) return false;
  const closed = CLOSED_STATUSES[row.to_entity_type];
  if (!closed) return false;
  return !closed.has(row.to_entity_status);
}

// =====================================================================
// Filters
// =====================================================================

/** Filter relations to a specific to_entity_type. */
export function filterByType(
  rows: RecordRelation[],
  type: string,
): RecordRelation[] {
  return rows.filter((r) => r.to_entity_type === type);
}

/** Filter to open (non-terminal) relations only. */
export function filterOpen(rows: RecordRelation[]): RecordRelation[] {
  return rows.filter(isOpenStatus);
}

/** Filter to "issue" entity types — inspections + follow-ups. */
export function filterIssueHistory(rows: RecordRelation[]): RecordRelation[] {
  return rows.filter(
    (r) => r.to_entity_type === 'inspection' || r.to_entity_type === 'follow_up',
  );
}

// =====================================================================
// Rollups
// =====================================================================

/** Count of relations per to_entity_type. Null types are grouped as '_external'. */
export function typeCounts(rows: RecordRelation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.to_entity_type ?? '_external';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Count of open (non-terminal) issues — inspections + follow-ups that are not resolved/done. */
export function countOpenIssues(rows: RecordRelation[]): number {
  return filterIssueHistory(rows).filter(isOpenStatus).length;
}

/** ISO string of the most recent created_at across all relations.
 *  Returns null for an empty array. */
export function computeLastContacted(rows: RecordRelation[]): string | null {
  if (rows.length === 0) return null;
  let latest = rows[0].created_at;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].created_at > latest) latest = rows[i].created_at;
  }
  return latest;
}

/** Last N relations sorted by created_at desc. Input should already
 *  be sorted by the RPC; this re-sorts defensively. */
export function recentTouches(
  rows: RecordRelation[],
  n = 20,
): RecordRelation[] {
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, n);
}

/** Total count of relation rows — simple but named for readability. */
export function totalTouchCount(rows: RecordRelation[]): number {
  return rows.length;
}
