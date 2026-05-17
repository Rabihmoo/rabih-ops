import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  useCalendarDismissals,
  useCalendarLinkStatus,
  useCalendarLinksForUser,
  useGoogleCalendarList,
} from '@/hooks/useGoogleCalendar';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarFilterChips } from '@/components/calendar/CalendarFilterChips';
import { CalendarEventRow } from '@/components/calendar/CalendarEventRow';
import {
  chipCounts,
  excludeDismissed,
  findLinkFor,
  formatDayHeader,
  groupByDay,
  indexDismissals,
  indexLinks,
  masters90dWindow,
  maputoTodayKey,
  partitionByLinked,
  upcoming7dWindow,
  type CalendarFilterKey,
} from '@/lib/calendar-filters';
import type { CalendarListEvent } from '@/lib/calendar-list-edge';
import type {
  CalendarDismissal,
  CalendarLinkForUser,
} from '@/lib/google-calendar';

const VALID_KEYS: CalendarFilterKey[] = [
  'today',
  'upcoming',
  'recurring',
  'unlinked',
  'linked',
  'ignored',
];

function readFilterFromUrl(value: string | null): CalendarFilterKey {
  if (value && (VALID_KEYS as string[]).includes(value)) {
    return value as CalendarFilterKey;
  }
  return 'today';
}

export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = readFilterFromUrl(searchParams.get('filter'));
  const qc = useQueryClient();

  const status = useCalendarLinkStatus();
  const connected = status.data?.connected === true;

  // 8-day window covers Today / Upcoming / Linked / Unlinked.
  const upcoming = useMemo(() => upcoming7dWindow(), []);
  const masters = useMemo(() => masters90dWindow(), []);
  const todayKey = useMemo(() => maputoTodayKey(), []);

  const instances = useGoogleCalendarList(
    upcoming.from,
    upcoming.to,
    'instances',
    connected,
  );
  const mastersQ = useGoogleCalendarList(
    masters.from,
    masters.to,
    'masters',
    connected && active === 'recurring',
  );
  const linksQ = useCalendarLinksForUser(upcoming.from, upcoming.to, connected);
  const dismissalsQ = useCalendarDismissals(connected);

  const counts = useMemo(
    () =>
      chipCounts({
        instances: instances.data?.events ?? null,
        links: linksQ.data ?? null,
        dismissals: dismissalsQ.data ?? null,
        recurringLoaded: mastersQ.isSuccess,
        recurringMasters: mastersQ.data?.events ?? null,
        todayKey,
      }),
    [
      instances.data,
      linksQ.data,
      dismissalsQ.data,
      mastersQ.isSuccess,
      mastersQ.data,
      todayKey,
    ],
  );

  function selectFilter(key: CalendarFilterKey) {
    const next = new URLSearchParams(searchParams);
    if (key === 'today') next.delete('filter');
    else next.set('filter', key);
    setSearchParams(next, { replace: true });
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['google-calendar', 'list'] });
    qc.invalidateQueries({ queryKey: ['google-calendar', 'links-for-user'] });
    qc.invalidateQueries({ queryKey: ['google-calendar', 'dismissals'] });
  }

  const isLoadingAny =
    instances.isLoading ||
    linksQ.isLoading ||
    dismissalsQ.isLoading ||
    (active === 'recurring' && mastersQ.isLoading);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground inline-flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <CalendarDays className="h-6 w-6" /> Calendar
          </h1>
          <p className="text-muted-foreground text-sm">
            {connected
              ? `Connected as ${status.data?.email}`
              : 'Not connected — open Settings to link Google Calendar.'}
          </p>
        </div>
        {connected && (
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            data-testid="calendar-refresh"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        )}
      </header>

      {!connected ? (
        <NotConnectedCard />
      ) : (
        <>
          <CalendarFilterChips
            active={active}
            counts={counts}
            onSelect={selectFilter}
          />

          {isLoadingAny ? (
            <LoadingCard />
          ) : (
            <RenderActive
              active={active}
              instances={instances.data?.events ?? []}
              instancesError={instances.data?.error ?? null}
              masters={mastersQ.data?.events ?? []}
              mastersError={mastersQ.data?.error ?? null}
              links={linksQ.data ?? []}
              dismissals={dismissalsQ.data ?? []}
              todayKey={todayKey}
            />
          )}
        </>
      )}
    </div>
  );
}

function NotConnectedCard() {
  return (
    <Card data-testid="calendar-not-connected">
      <CardContent className="space-y-3 p-8 text-center">
        <CalendarDays className="text-muted-foreground mx-auto h-8 w-8" />
        <p className="text-foreground text-sm">
          Connect Google Calendar to see your events here.
        </p>
        <Button asChild size="sm">
          <Link to="/settings">Open Settings</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="text-muted-foreground p-6 text-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading calendar events…
      </CardContent>
    </Card>
  );
}

interface RenderProps {
  active: CalendarFilterKey;
  instances: CalendarListEvent[];
  instancesError: string | null;
  masters: CalendarListEvent[];
  mastersError: string | null;
  links: CalendarLinkForUser[];
  dismissals: CalendarDismissal[];
  todayKey: string;
}

function RenderActive({
  active,
  instances,
  instancesError,
  masters,
  mastersError,
  links,
  dismissals,
  todayKey,
}: RenderProps) {
  const dismissalIdx = useMemo(() => indexDismissals(dismissals), [dismissals]);
  const linkIdx = useMemo(() => indexLinks(links), [links]);

  if (active === 'ignored') {
    return <IgnoredList dismissals={dismissals} />;
  }
  if (active === 'recurring') {
    if (mastersError) return <ErrorCard message={mastersError} />;
    const visibleMasters = excludeDismissed(masters, dismissalIdx);
    return <RecurringList masters={visibleMasters} />;
  }

  if (instancesError) return <ErrorCard message={instancesError} />;

  const visible = excludeDismissed(instances, dismissalIdx);
  let projected: CalendarListEvent[];
  if (active === 'today') {
    projected = visible.filter((e) => {
      // Project Today out of the 8-day window using the same day key
      // logic as groupByDay.
      const key = (e.start ?? '').slice(0, 10);
      // For full ISO timestamps fall through to groupByDay's helper —
      // here we approximate with the start prefix because instances
      // are already in [today, today+8) Maputo. The shared helper
      // produces the right key from a full ISO too.
      // To stay correct across DST-free zones, defer to the helper:
      if (e.all_day) return key === todayKey;
      // Re-use groupByDay semantics by computing the same key inline.
      return maputoMatch(e.start, todayKey);
    });
  } else if (active === 'unlinked') {
    projected = partitionByLinked(visible, linkIdx).unlinked;
  } else if (active === 'linked') {
    projected = partitionByLinked(visible, linkIdx).linked;
  } else {
    projected = visible;
  }

  if (projected.length === 0) {
    return <EmptyCard message="Nothing in this view." />;
  }
  return <DayGroupedList events={projected} links={linkIdx} />;
}

// Same Maputo-day comparison the helper uses, kept inline so the page
// doesn't have to re-export an internal helper.
function maputoMatch(iso: string | null, todayKey: string): boolean {
  if (!iso) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso === todayKey;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Maputo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d) === todayKey;
}

function DayGroupedList({
  events,
  links,
}: {
  events: CalendarListEvent[];
  links: ReturnType<typeof indexLinks>;
}) {
  const buckets = useMemo(() => groupByDay(events), [events]);
  return (
    <div className="space-y-5">
      {buckets.map((b) => (
        <div key={b.dateKey} data-testid={`calendar-day-${b.dateKey}`}>
          <div className="text-section-label mb-2">
            {formatDayHeader(b.dateKey)}
          </div>
          <Card>
            <CardContent className="p-2">
              <ul className="divide-border divide-y">
                {b.events.map((e) => (
                  <CalendarEventRow
                    key={e.id}
                    event={e}
                    link={findLinkFor(e, links)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

function RecurringList({ masters }: { masters: CalendarListEvent[] }) {
  if (masters.length === 0) {
    return <EmptyCard message="No recurring series in the next 90 days." />;
  }
  const sorted = [...masters].sort((a, b) =>
    (a.title ?? '').localeCompare(b.title ?? ''),
  );
  return (
    <div className="space-y-2">
      <div className="text-section-label">Recurring series</div>
      <Card>
        <CardContent className="p-2">
          <ul className="divide-border divide-y">
            {sorted.map((m) => (
              <li
                key={m.id}
                data-testid="calendar-recurring-row"
                className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-foreground line-clamp-1 text-sm font-medium">
                    {m.title}
                  </div>
                  {m.rrule && (
                    <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs tabular-nums">
                      {m.rrule}
                    </div>
                  )}
                </div>
                {m.html_link && (
                  <a
                    href={m.html_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in Google Calendar"
                    className="text-muted-foreground hover:text-foreground shrink-0 self-center"
                    data-testid="calendar-event-open-google"
                  >
                    {/* External link icon imported in CalendarEventRow; here we
                        re-use the same testid + aria but inline an icon to avoid
                        an extra component just for this list. */}
                    <span aria-hidden>↗</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function IgnoredList({ dismissals }: { dismissals: CalendarDismissal[] }) {
  if (dismissals.length === 0) {
    return <EmptyCard message="Nothing ignored." />;
  }
  return (
    <div className="space-y-2">
      <div className="text-section-label">Ignored</div>
      <Card>
        <CardContent className="p-2">
          <ul className="divide-border divide-y">
            {dismissals.map((d) => (
              <li
                key={`${d.google_calendar_id}:${d.google_event_id}`}
                data-testid="calendar-ignored-row"
                className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-foreground line-clamp-1 text-sm font-medium">
                    {d.summary ?? '(no title)'}
                    {d.is_series_dismiss && (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        (series)
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    Ignored {new Date(d.dismissed_at).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {d.note ? ` · ${d.note}` : ''}
                  </div>
                </div>
                {d.html_link && (
                  <a
                    href={d.html_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in Google Calendar"
                    className="text-muted-foreground hover:text-foreground shrink-0 self-center"
                  >
                    <span aria-hidden>↗</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent
        className="text-muted-foreground p-6 text-sm"
        data-testid="calendar-empty"
      >
        {message}
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent
        className="text-destructive-ink p-6 text-sm"
        data-testid="calendar-error"
      >
        Could not load events: {message}
      </CardContent>
    </Card>
  );
}
