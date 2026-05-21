import { describe, expect, it } from 'vitest';
import {
  groupNotificationsByDay,
  type FiredNotificationRow,
  type NotificationRow,
  type PendingNotificationRow,
} from './notifications';

// Helpers — minimal valid rows. Tests only care about `effective_at`
// and `state`; other fields are filled with believable placeholders so
// the discriminated union stays well-formed.

function fired(effectiveAt: string, partial: Partial<FiredNotificationRow> = {}): FiredNotificationRow {
  return {
    state: 'fired',
    log_id: 1,
    queue_id: 10,
    kind: 'deadline_reminder',
    entity_type: 'task',
    entity_id: '00000000-0000-0000-0000-000000000001',
    channel: 'in_app',
    status: 'sent',
    error: null,
    effective_at: effectiveAt,
    fired_at: effectiveAt,
    fire_at: null,
    read_at: null,
    payload: null,
    entity: null,
    ...partial,
  };
}

function pending(effectiveAt: string, partial: Partial<PendingNotificationRow> = {}): PendingNotificationRow {
  return {
    state: 'pending',
    log_id: null,
    queue_id: 20,
    kind: 'followup_due',
    entity_type: 'follow_up',
    entity_id: '00000000-0000-0000-0000-000000000002',
    channel: 'in_app',
    status: 'pending',
    error: null,
    effective_at: effectiveAt,
    fired_at: null,
    fire_at: effectiveAt,
    read_at: null,
    payload: null,
    entity: null,
    ...partial,
  };
}

// Reference instant — 2026-05-21 14:00 in Africa/Maputo (UTC+2 no DST)
// = 2026-05-21 12:00 UTC. Boundary math below assumes Maputo offset.
const NOW = new Date('2026-05-21T12:00:00Z');

describe('groupNotificationsByDay', () => {
  it('returns [] for empty input', () => {
    expect(groupNotificationsByDay([], NOW)).toEqual([]);
  });

  it('buckets a fired row from the current Maputo day as Today', () => {
    // 06:00 UTC on the same Maputo date (= 08:00 Maputo)
    const row = fired('2026-05-21T06:00:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.bucket).toBe('today');
    expect(groups[0]?.label).toBe('Today');
    expect(groups[0]?.rows).toEqual([row]);
  });

  it('buckets a future pending row as Upcoming', () => {
    // 24h after NOW
    const row = pending('2026-05-22T12:00:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.bucket).toBe('upcoming');
    expect(groups[0]?.label).toBe('Upcoming');
  });

  it('buckets a row from the previous Maputo day as Yesterday', () => {
    // 18:00 UTC on 2026-05-20 = 20:00 Maputo on 2026-05-20
    const row = fired('2026-05-20T18:00:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups[0]?.bucket).toBe('yesterday');
    expect(groups[0]?.label).toBe('Yesterday');
  });

  it('buckets a row three Maputo days ago as Earlier this week', () => {
    const row = fired('2026-05-18T10:00:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups[0]?.bucket).toBe('earlier_this_week');
    expect(groups[0]?.label).toBe('Earlier this week');
  });

  it('buckets a row from 10 Maputo days ago as Older', () => {
    const row = fired('2026-05-11T10:00:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups[0]?.bucket).toBe('older');
    expect(groups[0]?.label).toBe('Older');
  });

  it('preserves row order inside a bucket', () => {
    const a = fired('2026-05-21T11:00:00Z', { log_id: 100 });
    const b = fired('2026-05-21T05:00:00Z', { log_id: 200 });
    const c = fired('2026-05-21T01:00:00Z', { log_id: 300 });
    const groups = groupNotificationsByDay([a, b, c], NOW);
    expect(groups[0]?.bucket).toBe('today');
    expect(groups[0]?.rows.map((r) => (r as FiredNotificationRow).log_id)).toEqual([100, 200, 300]);
  });

  it('emits buckets in declared order regardless of input order', () => {
    const rows: NotificationRow[] = [
      fired('2026-05-11T10:00:00Z'),          // older
      pending('2026-05-22T12:00:00Z'),        // upcoming
      fired('2026-05-20T18:00:00Z'),          // yesterday
      fired('2026-05-21T06:00:00Z'),          // today
      fired('2026-05-18T10:00:00Z'),          // earlier this week
    ];
    const groups = groupNotificationsByDay(rows, NOW);
    expect(groups.map((g) => g.bucket)).toEqual([
      'upcoming',
      'today',
      'yesterday',
      'earlier_this_week',
      'older',
    ]);
  });

  it('skips empty buckets (only returns groups that have rows)', () => {
    const groups = groupNotificationsByDay(
      [fired('2026-05-21T06:00:00Z'), fired('2026-05-11T10:00:00Z')],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'older']);
  });

  it('PROJECT_TZ shift — late-UTC instant maps to next Maputo day', () => {
    // 23:30 UTC on 2026-05-20 is already 01:30 Maputo on 2026-05-21 (UTC+2).
    // So this row belongs in Today's bucket, not Yesterday's, when NOW
    // is on 2026-05-21 Maputo.
    const row = fired('2026-05-20T23:30:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups[0]?.bucket).toBe('today');
  });

  it('PROJECT_TZ shift — early-UTC instant before Maputo midnight stays Yesterday', () => {
    // 21:00 UTC on 2026-05-20 is 23:00 Maputo on 2026-05-20.
    // Still Yesterday relative to a Maputo 2026-05-21 NOW.
    const row = fired('2026-05-20T21:00:00Z');
    const groups = groupNotificationsByDay([row], NOW);
    expect(groups[0]?.bucket).toBe('yesterday');
  });

  it('respects an alternative DST-observing zone', () => {
    // Probe America/New_York: same NOW (2026-05-21 12:00 UTC = 08:00 EDT).
    // A row at 2026-05-20 23:00 UTC = 19:00 EDT on 2026-05-20 → Yesterday.
    const row = fired('2026-05-20T23:00:00Z');
    const groups = groupNotificationsByDay([row], NOW, 'America/New_York');
    expect(groups[0]?.bucket).toBe('yesterday');
  });
});
