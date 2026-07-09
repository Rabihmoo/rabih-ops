import { ExternalLink, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/ui/status-chip';
import type { CalendarListEvent } from '@/lib/calendar-list-edge';
import type { CalendarLinkForUser } from '@/lib/google-calendar';

function formatTimeRange(
  start: string | null,
  end: string | null,
  allDay: boolean,
): string {
  if (allDay) return 'All day';
  if (!start) return '';
  const s = new Date(start);
  const sTime = s.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!end) return sTime;
  const e = new Date(end);
  const eTime = e.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (sTime === eTime) return sTime;
  return `${sTime} – ${eTime}`;
}

const ENTITY_LABEL: Record<CalendarLinkForUser['entity_type'], string> = {
  task: 'task',
  follow_up: 'follow-up',
  fixed_task: 'fixed task',
};

export function CalendarEventRow({
  event,
  link,
}: {
  event: CalendarListEvent;
  link: CalendarLinkForUser | null;
}) {
  const isRecurring = !!event.recurring_event_id || !!event.rrule;
  const timeLabel = formatTimeRange(event.start, event.end, event.all_day);

  // Sub-line bits: location · linked-to · ↻ Series. Joined with bullets.
  const subParts: React.ReactNode[] = [];
  if (event.location) subParts.push(<span key="loc">{event.location}</span>);
  if (link) {
    subParts.push(
      <span key="linked" className="inline-flex items-center gap-1">
        <StatusChip tone="info" size="xs">
          Linked to {ENTITY_LABEL[link.entity_type]}
        </StatusChip>
        {link.entity_title && (
          <span className="text-foreground-72 line-clamp-1">{link.entity_title}</span>
        )}
      </span>,
    );
  }
  if (isRecurring) {
    subParts.push(
      <StatusChip key="rec" tone="muted" size="xs">
        <Repeat className="mr-0.5 inline h-2.5 w-2.5" />
        Series
      </StatusChip>,
    );
  }
  // All-day indication lives in the time column (and the mobile sub-line
  // copy underneath the title) — formatTimeRange returns "All day" for
  // those rows. No badge needed; a second "All day" chip here would
  // duplicate the information.

  return (
    <li
      data-testid="calendar-event-row"
      className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <span
        className={cn(
          'text-foreground-72 w-24 shrink-0 text-xs tabular-nums',
          'hidden sm:inline-block',
        )}
      >
        {timeLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-foreground line-clamp-1 text-sm font-medium">
          {event.title}
        </div>
        <div className="text-muted-foreground sm:hidden mt-0.5 text-xs tabular-nums">
          {timeLabel}
        </div>
        {subParts.length > 0 && (
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {subParts.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
      {event.html_link && (
        <a
          href={event.html_link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in Google Calendar"
          className="text-muted-foreground hover:text-foreground shrink-0 self-center"
          data-testid="calendar-event-open-google"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}
