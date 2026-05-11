import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  calendarLocationKnownBranch,
  calendarSimilarToTask,
  calendarTodayNearStart,
} from './calendar';
import { buildSuggestionContext } from '../types';
import type { ActivityItem } from '../../activity-inbox';

const NOW = new Date('2026-05-11T09:00:00Z'); // Monday

function fakeItem(
  partial: Partial<ActivityItem> &
    Pick<ActivityItem, 'source' | 'native_id'>,
): ActivityItem {
  return {
    id: `${partial.source}:${partial.native_id}`,
    title: partial.title ?? 'untitled',
    summary: partial.summary ?? null,
    branch: partial.branch ?? null,
    entity_url: partial.entity_url ?? '/',
    occurred_at: partial.occurred_at ?? '2026-05-11T08:00:00Z',
    due_at: partial.due_at ?? null,
    severity: partial.severity ?? 'info',
    is_unread: partial.is_unread ?? false,
    is_blocked: partial.is_blocked ?? false,
    meta: partial.meta ?? {},
    ...partial,
  };
}
function ctxOf(items: ActivityItem[]) {
  return buildSuggestionContext(items, NOW);
}

// =====================================================================
// calendar-similar-to-task
// =====================================================================

describe('calendar-similar-to-task', () => {
  it('fires when event title is similar to an open task title', () => {
    const task = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Cold-room temperature inspection walkthrough',
    });
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c1',
      title: 'Cold-room temperature inspection meeting',
    });
    const out = calendarSimilarToTask(event, ctxOf([event, task]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('link_to_existing');
    expect(out[0].target?.source).toBe('task');
    expect(out[0].target?.native_id).toBe('t1');
    expect(out[0].reason).toContain('similar wording');
    expect(out[0].reason).toContain('Cold-room temperature inspection walkthrough');
    expect(out[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('does NOT fire below similarity threshold', () => {
    const task = fakeItem({ source: 'task', native_id: 't1', title: 'Pay electricity bill' });
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c1',
      title: 'Lunch with supplier rep',
    });
    expect(calendarSimilarToTask(event, ctxOf([event, task]))).toEqual([]);
  });

  it('emits one suggestion per matching task', () => {
    const t1 = fakeItem({ source: 'task', native_id: 't1', title: 'Freezer maintenance schedule review' });
    const t2 = fakeItem({ source: 'task', native_id: 't2', title: 'Freezer maintenance service appointment' });
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c1',
      title: 'Freezer maintenance walkthrough',
    });
    const out = calendarSimilarToTask(event, ctxOf([event, t1, t2]));
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.target?.native_id).sort()).toEqual(['t1', 't2']);
  });

  it('ignores non-calendar items', () => {
    const t = fakeItem({ source: 'task', native_id: 't1', title: 'Cold-room inspection' });
    expect(calendarSimilarToTask(t, ctxOf([t]))).toEqual([]);
  });
});

// =====================================================================
// calendar-today-near-start
// =====================================================================

describe('calendar-today-near-start', () => {
  it('fires when event starts within the next 60 minutes', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c1',
      title: 'Inspection walkthrough',
      due_at: new Date(NOW.getTime() + 20 * 60_000).toISOString(),
    });
    const out = calendarTodayNearStart(event, ctxOf([event]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_follow_up');
    expect(out[0].prefill?.title).toBe('Follow up after Inspection walkthrough');
    expect(out[0].prefill?.due_date).toBe('2026-05-11');
    expect(out[0].reason.toLowerCase()).toContain('event starts');
  });

  it('fires when event just started within the past 30 minutes', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c2',
      title: 'Team huddle',
      due_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    });
    expect(calendarTodayNearStart(event, ctxOf([event]))).toHaveLength(1);
  });

  it('does NOT fire when event is more than 60 minutes away', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c3',
      title: 'End-of-day review',
      due_at: new Date(NOW.getTime() + 4 * 60 * 60_000).toISOString(),
    });
    expect(calendarTodayNearStart(event, ctxOf([event]))).toEqual([]);
  });

  it('does NOT fire when event started more than 30 minutes ago', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c4',
      title: 'Earlier standup',
      due_at: new Date(NOW.getTime() - 90 * 60_000).toISOString(),
    });
    expect(calendarTodayNearStart(event, ctxOf([event]))).toEqual([]);
  });

  it('does NOT fire when event has no start time', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c5',
      title: 'No date set',
      due_at: null,
    });
    expect(calendarTodayNearStart(event, ctxOf([event]))).toEqual([]);
  });

  it('ignores non-calendar items even when they have a due_at within 60min', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Task with imminent due',
      due_at: new Date(NOW.getTime() + 20 * 60_000).toISOString(),
    });
    expect(calendarTodayNearStart(t, ctxOf([t]))).toEqual([]);
  });
});

// =====================================================================
// calendar-location-known-branch
// =====================================================================

describe('calendar-location-known-branch', () => {
  it('fires when location case-insensitively contains a branch name', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c1',
      title: 'Inspection',
      meta: { location: 'BBQ House — main counter' },
    });
    const out = calendarLocationKnownBranch(event, ctxOf([event]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_task');
    expect(out[0].prefill?.branch).toBe('bbqhouse');
    expect(out[0].reason).toContain('BBQ House');
  });

  it('fires on branch code substrings too', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c2',
      title: 'Walkthrough',
      meta: { location: 'centralkitchen back of house' },
    });
    const out = calendarLocationKnownBranch(event, ctxOf([event]));
    expect(out).toHaveLength(1);
    expect(out[0].prefill?.branch).toBe('centralkitchen');
  });

  it('emits one suggestion per matched branch', () => {
    // Contrived: location names two branches.
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c3',
      title: 'Joint review',
      meta: { location: 'SALT then BBQ House' },
    });
    const out = calendarLocationKnownBranch(event, ctxOf([event]));
    expect(out.map((s) => s.prefill?.branch).sort()).toEqual(['bbqhouse', 'salt']);
  });

  it('does NOT fire when location is empty or missing', () => {
    const e1 = fakeItem({ source: 'calendar', native_id: 'c4', title: 'no loc', meta: {} });
    const e2 = fakeItem({
      source: 'calendar',
      native_id: 'c5',
      title: 'blank loc',
      meta: { location: '   ' },
    });
    expect(calendarLocationKnownBranch(e1, ctxOf([e1]))).toEqual([]);
    expect(calendarLocationKnownBranch(e2, ctxOf([e2]))).toEqual([]);
  });

  it('does NOT fire when location names no known branch', () => {
    const event = fakeItem({
      source: 'calendar',
      native_id: 'c6',
      title: 'Off-site',
      meta: { location: 'Sheraton lobby' },
    });
    expect(calendarLocationKnownBranch(event, ctxOf([event]))).toEqual([]);
  });

  it('ignores non-calendar items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'task',
      meta: { location: 'SALT' },
    });
    expect(calendarLocationKnownBranch(t, ctxOf([t]))).toEqual([]);
  });
});
