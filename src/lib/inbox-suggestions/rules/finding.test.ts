import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { findingCriticalNoTask, findingFollowUpOverdue } from './finding';
import { ctxOf, FIXTURE_NOW, fakeItem } from './test-helpers';

// =====================================================================
// finding-critical-no-task
// =====================================================================

describe('finding-critical-no-task', () => {
  it('fires when a critical finding has no resembling open task', () => {
    const f = fakeItem({
      source: 'inspection_finding',
      native_id: 'i1',
      title: 'Cold-room temperature out of safe range',
      branch: 'salt',
      severity: 'critical',
      meta: { status: 'open', finding_severity: 'critical' },
    });
    const out = findingCriticalNoTask(f, ctxOf([f]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_task');
    expect(out[0].prefill?.priority).toBe('urgent');
    expect(out[0].prefill?.title).toBe('Cold-room temperature out of safe range');
    expect(out[0].score).toBe(0.9);
  });

  it('does NOT fire when an open task already references the finding', () => {
    const finding = fakeItem({
      source: 'inspection_finding',
      native_id: 'i1',
      title: 'Cold-room temperature out of range',
      severity: 'critical',
      meta: { status: 'open' },
    });
    const task = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Fix cold-room temperature range',
    });
    expect(findingCriticalNoTask(finding, ctxOf([finding, task]))).toEqual([]);
  });

  it('does NOT fire when severity is not critical', () => {
    const f = fakeItem({
      source: 'inspection_finding',
      native_id: 'i2',
      title: 'Minor finding',
      severity: 'due_today',
      meta: { status: 'open' },
    });
    expect(findingCriticalNoTask(f, ctxOf([f]))).toEqual([]);
  });

  it('ignores non-finding items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Cold-room temperature issue',
      severity: 'critical',
    });
    expect(findingCriticalNoTask(t, ctxOf([t]))).toEqual([]);
  });
});

// =====================================================================
// finding-follow-up-overdue
// =====================================================================

describe('finding-follow-up-overdue', () => {
  function findingDueAt(daysOffset: number, status: string) {
    const due = new Date(FIXTURE_NOW.getTime() + daysOffset * 86400000);
    return fakeItem({
      source: 'inspection_finding',
      native_id: 'i1',
      title: 'Action needed on something',
      severity: 'due_today',
      due_at: due.toISOString(),
      meta: { status },
    });
  }

  it('fires when follow_up_date is in the past and status is open', () => {
    const f = findingDueAt(-3, 'open');
    const out = findingFollowUpOverdue(f, ctxOf([f]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_follow_up');
    expect(out[0].score).toBe(0.6);
  });

  it('also fires for in_progress and escalated statuses', () => {
    for (const s of ['in_progress', 'escalated']) {
      const f = findingDueAt(-1, s);
      expect(findingFollowUpOverdue(f, ctxOf([f]))).toHaveLength(1);
    }
  });

  it('does NOT fire when due_at is in the future', () => {
    const f = findingDueAt(2, 'open');
    expect(findingFollowUpOverdue(f, ctxOf([f]))).toEqual([]);
  });

  it('does NOT fire when status is resolved', () => {
    const f = findingDueAt(-3, 'resolved');
    expect(findingFollowUpOverdue(f, ctxOf([f]))).toEqual([]);
  });

  it('does NOT fire when due_at is missing', () => {
    const f = fakeItem({
      source: 'inspection_finding',
      native_id: 'i1',
      title: 'No date',
      due_at: null,
      meta: { status: 'open' },
    });
    expect(findingFollowUpOverdue(f, ctxOf([f]))).toEqual([]);
  });

  it('ignores non-finding items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'wrong',
      due_at: new Date(FIXTURE_NOW.getTime() - 86400000).toISOString(),
      meta: { status: 'open' },
    });
    expect(findingFollowUpOverdue(t, ctxOf([t]))).toEqual([]);
  });
});
