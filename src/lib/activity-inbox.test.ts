import { describe, expect, it, vi } from 'vitest';

// activity-inbox.ts transitively imports ./supabase (via ./rpc and the
// gmail/calendar libs), which throws if env vars aren't set. We don't
// touch any network paths in this test — only pure composer/normalizer
// logic — so mocking the supabase client module is sufficient.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  composeActivityInbox,
  normalizeCalendarEvent,
  normalizeGmailMessage,
  severityRank,
  type ActivityItem,
} from './activity-inbox';
import type { GmailImportantMessage } from './gmail';
import type { CalendarTodayEvent } from './google-calendar';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function dbItem(
  partial: Partial<ActivityItem> & Pick<ActivityItem, 'source' | 'native_id' | 'severity' | 'occurred_at'>,
): ActivityItem {
  return {
    title: partial.title ?? `${partial.source} title`,
    summary: partial.summary ?? null,
    branch: partial.branch ?? null,
    entity_url: partial.entity_url ?? '/',
    due_at: partial.due_at ?? null,
    is_unread: partial.is_unread ?? false,
    is_blocked: partial.is_blocked ?? false,
    meta: partial.meta ?? {},
    ...partial,
    id: `${partial.source}:${partial.native_id}`,
  };
}

const gmailMsg = (overrides: Partial<GmailImportantMessage> = {}): GmailImportantMessage => ({
  id: 'gmail-1',
  thread_id: 't-1',
  subject: 'Hello',
  from_address: 'sender@example.com',
  from_name: 'Sample Sender',
  snippet: 'hi there',
  internal_date: '2026-05-11T08:00:00Z',
  html_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-1',
  is_unread: true,
  ...overrides,
});

const calEvt = (overrides: Partial<CalendarTodayEvent> = {}): CalendarTodayEvent => ({
  id: 'cal-1',
  title: 'Inspection walkthrough',
  start: null,
  end: null,
  all_day: false,
  location: null,
  html_link: null,
  ...overrides,
});

// ---------------------------------------------------------------------
// severityRank
// ---------------------------------------------------------------------

describe('severityRank', () => {
  it('orders critical < overdue < due_today < soon < info', () => {
    expect(severityRank('critical')).toBeLessThan(severityRank('overdue'));
    expect(severityRank('overdue')).toBeLessThan(severityRank('due_today'));
    expect(severityRank('due_today')).toBeLessThan(severityRank('soon'));
    expect(severityRank('soon')).toBeLessThan(severityRank('info'));
  });

  it('returns 5 for unknown severity strings', () => {
    expect(severityRank('mystery')).toBe(5);
  });
});

// ---------------------------------------------------------------------
// normalizeGmailMessage
// ---------------------------------------------------------------------

describe('normalizeGmailMessage', () => {
  it('produces a uniform ActivityItem with source=gmail and severity=info', () => {
    const m = gmailMsg();
    const item = normalizeGmailMessage(m);
    expect(item.source).toBe('gmail');
    expect(item.id).toBe('gmail:gmail-1');
    expect(item.native_id).toBe('gmail-1');
    expect(item.title).toBe('Hello');
    expect(item.summary).toBe('hi there');
    expect(item.severity).toBe('info');
    expect(item.is_unread).toBe(true);
    expect(item.entity_url).toContain('mail.google.com');
  });

  it("falls back to '(no subject)' when subject is missing", () => {
    const item = normalizeGmailMessage(gmailMsg({ subject: null }));
    expect(item.title).toBe('(no subject)');
  });

  it('builds an inbox URL when html_link is null', () => {
    const item = normalizeGmailMessage(gmailMsg({ html_link: null, id: 'XYZ' }));
    expect(item.entity_url).toBe('https://mail.google.com/mail/u/0/#inbox/XYZ');
  });
});

// ---------------------------------------------------------------------
// normalizeCalendarEvent — severity depends on start vs now
// ---------------------------------------------------------------------

describe('normalizeCalendarEvent', () => {
  const now = new Date('2026-05-11T09:00:00Z');

  it('flags events starting within the next 60 minutes as due_today', () => {
    const item = normalizeCalendarEvent(
      calEvt({ start: '2026-05-11T09:30:00Z' }),
      now,
    );
    expect(item.severity).toBe('due_today');
  });

  it('flags events that started up to 2 hours ago as due_today (in-progress)', () => {
    const item = normalizeCalendarEvent(
      calEvt({ start: '2026-05-11T07:30:00Z' }),
      now,
    );
    expect(item.severity).toBe('due_today');
  });

  it('flags events later today as soon', () => {
    const item = normalizeCalendarEvent(
      calEvt({ start: '2026-05-11T16:00:00Z' }),
      now,
    );
    expect(item.severity).toBe('soon');
  });

  it('flags events more than 24h away as info', () => {
    const item = normalizeCalendarEvent(
      calEvt({ start: '2026-05-15T09:00:00Z' }),
      now,
    );
    expect(item.severity).toBe('info');
  });

  it('passes through location as summary', () => {
    const item = normalizeCalendarEvent(
      calEvt({ start: '2026-05-11T16:00:00Z', location: 'BBQ House — counter' }),
      now,
    );
    expect(item.summary).toBe('BBQ House — counter');
  });
});

// ---------------------------------------------------------------------
// composeActivityInbox — merge, dedupe, sort
// ---------------------------------------------------------------------

describe('composeActivityInbox', () => {
  const now = new Date('2026-05-11T09:00:00Z');

  it('merges DB + Gmail + Calendar into one stream', () => {
    const db = [
      dbItem({ source: 'task', native_id: 't1', severity: 'overdue', occurred_at: '2026-05-10T10:00:00Z' }),
      dbItem({ source: 'follow_up', native_id: 'f1', severity: 'due_today', occurred_at: '2026-05-11T08:00:00Z' }),
    ];
    const gmail = [gmailMsg({ id: 'g1' })];
    const calendar = [calEvt({ id: 'c1', start: '2026-05-11T16:00:00Z' })];

    const items = composeActivityInbox({
      dbItems: db,
      gmailMessages: gmail,
      calendarEvents: calendar,
      now,
    });
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.source).sort()).toEqual(
      ['calendar', 'follow_up', 'gmail', 'task'].sort(),
    );
  });

  it('orders by severity rank ascending, then occurred_at descending', () => {
    const db = [
      dbItem({ source: 'document',           native_id: 'd1', severity: 'info',     occurred_at: '2026-05-11T08:00:00Z' }),
      dbItem({ source: 'task',               native_id: 't1', severity: 'overdue',  occurred_at: '2026-05-10T10:00:00Z' }),
      dbItem({ source: 'inspection_finding', native_id: 'i1', severity: 'critical', occurred_at: '2026-05-09T10:00:00Z' }),
      dbItem({ source: 'follow_up',          native_id: 'f1', severity: 'due_today', occurred_at: '2026-05-11T07:00:00Z' }),
      dbItem({ source: 'follow_up',          native_id: 'f2', severity: 'due_today', occurred_at: '2026-05-11T11:00:00Z' }),
    ];
    const items = composeActivityInbox({ dbItems: db, now });
    expect(items.map((i) => i.severity)).toEqual([
      'critical', 'overdue', 'due_today', 'due_today', 'info',
    ]);
    // Within due_today, the newer occurred_at comes first.
    const dueToday = items.filter((i) => i.severity === 'due_today');
    expect(dueToday[0].native_id).toBe('f2');
    expect(dueToday[1].native_id).toBe('f1');
  });

  it('deduplicates by composite id (last write wins)', () => {
    const a = dbItem({ source: 'task', native_id: 't1', severity: 'overdue', occurred_at: '2026-05-10T10:00:00Z', title: 'old' });
    const b = dbItem({ source: 'task', native_id: 't1', severity: 'overdue', occurred_at: '2026-05-10T10:00:00Z', title: 'new' });
    const items = composeActivityInbox({ dbItems: [a, b], now });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('new');
  });

  it('handles null/empty Gmail and Calendar streams gracefully', () => {
    const items = composeActivityInbox({
      dbItems: [dbItem({ source: 'task', native_id: 't1', severity: 'info', occurred_at: '2026-05-11T08:00:00Z' })],
      gmailMessages: null,
      calendarEvents: null,
      now,
    });
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('task');
  });

  it('falls back to info severity when severity is missing/unknown', () => {
    const weird = {
      ...dbItem({ source: 'task', native_id: 't1', severity: 'info', occurred_at: '2026-05-11T08:00:00Z' }),
      // Cast through unknown so the test exercises the runtime fallback.
      severity: 'mystery' as unknown as ActivityItem['severity'],
    };
    const sane = dbItem({ source: 'task', native_id: 't2', severity: 'critical', occurred_at: '2026-05-11T08:00:00Z' });
    const items = composeActivityInbox({ dbItems: [weird, sane], now });
    // Unknown sorts to the end (rank 5).
    expect(items[items.length - 1].native_id).toBe('t1');
    expect(items[0].native_id).toBe('t2');
  });
});
