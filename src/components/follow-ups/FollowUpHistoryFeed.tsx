import {
  Bell,
  BellOff,
  Calendar,
  CalendarOff,
  Mail,
  MessageSquare,
  Repeat,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatFollowUpEvent,
  type FollowUpEventIcon,
  type FollowUpEventTone,
} from '@/lib/follow-up-event-display';
import type { FollowUpEventWithActor } from '@/types/database';

// F1.2 — user-facing history feed for follow-ups. Mirrors the visual
// rhythm of AuditList (dotted timeline) but each row is event-kind-aware:
// status_change shows the new status verb, note shows the body, etc.
//
// Newest first to match the existing audit feed order.

const ICON_FOR_KIND: Record<FollowUpEventIcon, React.ComponentType<{ className?: string }>> = {
  note:          MessageSquare,
  status:        ArrowRight,
  reminder_on:   Bell,
  reminder_off:  BellOff,
  calendar_on:   Calendar,
  calendar_off:  CalendarOff,
  invitee:       Mail,
  postponed:     Repeat,
};

// Tailwind tone classes per FollowUpEventTone — applied to the dot +
// icon-foreground. Kept close to the AuditList palette so the visual
// language is consistent across both timelines.
const DOT_TONE: Record<FollowUpEventTone, string> = {
  muted:    'bg-muted-foreground',
  info:     'bg-primary',
  success:  'bg-success',
  warning:  'bg-warning',
  critical: 'bg-destructive',
};

const ICON_TONE: Record<FollowUpEventTone, string> = {
  muted:    'text-muted-foreground',
  info:     'text-primary',
  success:  'text-success-ink',
  warning:  'text-warning-ink',
  critical: 'text-destructive-ink',
};

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

interface Props {
  events: FollowUpEventWithActor[];
}

export function FollowUpHistoryFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-muted-foreground text-sm" data-testid="follow-up-history-empty">
        No history yet. Status changes, notes, and reminders will appear here.
      </div>
    );
  }

  return (
    <ol className="space-y-3" data-testid="follow-up-history-feed">
      {events.map((ev) => {
        const d = formatFollowUpEvent(ev);
        const Icon = ICON_FOR_KIND[d.icon];
        return (
          <li
            key={ev.id}
            data-testid="follow-up-history-row"
            data-kind={ev.kind}
            className="flex gap-3"
          >
            <div className="relative flex flex-col items-center pt-1.5">
              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', DOT_TONE[d.tone])} />
              <span aria-hidden className="bg-border mt-1 w-px flex-1" />
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-1.5 text-sm">
                <Icon
                  aria-hidden
                  className={cn('h-3.5 w-3.5 shrink-0', ICON_TONE[d.tone])}
                />
                <span className="text-foreground">{d.title}</span>
              </div>
              <div className="text-subtle-foreground text-xs">
                {relativeTime(ev.created_at)}
              </div>
              {d.body && (
                <p
                  data-testid="follow-up-history-body"
                  className="text-muted-foreground mt-1.5 text-sm leading-relaxed whitespace-pre-wrap"
                >
                  {d.body}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
