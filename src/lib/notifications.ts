// Client lib for the in-app Reminder / Notification Center.
//
// Wraps the four SECURITY DEFINER RPCs shipped in
// supabase/migrations/20260613_notification_read_state.sql:
//
//   rpc_list_notifications        — unified read (fired + pending)
//   rpc_count_unread_notifications — topbar badge backing
//   rpc_mark_notification_read    — recipient-only write
//   rpc_mark_all_notifications_read
//
// The pure groupNotificationsByDay() helper splits the flat array into
// labeled day buckets for the /notifications page. It anchors on
// PROJECT_TZ so the buckets agree with telegram-tick, gmail-list-today,
// and audit-log timestamps about what "today" is.

import { callRpc } from './rpc';
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

export interface ListNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
  channel?: NotificationChannel | null;
}

// =====================================================================
// RPC wrappers
// =====================================================================

export async function listNotifications(
  opts: ListNotificationsOptions = {},
): Promise<NotificationRow[]> {
  const data = await callRpc<NotificationRow[] | null>('rpc_list_notifications', {
    p_limit: opts.limit ?? 50,
    p_unread_only: opts.unreadOnly ?? false,
    p_channel: opts.channel ?? null,
  });
  return data ?? [];
}

export async function countUnreadNotifications(): Promise<number> {
  const data = await callRpc<number | null>(
    'rpc_count_unread_notifications',
    {},
  );
  return data ?? 0;
}

export async function markNotificationRead(
  logId: number,
): Promise<FiredNotificationRow> {
  return await callRpc<FiredNotificationRow>('rpc_mark_notification_read', {
    p_log_id: logId,
  });
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await callRpc<number | null>(
    'rpc_mark_all_notifications_read',
    {},
  );
  return data ?? 0;
}

export async function cancelMyPendingReminder(queueId: number): Promise<unknown> {
  return await callRpc<unknown>('rpc_cancel_my_pending_reminder', {
    p_queue_id: queueId,
  });
}

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
