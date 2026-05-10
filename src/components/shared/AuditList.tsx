// Generic audit timeline used by every module's detail view.
import { cn } from '@/lib/utils';

export interface AuditEntry {
  id: number;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string;
}

const ACTION_VERB: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  complete: 'Marked finished',
  snooze: 'Snoozed',
  delete: 'Deleted',
  comment: 'Added a comment',
  comment_delete: 'Removed a comment',
  attach: 'Attached a file',
  detach: 'Removed an attachment',
  resolve: 'Resolved',
  // Task lifecycle (Phase A)
  status_change: 'Changed status',
  wait: 'Marked waiting',
  resume: 'Resumed',
  delay: 'Marked delayed',
  request_repeat: 'Requested repeat',
  archive: 'Archived',
  reminders_set: 'Updated reminders',
  recurring_create: 'Created recurring template',
  recurring_spawn: 'Spawned a recurring instance',
  // Reminder engine (Phase B)
  reminder_enqueued: 'Reminder scheduled',
  reminder_sent: 'Reminder fired',
  reminder_dismissed: 'Dismissed a reminder',
  reminder_cancelled: 'Cancelled a reminder',
  reminder_failed: 'Reminder delivery failed',
  // Google Calendar (Phase D)
  calendar_linked: 'Connected Google Calendar',
  calendar_unlinked: 'Disconnected Google Calendar',
  calendar_event_created: 'Created a calendar event',
  calendar_event_deleted: 'Removed a calendar event',
  // Telegram lifecycle
  telegram_link: 'Linked Telegram',
  telegram_unlink: 'Unlinked Telegram',
  // Purchasing-specific
  submit: 'Submitted for approval',
  approve: 'Approved and ordered',
  delivery: 'Recorded a delivery',
  payment: 'Recorded a payment',
  cancel: 'Cancelled',
};

// Tone applied to the leading dot for each action — gives the timeline
// a peripheral-vision colour signal (green completes, red deletes, etc.).
const ACTION_TONE: Record<string, string> = {
  create: 'bg-primary',
  update: 'bg-muted-foreground',
  complete: 'bg-success',
  snooze: 'bg-warning',
  delete: 'bg-destructive',
  comment: 'bg-muted-foreground',
  comment_delete: 'bg-muted-foreground',
  attach: 'bg-muted-foreground',
  detach: 'bg-muted-foreground',
  resolve: 'bg-success',
  submit: 'bg-primary',
  approve: 'bg-success',
  delivery: 'bg-primary',
  payment: 'bg-success',
  cancel: 'bg-destructive',
  status_change: 'bg-primary',
  wait: 'bg-warning',
  resume: 'bg-primary',
  delay: 'bg-destructive',
  request_repeat: 'bg-destructive',
  archive: 'bg-muted-foreground',
  reminders_set: 'bg-muted-foreground',
  recurring_create: 'bg-primary',
  recurring_spawn: 'bg-primary',
  reminder_enqueued: 'bg-muted-foreground',
  reminder_sent: 'bg-primary',
  reminder_dismissed: 'bg-muted-foreground',
  reminder_cancelled: 'bg-muted-foreground',
  reminder_failed: 'bg-destructive',
  calendar_linked: 'bg-primary',
  calendar_unlinked: 'bg-muted-foreground',
  calendar_event_created: 'bg-primary',
  calendar_event_deleted: 'bg-muted-foreground',
  telegram_link: 'bg-primary',
  telegram_unlink: 'bg-muted-foreground',
};

const TRACKED_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'category',
  'branch',
  'assigned_to',
  'due_date',
  'snoozed_until',
  'task_id',
  'person',
  'outcome',
  // Task lifecycle (Phase A)
  'waiting_on_user_id',
  'waiting_on_label',
  'delay_reason',
  'repeat_reason',
  'completion_note',
  'start_reminder_at',
  'follow_up_reminder_at',
  'deadline_reminder_at',
  // Purchasing
  'supplier_name',
  'payment_status',
  'payment_method',
  'total_amount',
  'amount_paid',
  'qty_ordered',
  'qty_received',
  'expected_delivery_date',
  'actual_delivery_date',
  'reminder_date',
  'order_date',
  'currency',
] as const;

function diffSummary(before: unknown, after: unknown): string[] {
  if (before == null || after == null) return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const lines: string[] = [];
  for (const field of TRACKED_FIELDS) {
    const bv = b[field];
    const av = a[field];
    if (bv !== av) {
      lines.push(`${field}: ${formatVal(bv)} → ${formatVal(av)}`);
    }
  }
  return lines;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  return String(v);
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-muted-foreground text-sm">No activity yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const verb = ACTION_VERB[e.action] ?? e.action;
        const tone = ACTION_TONE[e.action] ?? 'bg-muted-foreground';
        const diff =
          e.action === 'update' ||
          e.action === 'snooze' ||
          e.action === 'status_change' ||
          e.action === 'wait' ||
          e.action === 'resume' ||
          e.action === 'delay' ||
          e.action === 'request_repeat' ||
          e.action === 'reminders_set' ||
          e.action === 'complete'
            ? diffSummary(e.before_state, e.after_state)
            : [];
        return (
          <li key={e.id} className="flex gap-3">
            <div className="relative flex flex-col items-center pt-1.5">
              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', tone)} />
              <span className="bg-border w-px flex-1 mt-1" aria-hidden />
            </div>
            <div className="flex-1 pb-2">
              <div className="text-sm">
                <span className="text-foreground font-semibold">{e.user_name}</span>
                <span className="text-muted-foreground"> {verb}</span>
              </div>
              <div className="text-subtle-foreground text-xs">
                {relativeTime(e.created_at)}
              </div>
              {diff.length > 0 && (
                <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
                  {diff.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
