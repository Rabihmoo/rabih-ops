import { describe, expect, it } from 'vitest';
import { draftDocAging } from './draft-doc-aging';
import { ctxOf, fakeItem } from './test-helpers';

describe('draft-doc-aging rule', () => {
  it('fires for a draft document older than 14 days', () => {
    const item = fakeItem({
      source: 'document',
      native_id: 'd-1',
      title: 'Health cert 2026',
      occurred_at: '2026-04-20T08:00:00Z', // 21 days before FIXTURE_NOW
      meta: { status: 'draft' },
    });
    const suggestions = draftDocAging(item, ctxOf([item]));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].rule).toBe('draft-doc-aging');
    expect(suggestions[0].label).toContain('21 days');
  });

  it('does not fire for drafts less than 14 days old', () => {
    const item = fakeItem({
      source: 'document',
      native_id: 'd-2',
      occurred_at: '2026-05-05T08:00:00Z', // 6 days before FIXTURE_NOW
      meta: { status: 'draft' },
    });
    expect(draftDocAging(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for active documents', () => {
    const item = fakeItem({
      source: 'document',
      native_id: 'd-3',
      occurred_at: '2026-04-01T08:00:00Z',
      meta: { status: 'active' },
    });
    expect(draftDocAging(item, ctxOf([item]))).toEqual([]);
  });

  it('does not fire for non-document items', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't-1',
      meta: { status: 'draft' },
    });
    expect(draftDocAging(item, ctxOf([item]))).toEqual([]);
  });
});
