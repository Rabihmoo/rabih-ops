import { describe, expect, it } from 'vitest';
import { staleFollowUp } from './stale-followup';
import { ctxOf, fakeItem } from './test-helpers';

describe('stale-follow-up rule', () => {
  it('fires for an open follow-up older than 7 days', () => {
    const item = fakeItem({
      source: 'follow_up',
      native_id: 'fu-1',
      occurred_at: '2026-05-01T08:00:00Z',
      meta: { status: 'pending' },
    });
    const suggestions = staleFollowUp(item, ctxOf([item]));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].rule).toBe('stale-follow-up');
  });

  it('does not fire for < 7 days', () => {
    const item = fakeItem({
      source: 'follow_up',
      native_id: 'fu-2',
      occurred_at: '2026-05-08T08:00:00Z',
      meta: { status: 'pending' },
    });
    expect(staleFollowUp(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for done', () => {
    const item = fakeItem({
      source: 'follow_up',
      native_id: 'fu-3',
      occurred_at: '2026-04-01T08:00:00Z',
      meta: { status: 'done' },
    });
    expect(staleFollowUp(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for non-follow-up', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't-1',
      occurred_at: '2026-04-01T08:00:00Z',
    });
    expect(staleFollowUp(item, ctxOf([item]))).toEqual([]);
  });
});
