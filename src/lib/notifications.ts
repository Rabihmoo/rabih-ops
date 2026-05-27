// Client lib for the in-app Reminder / Notification Center.
//
// Wraps the four SECURITY DEFINER RPCs shipped in
// supabase/migrations/20260613_notification_read_state.sql and
// 20260614_rpc_cancel_my_pending_reminder.sql.
//
// Types + the pure groupNotificationsByDay() helper live in
// notifications-display.ts so vitest can exercise them without
// loading ./rpc → ./supabase (which throws at module-init time when
// VITE_SUPABASE_* env vars are absent — CI's unit job runs that way
// on purpose). This file re-exports those names so existing imports
// of `@/lib/notifications` keep working unchanged.

import { callRpc } from './rpc';
import type {
  FiredNotificationRow,
  NotificationChannel,
} from './notifications-display';

export type {
  FiredNotificationRow,
  NotificationChannel,
  NotificationDayBucket,
  NotificationDayGroup,
  NotificationEntity,
  NotificationEntityType,
  NotificationRow,
  PendingNotificationRow,
} from './notifications-display';
export { groupNotificationsByDay } from './notifications-display';

// =====================================================================
// RPC option types
// =====================================================================

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
): Promise<
  import('./notifications-display').NotificationRow[]
> {
  const data = await callRpc<
    import('./notifications-display').NotificationRow[] | null
  >('rpc_list_notifications', {
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
