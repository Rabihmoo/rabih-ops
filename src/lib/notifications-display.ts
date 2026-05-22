// Pure types + presentation helpers for the Notifications Center.
//
// Split out of notifications.ts so vitest can exercise the day-grouping
// helper without dragging in ./rpc → ./supabase, which throws at load
// when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent (CI runs
// the unit suite without those secrets on purpose).
//
// notifications.ts re-exports everything here so existing imports of
// `@/lib/notifications` keep working unchanged.

import { PROJECT_TZ, localMidnightUnix } from './timezone';

// =====================================================================
// Types
// =====================================================================

export type NotificationChannel = 'in_app' | 'telegram' | 'email' | 'calendar';

export type NotificationEntityType = 'task' | 'follow_up';

export interface NotificationEntity {
  title: string;
  branch: string;
  priority?: string | null;
  due_date?: string | null;
  status: string;
}

interface BaseNotificationRow {
  kind: string;
  entity_type: NotificationEntityType;
  entity_id: string;
  channel: NotificationChannel;
  effective_at: string;
  payload: Record<string, unknown> | null;
  entity: NotificationEntity | null;
}

export interface FiredNotificationRow extends BaseNotificationRow {
  state: 'fired';
  log_id: number;
  queue_id: number | null;
  status: 'sent' | 'failed';
  error: string | null;
  fired_at: string;
  fire_at: null;
  read_at: string | null;
}

export interface PendingNotificationRow extends BaseNotificationRow {
  state: 'pending';
  log_id: null;
  queue_id: number;
  status: 'pending';
  error: null;
  fired_at: null;
  fire_at: string;
  read_at: null;
}

export type NotificationRow = FiredNotificationRow | PendingNotificationRow;

// =====================================================================
// Day-grouping helper (pure, tested)
// =====================================================================

export type NotificationDayBucket =
  | 'upcoming'
  | 'today'
  | 'yesterday'
  | 'earlier_this_week'
  | 'older';

export interface NotificationDayGroup {
  bucket: NotificationDayBucket;
  label: string;
  rows: NotificationRow[];
}

const BUCKET_ORDER: NotificationDayBucket[] = [
  'upcoming',
  'today',
  'yesterday',
  'earlier_this_week',
  'older',
];

const BUCKET_LABELS: Record<NotificationDayBucket, string> = {
  upcoming: 'Upcoming',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier_this_week: 'Earlier this week',
  older: 'Older',
};

/**
 * Buckets notification rows by their effective time relative to "now"
 * in the given IANA zone (defaults to PROJECT_TZ). Sort within bucket
 * is preserved — the caller is responsible for that ordering.
 *
 * Boundaries:
 *   * upcoming           — effective_at ≥ tomorrow-local-midnight
 *   * today              — [today-local-midnight, tomorrow-local-midnight)
 *   * yesterday          — [yesterday-local-midnight, today-local-midnight)
 *   * earlier_this_week  — [7-days-ago-local-midnight, yesterday-local-midnight)
 *   * older              — < 7-days-ago-local-midnight
 *
 * Each boundary is recomputed via localMidnightUnix so DST transitions
 * in non-Maputo zones land in the right bucket too.
 *
 * Pending rows live in the queue with fire_at in the future, so they
 * dominate the `upcoming` bucket. Fired rows (whether sent or failed)
 * carry past fired_at values and land in today/yesterday/older.
 */
export function groupNotificationsByDay(
  rows: NotificationRow[],
  now: Date = new Date(),
  tz: string = PROJECT_TZ,
): NotificationDayGroup[] {
  if (rows.length === 0) return [];

  const dayMs = 24 * 60 * 60 * 1000;
  const todayMidnightMs = localMidnightUnix(now, tz) * 1000;
  const tomorrowMidnightMs =
    localMidnightUnix(new Date(now.getTime() + dayMs), tz) * 1000;
  const yesterdayMidnightMs =
    localMidnightUnix(new Date(now.getTime() - dayMs), tz) * 1000;
  const weekAgoMidnightMs =
    localMidnightUnix(new Date(now.getTime() - 7 * dayMs), tz) * 1000;

  const buckets = new Map<NotificationDayBucket, NotificationRow[]>();

  for (const row of rows) {
    const ts = new Date(row.effective_at).getTime();
    let bucket: NotificationDayBucket;
    if (ts >= tomorrowMidnightMs) bucket = 'upcoming';
    else if (ts >= todayMidnightMs) bucket = 'today';
    else if (ts >= yesterdayMidnightMs) bucket = 'yesterday';
    else if (ts >= weekAgoMidnightMs) bucket = 'earlier_this_week';
    else bucket = 'older';

    const list = buckets.get(bucket) ?? [];
    list.push(row);
    buckets.set(bucket, list);
  }

  return BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({
    bucket: b,
    label: BUCKET_LABELS[b],
    rows: buckets.get(b)!,
  }));
}
