import { callRpc } from './rpc';
import type {
  NotificationsQueueRow,
  ReminderKind,
  ReminderStatus,
  ReminderChannel,
} from '@/types/database';

// Snapshot returned by rpc_list_my_reminders for the linked entity.
// Tasks and follow-ups expose the same surface for rendering.
export interface ReminderEntitySnapshot {
  title: string;
  branch: string | null;
  priority: string;
  due_date: string | null;
  status: string;
}

export interface MyReminder
  extends Pick<
    NotificationsQueueRow,
    | 'id'
    | 'kind'
    | 'entity_type'
    | 'entity_id'
    | 'channel'
    | 'status'
    | 'fire_at'
    | 'fired_at'
    | 'dismissed_at'
    | 'payload'
  > {
  kind: ReminderKind;
  channel: ReminderChannel;
  status: ReminderStatus;
  entity: ReminderEntitySnapshot | null;
}

export async function listMyReminders(
  args: { unreadOnly?: boolean; limit?: number } = {},
): Promise<MyReminder[]> {
  const result = await callRpc<MyReminder[] | null>('rpc_list_my_reminders', {
    p_unread_only: args.unreadOnly ?? true,
    p_limit: args.limit ?? 50,
  });
  return result ?? [];
}

export async function dismissReminder(queueId: number): Promise<NotificationsQueueRow> {
  return callRpc<NotificationsQueueRow>('rpc_dismiss_reminder', {
    p_queue_id: queueId,
  });
}

export async function cancelReminder(
  queueId: number,
  reason?: string | null,
): Promise<NotificationsQueueRow> {
  return callRpc<NotificationsQueueRow>('rpc_cancel_reminder', {
    p_queue_id: queueId,
    p_reason: reason ?? null,
  });
}

// Display labels per kind. Used by the dashboard list and audit log.
export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  start_reminder: 'Start by',
  follow_up_reminder: 'Mid-task check',
  deadline_reminder: 'Pre-deadline',
  recurring_spawn: 'Recurring spawn',
  followup_due: 'Follow-up today',
};

export function reminderTargetPath(r: MyReminder): string {
  if (r.entity_type === 'task') return `/tasks/${r.entity_id}`;
  if (r.entity_type === 'follow_up') return `/follow-ups/${r.entity_id}`;
  return '/';
}
