// Pure helpers for dashboard pin/unpin feature.
//
// This file is intentionally side-effect-free — no supabase import.
// The RPC wrapper lives in dashboard-pins.ts which re-exports everything
// from here plus adds the callRpc wrapper.

export type DashboardSectionKey =
  | 'calendar'
  | 'pending_emails'
  | 'today_emails'
  | 'important_emails'
  | 'overdue'
  | 'today'
  | 'follow_ups_today'
  | 'waiting'
  | 'critical_findings'
  | 'purchases'
  | 'reminders';

const ALLOWED_KEYS: Set<string> = new Set<DashboardSectionKey>([
  'calendar',
  'pending_emails',
  'today_emails',
  'important_emails',
  'overdue',
  'today',
  'follow_ups_today',
  'waiting',
  'critical_findings',
  'purchases',
  'reminders',
]);

/** Default static ordering of compact-list sections on the dashboard. */
export const DEFAULT_SECTION_ORDER: DashboardSectionKey[] = [
  'reminders',
  'critical_findings',
  'purchases',
  'overdue',
  'today',
  'follow_ups_today',
  'waiting',
  'calendar',
  'pending_emails',
  'today_emails',
  'important_emails',
];

/** Validate and deduplicate a pins array. Strips unknown keys. */
export function validatePins(raw: unknown): DashboardSectionKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: DashboardSectionKey[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && ALLOWED_KEYS.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item as DashboardSectionKey);
    }
  }
  return result;
}

/** Toggle a key: add if missing, remove if present. Returns new array. */
export function togglePin(
  current: DashboardSectionKey[],
  key: DashboardSectionKey,
): DashboardSectionKey[] {
  if (current.includes(key)) {
    return current.filter((k) => k !== key);
  }
  return [...current, key];
}

/** Sort section keys: pinned first (in their pin order), then unpinned
 *  (in DEFAULT_SECTION_ORDER). */
export function sortSections(
  sections: DashboardSectionKey[],
  pins: DashboardSectionKey[],
): DashboardSectionKey[] {
  const pinSet = new Set(pins);
  const pinned = pins.filter((k) => sections.includes(k));
  const unpinned = DEFAULT_SECTION_ORDER.filter(
    (k) => sections.includes(k) && !pinSet.has(k),
  );
  return [...pinned, ...unpinned];
}
