import { describe, expect, it } from 'vitest';

import {
  composeGmailInboxSections,
  dedupedTodayForDashboard,
  type GmailTodayMessage,
} from './gmail-today';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function msg(overrides: Partial<GmailTodayMessage> = {}): GmailTodayMessage {
  return {
    id: 'm1',
    thread_id: 't1',
    subject: 'Subject',
    from_address: 'a@b.c',
    from_name: 'A',
    snippet: 'snip',
    internal_date: '2026-05-12T10:00:00Z',
    internal_date_unix: 1747044000,
    html_link: 'https://mail.google.com/mail/u/0/#inbox/m1',
    is_unread: true,
    is_important: false,
    is_inbox: true,
    is_sent: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// dedupedTodayForDashboard
// ---------------------------------------------------------------------

describe('dedupedTodayForDashboard', () => {
  it('returns today unchanged when important is empty', () => {
    const today = [msg({ id: 'm1', thread_id: 't1' }), msg({ id: 'm2', thread_id: 't2' })];
    expect(dedupedTodayForDashboard([], today)).toEqual(today);
  });

  it('returns empty when today is empty', () => {
    const important = [msg({ id: 'm1', thread_id: 't1', is_important: true })];
    expect(dedupedTodayForDashboard(important, [])).toEqual([]);
  });

  it('drops today rows whose thread_id is in important', () => {
    const important = [msg({ id: 'mi1', thread_id: 't1', is_important: true })];
    const today = [
      msg({ id: 'mt1', thread_id: 't1' }), // same thread as important — drop
      msg({ id: 'mt2', thread_id: 't2' }), // distinct thread — keep
    ];
    const result = dedupedTodayForDashboard(important, today);
    expect(result.map((m) => m.id)).toEqual(['mt2']);
  });

  it('preserves the original order of surviving today rows', () => {
    const important = [
      msg({ id: 'mi1', thread_id: 't1' }),
      msg({ id: 'mi2', thread_id: 't3' }),
    ];
    const today = [
      msg({ id: 'mt1', thread_id: 't4' }),
      msg({ id: 'mt2', thread_id: 't1' }), // drop
      msg({ id: 'mt3', thread_id: 't2' }),
      msg({ id: 'mt4', thread_id: 't3' }), // drop
      msg({ id: 'mt5', thread_id: 't5' }),
    ];
    const result = dedupedTodayForDashboard(important, today);
    expect(result.map((m) => m.id)).toEqual(['mt1', 'mt3', 'mt5']);
  });

  it('dedupes by thread_id, not by id (cross-thread different ids survive)', () => {
    // Important has thread t1 via message id mi1. Today has thread t2 via
    // a message that happens to share id mi1 — different threads, so keep.
    const important = [msg({ id: 'mi1', thread_id: 't1', is_important: true })];
    const today = [msg({ id: 'mi1', thread_id: 't2' })];
    expect(dedupedTodayForDashboard(important, today).map((m) => m.id)).toEqual([
      'mi1',
    ]);
  });
});

// ---------------------------------------------------------------------
// composeGmailInboxSections
// ---------------------------------------------------------------------

describe('composeGmailInboxSections', () => {
  it('returns both arrays untouched and a zero overlap when disjoint', () => {
    const important = [msg({ id: 'i1', thread_id: 't1' })];
    const today = [msg({ id: 'h1', thread_id: 't2' })];
    const result = composeGmailInboxSections(important, today);
    expect(result.important).toBe(important);
    expect(result.today).toBe(today);
    expect(result.overlap_count).toBe(0);
  });

  it('counts overlap by thread_id without filtering either array', () => {
    const important = [
      msg({ id: 'i1', thread_id: 't1' }),
      msg({ id: 'i2', thread_id: 't2' }),
    ];
    const today = [
      msg({ id: 'h1', thread_id: 't1' }), // overlap
      msg({ id: 'h2', thread_id: 't3' }),
      msg({ id: 'h3', thread_id: 't2' }), // overlap
    ];
    const result = composeGmailInboxSections(important, today);
    expect(result.important).toHaveLength(2);
    expect(result.today).toHaveLength(3); // not filtered
    expect(result.overlap_count).toBe(2);
  });

  it('handles empty inputs', () => {
    const result = composeGmailInboxSections([], []);
    expect(result.important).toEqual([]);
    expect(result.today).toEqual([]);
    expect(result.overlap_count).toBe(0);
  });
});

// ---------------------------------------------------------------------
// is_inbox / is_sent pass-through
// ---------------------------------------------------------------------
// The compose helpers don't read either flag, but should not strip
// them either. These guard against an accidental projection regression.

describe('is_inbox / is_sent pass-through', () => {
  it('dedupedTodayForDashboard preserves both flags on surviving rows', () => {
    const today = [
      msg({ id: 'inbound', thread_id: 't1', is_inbox: true, is_sent: false }),
      msg({ id: 'self',    thread_id: 't2', is_inbox: true, is_sent: true }),
      msg({ id: 'sent',    thread_id: 't3', is_inbox: false, is_sent: true }),
    ];
    const result = dedupedTodayForDashboard([], today);
    expect(result).toEqual(today);
    expect(result.map((m) => [m.id, m.is_inbox, m.is_sent])).toEqual([
      ['inbound', true, false],
      ['self',    true, true],
      ['sent',    false, true],
    ]);
  });

  it('composeGmailInboxSections preserves both flags on each array', () => {
    const important = [
      msg({ id: 'i', thread_id: 't1', is_inbox: true, is_sent: false }),
    ];
    const today = [
      msg({ id: 's', thread_id: 't2', is_inbox: false, is_sent: true }),
    ];
    const result = composeGmailInboxSections(important, today);
    expect(result.important[0].is_inbox).toBe(true);
    expect(result.important[0].is_sent).toBe(false);
    expect(result.today[0].is_inbox).toBe(false);
    expect(result.today[0].is_sent).toBe(true);
  });
});
