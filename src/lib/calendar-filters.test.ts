import { describe, expect, it } from 'vitest';
import {
  chipCounts,
  excludeDismissed,
  findLinkFor,
  formatDayHeader,
  groupByDay,
  indexDismissals,
  indexLinks,
  maputoTodayKey,
  partitionByLinked,
  todayWindowMaputo,
  upcoming7dWindow,
  masters90dWindow,
} from './calendar-filters';
import type { CalendarListEvent } from './calendar-list-edge';
import type { CalendarDismissal, CalendarLinkForUser } from './google-calendar';

// Build a CalendarListEvent fixture compactly.
function ev(over: Partial<CalendarListEvent> & { id: string }): CalendarListEvent {
  return {
    id: over.id,
    recurring_event_id: over.recurring_event_id ?? null,
    rrule: over.rrule ?? null,
    title: over.title ?? 'Title ' + over.id,
    description: null,
    location: null,
    start: over.start ?? null,
    end: over.end ?? null,
    all_day: over.all_day ?? false,
    html_link: null,
    organizer_email: null,
    attendee_count: 0,
    is_organizer: false,
  };
}

function dismissal(over: Partial<CalendarDismissal> & {
  google_event_id: string;
}): CalendarDismissal {
  return {
    google_calendar_id: 'primary',
    google_event_id: over.google_event_id,
    recurring_event_id: over.recurring_event_id ?? null,
    is_series_dismiss: over.is_series_dismiss ?? false,
    summary: null,
    event_start: null,
    event_end: null,
    all_day: null,
    html_link: null,
    rrule: null,
    note: null,
    dismissed_at: '2026-05-17T00:00:00Z',
    updated_at: '2026-05-17T00:00:00Z',
  };
}

function link(over: Partial<CalendarLinkForUser> & {
  google_event_id: string;
}): CalendarLinkForUser {
  return {
    link_id: 1,
    entity_type: over.entity_type ?? 'task',
    entity_id: over.entity_id ?? '00000000-0000-0000-0000-000000000001',
    entity_title: over.entity_title ?? 'Task title',
    google_calendar_id: 'primary',
    google_event_id: over.google_event_id,
    event_title: null,
    event_start: null,
    event_end: null,
    event_html_link: null,
    created_at: '2026-05-17T00:00:00Z',
    mine: true,
  };
}

describe('window math', () => {
  // Anchor the tests on a fixed instant so they're TZ-independent.
  // 2026-05-17 13:00 UTC = 15:00 Maputo (Sunday afternoon).
  const NOW = new Date('2026-05-17T13:00:00Z');

  it('todayWindowMaputo straddles 00:00 Africa/Maputo to 00:00 next day', () => {
    const w = todayWindowMaputo(NOW);
    expect(w.from).toBe('2026-05-17T00:00:00+02:00');
    expect(w.to).toBe('2026-05-18T00:00:00+02:00');
  });

  it('upcoming7dWindow spans 8 calendar days', () => {
    const w = upcoming7dWindow(NOW);
    expect(w.from).toBe('2026-05-17T00:00:00+02:00');
    expect(w.to).toBe('2026-05-25T00:00:00+02:00');
  });

  it('masters90dWindow uses ISO Z timestamps', () => {
    const w = masters90dWindow(NOW);
    expect(w.from).toBe('2026-05-17T13:00:00.000Z');
    expect(w.to).toBe('2026-08-15T13:00:00.000Z');
  });
});

describe('dismissal masking', () => {
  it('hides events whose id matches a dismissal', () => {
    const events = [
      ev({ id: 'a', start: '2026-05-17T09:00:00Z' }),
      ev({ id: 'b', start: '2026-05-17T10:00:00Z' }),
    ];
    const idx = indexDismissals([dismissal({ google_event_id: 'a' })]);
    expect(excludeDismissed(events, idx).map((e) => e.id)).toEqual(['b']);
  });

  it('hides instances whose recurring master is series-dismissed', () => {
    const events = [
      ev({ id: 'inst-1', recurring_event_id: 'master' }),
      ev({ id: 'inst-2', recurring_event_id: 'master' }),
      ev({ id: 'unrelated' }),
    ];
    const idx = indexDismissals([
      dismissal({
        google_event_id: 'master',
        recurring_event_id: 'master',
        is_series_dismiss: true,
      }),
    ]);
    expect(excludeDismissed(events, idx).map((e) => e.id)).toEqual(['unrelated']);
  });

  it('a series dismissal that lacks is_series_dismiss flag does NOT mask instances', () => {
    const events = [ev({ id: 'inst', recurring_event_id: 'master' })];
    const idx = indexDismissals([
      dismissal({
        google_event_id: 'master',
        recurring_event_id: 'master',
        is_series_dismiss: false, // only the master itself would be hidden
      }),
    ]);
    expect(excludeDismissed(events, idx)).toHaveLength(1);
  });

  it('empty input returns empty', () => {
    expect(excludeDismissed([], indexDismissals([]))).toEqual([]);
  });
});

describe('link masking', () => {
  it('findLinkFor matches by event id', () => {
    const e = ev({ id: 'evt-1' });
    const idx = indexLinks([link({ google_event_id: 'evt-1' })]);
    expect(findLinkFor(e, idx)?.google_event_id).toBe('evt-1');
  });

  it('findLinkFor falls back to recurring master id', () => {
    const e = ev({ id: 'inst', recurring_event_id: 'master' });
    const idx = indexLinks([link({ google_event_id: 'master' })]);
    expect(findLinkFor(e, idx)?.google_event_id).toBe('master');
  });

  it('returns null when neither id matches', () => {
    const e = ev({ id: 'lonely' });
    const idx = indexLinks([link({ google_event_id: 'other' })]);
    expect(findLinkFor(e, idx)).toBeNull();
  });

  it('partitionByLinked splits cleanly', () => {
    const a = ev({ id: 'a' });
    const b = ev({ id: 'b' });
    const c = ev({ id: 'c-inst', recurring_event_id: 'c-master' });
    const idx = indexLinks([
      link({ google_event_id: 'a' }),
      link({ google_event_id: 'c-master' }),
    ]);
    const out = partitionByLinked([a, b, c], idx);
    expect(out.linked.map((e) => e.id)).toEqual(['a', 'c-inst']);
    expect(out.unlinked.map((e) => e.id)).toEqual(['b']);
  });
});

describe('day grouping', () => {
  it('buckets events into local Maputo days', () => {
    // 2026-05-17 23:00 UTC = 2026-05-18 01:00 Maputo → falls into the 18th.
    // 2026-05-17 09:00 UTC = 11:00 Maputo → 17th.
    const buckets = groupByDay([
      ev({ id: 'late', start: '2026-05-17T23:00:00Z' }),
      ev({ id: 'mid',  start: '2026-05-17T09:00:00Z' }),
    ]);
    expect(buckets.map((b) => b.dateKey)).toEqual(['2026-05-17', '2026-05-18']);
    expect(buckets[0].events[0].id).toBe('mid');
    expect(buckets[1].events[0].id).toBe('late');
  });

  it('treats all-day YYYY-MM-DD start as its own day key', () => {
    const buckets = groupByDay([ev({ id: 'all', start: '2026-05-20', all_day: true })]);
    expect(buckets[0].dateKey).toBe('2026-05-20');
  });

  it('preserves intra-day insertion order', () => {
    const buckets = groupByDay([
      ev({ id: 'b', start: '2026-05-17T10:00:00Z' }),
      ev({ id: 'a', start: '2026-05-17T09:00:00Z' }),
    ]);
    expect(buckets[0].events.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('empty input → empty output', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('formatDayHeader', () => {
  // Anchor on 2026-05-17 13:00 UTC = 15:00 Maputo, Sunday.
  const NOW = new Date('2026-05-17T13:00:00Z');

  it('today key renders as Today · <weekday>, <Mon Day>', () => {
    expect(formatDayHeader('2026-05-17', NOW)).toBe('Today · Sun, May 17');
  });

  it('tomorrow key renders as Tomorrow · <weekday>, <Mon Day>', () => {
    expect(formatDayHeader('2026-05-18', NOW)).toBe('Tomorrow · Mon, May 18');
  });

  it('further days render as <weekday>, <Mon Day>', () => {
    expect(formatDayHeader('2026-05-21', NOW)).toBe('Thu, May 21');
  });
});

describe('chipCounts', () => {
  const NOW = new Date('2026-05-17T13:00:00Z');
  const todayKey = maputoTodayKey(NOW);

  it('today/upcoming/unlinked/linked/ignored counts with no recurring data', () => {
    const events = [
      ev({ id: 'today-1', start: '2026-05-17T09:00:00Z' }),
      ev({ id: 'today-2', start: '2026-05-17T15:00:00Z' }),
      ev({ id: 'tomorrow-1', start: '2026-05-18T09:00:00Z' }),
      ev({ id: 'dismissed', start: '2026-05-17T10:00:00Z' }),
    ];
    const links = [link({ google_event_id: 'today-1' })];
    const dismissals = [dismissal({ google_event_id: 'dismissed' })];
    const out = chipCounts({
      instances: events,
      links,
      dismissals,
      recurringLoaded: false,
      recurringMasters: null,
      todayKey,
    });
    expect(out).toEqual({
      today: 2,
      upcoming: 3,
      recurring: null,
      unlinked: 2,
      linked: 1,
      ignored: 1,
    });
  });

  it('recurring count is the masters length minus series-dismissed when loaded', () => {
    const masters = [
      ev({ id: 'series-a', rrule: 'RRULE:FREQ=DAILY' }),
      ev({ id: 'series-b', rrule: 'RRULE:FREQ=WEEKLY' }),
      ev({ id: 'series-c', rrule: 'RRULE:FREQ=MONTHLY' }),
    ];
    const dismissals = [
      dismissal({
        google_event_id: 'series-a',
        recurring_event_id: 'series-a',
        is_series_dismiss: true,
      }),
    ];
    const out = chipCounts({
      instances: [],
      links: [],
      dismissals,
      recurringLoaded: true,
      recurringMasters: masters,
      todayKey,
    });
    expect(out.recurring).toBe(2);
    expect(out.ignored).toBe(1);
  });

  it('all empty inputs yield zeros + null recurring', () => {
    const out = chipCounts({
      instances: null,
      links: null,
      dismissals: null,
      recurringLoaded: false,
      recurringMasters: null,
      todayKey,
    });
    expect(out).toEqual({
      today: 0,
      upcoming: 0,
      recurring: null,
      unlinked: 0,
      linked: 0,
      ignored: 0,
    });
  });
});
