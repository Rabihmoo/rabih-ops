// Pure helpers for the /calendar page (C2).
//
// No I/O, no React, no Supabase imports. Every input is a plain object;
// every output is too. Window math anchors on Africa/Maputo so the
// page's "Today" matches the Dashboard card's `maputoTodayRange()`.

import type { CalendarListEvent } from './calendar-list-edge';
import type { CalendarDismissal, CalendarLinkForUser } from './google-calendar';

export type CalendarFilterKey =
  | 'today'
  | 'upcoming'
  | 'recurring'
  | 'unlinked'
  | 'linked'
  | 'ignored';

const PROJECT_TZ_OFFSET = '+02:00'; // Africa/Maputo — no DST.

// ===================================================================
// Window math (Africa/Maputo)
// ===================================================================

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Today's local Y/M/D in Africa/Maputo, regardless of the caller's
// device TZ. Returns { y, m, d } (1-indexed month).
export function maputoLocalDateParts(d: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Maputo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA gives YYYY-MM-DD reliably.
  const parts = fmt.format(d).split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
  };
}

// Today 00:00 in Africa/Maputo → tomorrow 00:00 in Africa/Maputo.
export function todayWindowMaputo(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const { year, month, day } = maputoLocalDateParts(now);
  const from = `${year}-${pad(month)}-${pad(day)}T00:00:00${PROJECT_TZ_OFFSET}`;
  // Add one day by constructing the next-day epoch in Maputo space.
  const tomorrow = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
  const t = maputoLocalDateParts(tomorrow);
  const to = `${t.year}-${pad(t.month)}-${pad(t.day)}T00:00:00${PROJECT_TZ_OFFSET}`;
  return { from, to };
}

// 8-day window starting at today 00:00 Africa/Maputo. The page shows
// "Today + next 7 days" — eight day-headings worth of content.
export function upcoming7dWindow(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const { year, month, day } = maputoLocalDateParts(now);
  const from = `${year}-${pad(month)}-${pad(day)}T00:00:00${PROJECT_TZ_OFFSET}`;
  const end = new Date(Date.UTC(year, month - 1, day) + 8 * 24 * 60 * 60 * 1000);
  const e = maputoLocalDateParts(end);
  const to = `${e.year}-${pad(e.month)}-${pad(e.day)}T00:00:00${PROJECT_TZ_OFFSET}`;
  return { from, to };
}

// 90-day window from now for the masters fetch.
export function masters90dWindow(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = now.toISOString();
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

// ===================================================================
// Dismissal masking
// ===================================================================

export interface DismissalIndex {
  ids: Set<string>;             // every dismissed google_event_id
  seriesMasters: Set<string>;   // recurring_event_ids dismissed series-wide
}

export function indexDismissals(rows: CalendarDismissal[]): DismissalIndex {
  const ids = new Set<string>();
  const seriesMasters = new Set<string>();
  for (const d of rows) {
    ids.add(d.google_event_id);
    if (d.is_series_dismiss && d.recurring_event_id) {
      seriesMasters.add(d.recurring_event_id);
    }
  }
  return { ids, seriesMasters };
}

export function isEventDismissed(
  event: CalendarListEvent,
  idx: DismissalIndex,
): boolean {
  if (idx.ids.has(event.id)) return true;
  if (event.recurring_event_id && idx.seriesMasters.has(event.recurring_event_id)) {
    return true;
  }
  return false;
}

export function excludeDismissed(
  events: CalendarListEvent[],
  idx: DismissalIndex,
): CalendarListEvent[] {
  return events.filter((e) => !isEventDismissed(e, idx));
}

// ===================================================================
// Link masking
// ===================================================================

export interface LinkIndex {
  byEventId: Map<string, CalendarLinkForUser>;
}

export function indexLinks(rows: CalendarLinkForUser[]): LinkIndex {
  const byEventId = new Map<string, CalendarLinkForUser>();
  for (const l of rows) byEventId.set(l.google_event_id, l);
  return { byEventId };
}

// An event is "linked" if its id OR its recurring master id is in the
// link index. Returns the matching link row (for badge rendering) or
// null.
export function findLinkFor(
  event: CalendarListEvent,
  idx: LinkIndex,
): CalendarLinkForUser | null {
  return (
    idx.byEventId.get(event.id) ??
    (event.recurring_event_id
      ? idx.byEventId.get(event.recurring_event_id) ?? null
      : null)
  );
}

export function partitionByLinked(
  events: CalendarListEvent[],
  idx: LinkIndex,
): { linked: CalendarListEvent[]; unlinked: CalendarListEvent[] } {
  const linked: CalendarListEvent[] = [];
  const unlinked: CalendarListEvent[] = [];
  for (const e of events) {
    if (findLinkFor(e, idx)) linked.push(e);
    else unlinked.push(e);
  }
  return { linked, unlinked };
}

// ===================================================================
// Day grouping (Africa/Maputo local day)
// ===================================================================

export interface DayBucket {
  // YYYY-MM-DD local Maputo date
  dateKey: string;
  events: CalendarListEvent[];
}

function maputoDayKey(iso: string | null): string | null {
  if (!iso) return null;
  // For all-day events Google returns "YYYY-MM-DD" — no time component.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = maputoLocalDateParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function groupByDay(events: CalendarListEvent[]): DayBucket[] {
  const byKey = new Map<string, CalendarListEvent[]>();
  for (const e of events) {
    const key = maputoDayKey(e.start) ?? '0000-00-00';
    const arr = byKey.get(key) ?? [];
    arr.push(e);
    byKey.set(key, arr);
  }
  const keys = Array.from(byKey.keys()).sort();
  return keys.map((dateKey) => ({
    dateKey,
    events: byKey.get(dateKey)!,
  }));
}

// Friendly heading: "Today · Wed, May 17" / "Tomorrow · Thu, May 18" /
// "Sat, May 20".
export function formatDayHeader(
  dateKey: string,
  now: Date = new Date(),
): string {
  const todayParts = maputoLocalDateParts(now);
  const todayKey = `${todayParts.year}-${pad(todayParts.month)}-${pad(todayParts.day)}`;
  const tomorrow = new Date(
    Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) +
      24 * 60 * 60 * 1000,
  );
  const t = maputoLocalDateParts(tomorrow);
  const tomorrowKey = `${t.year}-${pad(t.month)}-${pad(t.day)}`;

  // Parse the date key in Maputo space.
  const [y, m, d] = dateKey.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return dateKey;
  // Construct a Date that represents noon-UTC for the given Y-M-D so
  // Intl renders the right weekday across all device TZs.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Africa/Maputo',
  }).format(dt);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Africa/Maputo',
  }).format(dt);

  if (dateKey === todayKey) return `Today · ${weekday}, ${monthDay}`;
  if (dateKey === tomorrowKey) return `Tomorrow · ${weekday}, ${monthDay}`;
  return `${weekday}, ${monthDay}`;
}

// ===================================================================
// Chip counts — computed without an extra fetch
// ===================================================================

export interface ChipCountsInput {
  instances: CalendarListEvent[] | null;
  links: CalendarLinkForUser[] | null;
  dismissals: CalendarDismissal[] | null;
  recurringLoaded: boolean;
  recurringMasters: CalendarListEvent[] | null;
  // The Today range — used to project Today out of the 8-day window.
  todayKey: string;
}

export interface ChipCounts {
  today: number;
  upcoming: number;
  recurring: number | null;
  unlinked: number;
  linked: number;
  ignored: number;
}

export function chipCounts(input: ChipCountsInput): ChipCounts {
  const dismissalIdx = indexDismissals(input.dismissals ?? []);
  const linkIdx = indexLinks(input.links ?? []);
  const visible = excludeDismissed(input.instances ?? [], dismissalIdx);
  const todayCount = visible.filter(
    (e) => maputoDayKey(e.start) === input.todayKey,
  ).length;
  const { linked, unlinked } = partitionByLinked(visible, linkIdx);
  return {
    today: todayCount,
    upcoming: visible.length,
    recurring: input.recurringLoaded
      ? excludeDismissed(input.recurringMasters ?? [], dismissalIdx).length
      : null,
    unlinked: unlinked.length,
    linked: linked.length,
    ignored: (input.dismissals ?? []).length,
  };
}

// Helper for the page: gives back the Today YYYY-MM-DD key matching
// the dismissal mask + day-group logic.
export function maputoTodayKey(now: Date = new Date()): string {
  const p = maputoLocalDateParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
