import { Link } from 'react-router-dom';
import { AlertCircle, Calendar, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  useCalendarLinkStatus,
  useGoogleCalendarToday,
} from '@/hooks/useGoogleCalendar';
import type { CalendarTodayEvent } from '@/lib/google-calendar';

function formatTime(iso: string | null, allDay: boolean): string {
  if (!iso) return '';
  if (allDay) return 'All day';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatRange(start: string | null, end: string | null, allDay: boolean): string {
  if (allDay) return 'All day';
  const s = formatTime(start, false);
  const e = formatTime(end, false);
  if (s && e && s !== e) return `${s} – ${e}`;
  return s || e || '';
}

export function DashboardCalendarToday() {
  const status = useCalendarLinkStatus();
  // needs_reconnect rows have connected=false but still warrant a card —
  // hiding would leave the operator with no signal that their connection
  // is broken.
  const needsReconnect = status.data?.needs_reconnect === true;
  const isConnected = status.data?.connected === true;
  const today = useGoogleCalendarToday(isConnected);

  // Hide entirely only when there's truly no connection on file. The
  // Settings card is the entry point in that state.
  if (!isConnected && !needsReconnect) return null;

  if (needsReconnect) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          <div className="border-border mb-1 flex items-baseline justify-between border-b pb-3">
            <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Today's calendar
            </span>
            <span className="text-subtle-foreground text-xs">
              {status.data?.email}
            </span>
          </div>
          <div className="text-foreground-72 inline-flex items-start gap-2 text-sm">
            <AlertCircle className="text-amber-600 mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Google Calendar needs reconnect.{' '}
              <Link
                to="/settings"
                className="text-primary-ink underline-offset-2 hover:underline"
              >
                Reconnect in Settings
              </Link>
              .
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const events = today.data?.events ?? [];
  // Per-fetch needs_reconnect (race window where the cached link-status
  // says connected but the Edge Function just discovered invalid_grant).
  const todayNeedsReconnect = today.data?.needs_reconnect === true;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="border-border mb-1 flex items-baseline justify-between border-b pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-section-label text-primary-ink/80 inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Today's calendar
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {events.length}
            </span>
          </div>
          <span className="text-subtle-foreground text-xs">
            {status.data?.email}
          </span>
        </div>

        {today.isLoading && (
          <div className="text-muted-foreground py-3 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!today.isLoading && todayNeedsReconnect && (
          <div className="text-foreground-72 inline-flex items-start gap-2 text-sm">
            <AlertCircle className="text-amber-600 mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Google Calendar needs reconnect.{' '}
              <Link
                to="/settings"
                className="text-primary-ink underline-offset-2 hover:underline"
              >
                Reconnect in Settings
              </Link>
              .
            </div>
          </div>
        )}

        {!today.isLoading && !todayNeedsReconnect && today.data?.error && (
          <div className="text-foreground-72 text-xs">
            Could not load events.{' '}
            <Link
              to="/settings"
              className="text-primary-ink underline-offset-2 hover:underline"
            >
              Open Settings
            </Link>
            .
          </div>
        )}

        {!today.isLoading && !todayNeedsReconnect && !today.data?.error && events.length === 0 && (
          <div className="text-muted-foreground py-2 text-sm">
            Nothing scheduled in Google Calendar today.
          </div>
        )}

        {!today.isLoading && events.length > 0 && (
          <ul className="divide-border divide-y">
            {events.map((e: CalendarTodayEvent) => (
              <li
                key={e.id}
                className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
              >
                <span className="text-foreground-72 w-24 shrink-0 text-xs tabular-nums">
                  {formatRange(e.start, e.end, e.all_day)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground line-clamp-1 text-sm font-medium">
                    {e.title}
                  </div>
                  {e.location && (
                    <div className="text-muted-foreground line-clamp-1 text-xs">
                      {e.location}
                    </div>
                  )}
                </div>
                {e.html_link && (
                  <a
                    href={e.html_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in Google Calendar"
                    className="text-muted-foreground hover:text-foreground shrink-0 self-center"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
