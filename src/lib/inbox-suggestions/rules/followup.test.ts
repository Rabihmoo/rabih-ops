import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { followUpOverdueNoTask, followUpSimilarOther } from './followup';
import { ctxOf, fakeItem } from './test-helpers';

// =====================================================================
// followup-overdue-no-task
// =====================================================================

describe('followup-overdue-no-task', () => {
  it('fires when severity is overdue', () => {
    const f = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Call landlord re: rent',
      severity: 'overdue',
      branch: 'salt',
    });
    const out = followUpOverdueNoTask(f, ctxOf([f]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_task');
    expect(out[0].prefill?.title).toBe('Call landlord re: rent');
    expect(out[0].prefill?.branch).toBe('salt');
    expect(out[0].score).toBe(0.7);
  });

  it('does NOT fire when severity is not overdue', () => {
    for (const sev of ['critical', 'due_today', 'soon', 'info'] as const) {
      const f = fakeItem({
        source: 'follow_up',
        native_id: `f-${sev}`,
        title: 'something',
        severity: sev,
      });
      expect(followUpOverdueNoTask(f, ctxOf([f]))).toEqual([]);
    }
  });

  it('ignores non-followup items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'wrong source',
      severity: 'overdue',
    });
    expect(followUpOverdueNoTask(t, ctxOf([t]))).toEqual([]);
  });
});

// =====================================================================
// followup-similar-other
// =====================================================================

describe('followup-similar-other', () => {
  it('fires when another open follow-up has similarity >= 0.6', () => {
    const a = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Chase ACME supplier about pending order',
    });
    const b = fakeItem({
      source: 'follow_up',
      native_id: 'f2',
      title: 'Chase ACME supplier about delayed delivery order',
    });
    const out = followUpSimilarOther(a, ctxOf([a, b]));
    expect(out).toHaveLength(1);
    expect(out[0].target?.native_id).toBe('f2');
    expect(out[0].reason).toContain('possible duplicate');
  });

  it('does NOT fire below threshold', () => {
    const a = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Talk to landlord about rent',
    });
    const b = fakeItem({
      source: 'follow_up',
      native_id: 'f2',
      title: 'Reorder cleaning supplies',
    });
    expect(followUpSimilarOther(a, ctxOf([a, b]))).toEqual([]);
  });

  it('skips comparing a follow-up to itself', () => {
    const a = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Call landlord re: rent payment',
    });
    expect(followUpSimilarOther(a, ctxOf([a]))).toEqual([]);
  });
});
