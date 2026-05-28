import { describe, expect, it } from 'vitest';
import { recurringMissing } from './recurring-missing';
import { ctxOf, fakeItem } from './test-helpers';

describe('recurring-template-missing-instance rule', () => {
  it('fires for a needs_repeat task older than 2 days', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't-1',
      occurred_at: '2026-05-05T08:00:00Z', // 6 days before FIXTURE_NOW
      meta: { status: 'needs_repeat' },
    });
    const suggestions = recurringMissing(item, ctxOf([item]));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].rule).toBe('recurring-template-missing-instance');
    expect(suggestions[0].label).toContain('6 days');
  });

  it('does not fire for needs_repeat task < 2 days old', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't-2',
      occurred_at: '2026-05-10T08:00:00Z', // 1 day before FIXTURE_NOW
      meta: { status: 'needs_repeat' },
    });
    expect(recurringMissing(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for non-needs_repeat tasks', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't-3',
      occurred_at: '2026-04-01T08:00:00Z',
      meta: { status: 'todo' },
    });
    expect(recurringMissing(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for non-task items', () => {
    const item = fakeItem({
      source: 'follow_up',
      native_id: 'fu-1',
      meta: { status: 'needs_repeat' },
    });
    expect(recurringMissing(item, ctxOf([item]))).toEqual([]);
  });
});
