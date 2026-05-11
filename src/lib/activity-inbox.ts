import { callRpc } from './rpc';
import { listGmailImportant, type GmailImportantMessage } from './gmail';
import {
  listGoogleCalendarToday,
  type CalendarTodayEvent,
} from './google-calendar';

// =========================================================
// Types — uniform across all sources
// =========================================================

export type ActivitySource =
  | 'gmail'
  | 'calendar'
  | 'telegram'
  | 'task'
  | 'follow_up'
  | 'purchase'
  | 'inspection_finding'
  | 'document';

export type ActivitySeverity =
  | 'critical'
  | 'overdue'
  | 'due_today'
  | 'soon'
  | 'info';

export interface ActivityItem {
  source: ActivitySource;
  id: string;
  native_id: string;
  title: string;
  summary: string | null;
  branch: string | null;
  entity_url: string;
  occurred_at: string;
  due_at: string | null;
  severity: ActivitySeverity;
  is_unread: boolean;
  is_blocked: boolean;
  meta: Record<string, unknown>;
}

const SEVERITY_RANK: Record<ActivitySeverity, number> = {
  critical: 0,
  overdue: 1,
  due_today: 2,
  soon: 3,
  info: 4,
};

export function severityRank(s: ActivitySeverity | string): number {
  const r = (SEVERITY_RANK as Record<string, number>)[s];
  return typeof r === 'number' ? r : 5;
}

// =========================================================
// Normalizers — turn Gmail/Calendar payloads into ActivityItems
// =========================================================

export function normalizeGmailMessage(m: GmailImportantMessage): ActivityItem {
  return {
    source: 'gmail',
    id: `gmail:${m.id}`,
    native_id: m.id,
    title: m.subject ?? '(no subject)',
    summary: m.snippet ?? null,
    branch: null,
    entity_url: m.html_link ?? `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
    occurred_at: m.internal_date ?? new Date().toISOString(),
    due_at: null,
    severity: 'info',
    is_unread: m.is_unread,
    is_blocked: false,
    meta: {
      from_address: m.from_address,
      from_name: m.from_name,
      thread_id: m.thread_id,
    },
  };
}

export function normalizeCalendarEvent(
  e: CalendarTodayEvent,
  now: Date = new Date(),
): ActivityItem {
  let severity: ActivitySeverity = 'soon';
  if (e.start) {
    const startMs = new Date(e.start).getTime();
    if (Number.isFinite(startMs)) {
      const diffMin = (startMs - now.getTime()) / 60000;
      if (diffMin <= 60 && diffMin > -120) severity = 'due_today';
      else if (diffMin <= 24 * 60) severity = 'soon';
      else severity = 'info';
    }
  }
  return {
    source: 'calendar',
    id: `calendar:${e.id}`,
    native_id: e.id,
    title: e.title,
    summary: e.location ?? null,
    branch: null,
    entity_url: e.html_link ?? 'https://calendar.google.com/',
    occurred_at: e.start ?? now.toISOString(),
    due_at: e.start ?? null,
    severity,
    is_unread: false,
    is_blocked: false,
    meta: {
      end: e.end,
      all_day: e.all_day,
      location: e.location,
    },
  };
}

// =========================================================
// Compose — pure merge + dedupe + sort
// =========================================================

export interface ComposeInput {
  dbItems: ActivityItem[];
  gmailMessages?: GmailImportantMessage[] | null;
  calendarEvents?: CalendarTodayEvent[] | null;
  now?: Date;
}

export function composeActivityInbox(input: ComposeInput): ActivityItem[] {
  const merged: ActivityItem[] = [...input.dbItems];
  if (input.gmailMessages) {
    for (const m of input.gmailMessages) merged.push(normalizeGmailMessage(m));
  }
  if (input.calendarEvents) {
    for (const e of input.calendarEvents)
      merged.push(normalizeCalendarEvent(e, input.now));
  }

  // De-duplicate by composite id (`source:native_id`). Last write wins.
  const byId = new Map<string, ActivityItem>();
  for (const it of merged) byId.set(it.id, it);

  return [...byId.values()].sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity);
    if (r !== 0) return r;
    const aMs = Date.parse(a.occurred_at) || 0;
    const bMs = Date.parse(b.occurred_at) || 0;
    return bMs - aMs;
  });
}

// =========================================================
// Network — RPC + Edge Functions in parallel
// =========================================================

export async function listActivityInboxDb(
  limitPerSource = 30,
  horizonDays = 7,
): Promise<ActivityItem[]> {
  const rows = await callRpc<ActivityItem[]>('rpc_activity_inbox', {
    p_limit_per_source: limitPerSource,
    p_horizon_days: horizonDays,
  });
  return rows ?? [];
}

export interface FetchAllOptions {
  limitPerSource?: number;
  horizonDays?: number;
  includeGmail?: boolean;
  includeCalendar?: boolean;
}

export interface FetchAllResult {
  items: ActivityItem[];
  gmailConnected: boolean | null;   // null = not asked (includeGmail=false)
  calendarConnected: boolean | null;
  gmailError: string | null;
  calendarError: string | null;
  dbError: string | null;
}

export async function fetchAllActivityInbox(
  opts: FetchAllOptions = {},
): Promise<FetchAllResult> {
  const {
    limitPerSource = 30,
    horizonDays = 7,
    includeGmail = true,
    includeCalendar = true,
  } = opts;

  // Run all three in parallel; failures don't take down the whole inbox.
  const [dbR, gmailR, calR] = await Promise.allSettled([
    listActivityInboxDb(limitPerSource, horizonDays),
    includeGmail ? listGmailImportant() : Promise.resolve(null),
    includeCalendar ? listGoogleCalendarToday() : Promise.resolve(null),
  ]);

  const dbItems = dbR.status === 'fulfilled' ? dbR.value : [];
  const dbError =
    dbR.status === 'rejected'
      ? dbR.reason instanceof Error
        ? dbR.reason.message
        : 'db error'
      : null;

  const gmailRes = gmailR.status === 'fulfilled' ? gmailR.value : null;
  const calRes = calR.status === 'fulfilled' ? calR.value : null;

  return {
    items: composeActivityInbox({
      dbItems,
      gmailMessages: gmailRes?.connected ? gmailRes.messages : null,
      calendarEvents: calRes?.connected ? calRes.events : null,
    }),
    gmailConnected: includeGmail ? !!(gmailRes && gmailRes.connected) : null,
    calendarConnected: includeCalendar
      ? !!(calRes && calRes.connected)
      : null,
    gmailError: gmailRes?.error ?? null,
    calendarError: calRes?.error ?? null,
    dbError,
  };
}
