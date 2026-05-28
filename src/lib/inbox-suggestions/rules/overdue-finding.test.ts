import { describe, expect, it } from 'vitest';
import { overdueFinding } from './overdue-finding';
import { ctxOf, fakeItem } from './test-helpers';

describe('overdue-finding rule', () => {
  it('fires for an open finding past its due date', () => {
    const item = fakeItem({
      source: 'inspection_finding',
      native_id: 'f-1',
      title: 'Cracked floor tile in kitchen',
      due_at: '2026-05-05T08:00:00Z', // 6 days before FIXTURE_NOW
      meta: { status: 'open' },
    });
    const suggestions = overdueFinding(item, ctxOf([item]));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].rule).toBe('overdue-finding');
    expect(suggestions[0].label).toContain('6d');
  });

  it('does not fire for resolved findings', () => {
    const item = fakeItem({
      source: 'inspection_finding',
      native_id: 'f-2',
      due_at: '2026-04-01T08:00:00Z',
      meta: { status: 'resolved' },
    });
    expect(overdueFinding(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire when due date is in the future', () => {
    const item = fakeItem({
      source: 'inspection_finding',
      native_id: 'f-3',
      due_at: '2026-05-20T08:00:00Z', // future
      meta: { status: 'open' },
    });
    expect(overdueFinding(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire when due_at is null', () => {
    const item = fakeItem({
      source: 'inspection_finding',
      native_id: 'f-4',
      due_at: null,
      meta: { status: 'open' },
    });
    expect(overdueFinding(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for non-finding items', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't-1',
      due_at: '2026-04-01T08:00:00Z',
      meta: { status: 'open' },
    });
    expect(overdueFinding(item, ctxOf([item]))).toEqual([]);
  });
});
