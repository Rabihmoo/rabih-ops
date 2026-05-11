import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  taskCriticalNoDoc,
  taskSimilarOther,
  taskWaitingOnSomeone,
} from './task';
import { ctxOf, fakeItem } from './test-helpers';

// =====================================================================
// task-waiting-on-someone
// =====================================================================

describe('task-waiting-on-someone', () => {
  it('fires when status is waiting_for_someone and quotes the waiting_on label', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Send contract to landlord',
      branch: 'salt',
      severity: 'due_today',
      is_blocked: true,
      meta: { status: 'waiting_for_someone', waiting_on_label: 'Legal team' },
    });
    const out = taskWaitingOnSomeone(t, ctxOf([t]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_follow_up');
    expect(out[0].reason).toContain('Legal team');
    expect(out[0].prefill?.person).toBe('Legal team');
    expect(out[0].prefill?.branch).toBe('salt');
    expect(out[0].score).toBe(0.7);
  });

  it('falls back to a generic label when waiting_on_label is missing', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Send contract',
      meta: { status: 'waiting_for_someone' },
    });
    const out = taskWaitingOnSomeone(t, ctxOf([t]));
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Create follow-up to chase');
    expect(out[0].prefill?.person).toBeUndefined();
  });

  it('does NOT fire for any other status', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Just working',
      meta: { status: 'started' },
    });
    expect(taskWaitingOnSomeone(t, ctxOf([t]))).toEqual([]);
  });

  it('ignores non-task items', () => {
    const f = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'wrong source',
      meta: { status: 'waiting_for_someone' },
    });
    expect(taskWaitingOnSomeone(f, ctxOf([f]))).toEqual([]);
  });
});

// =====================================================================
// task-critical-no-doc
// =====================================================================

describe('task-critical-no-doc', () => {
  it('fires on critical / overdue / due_today severity', () => {
    for (const sev of ['critical', 'overdue', 'due_today'] as const) {
      const t = fakeItem({
        source: 'task',
        native_id: `t-${sev}`,
        title: 'Important task',
        severity: sev,
        meta: { status: 'started' },
      });
      const out = taskCriticalNoDoc(t, ctxOf([t]));
      expect(out, sev).toHaveLength(1);
      expect(out[0].action).toBe('link_document');
      expect(out[0].score).toBe(0.5);
    }
  });

  it('does NOT fire for soon/info severities', () => {
    for (const sev of ['soon', 'info'] as const) {
      const t = fakeItem({
        source: 'task',
        native_id: `t-${sev}`,
        title: 'Boring task',
        severity: sev,
      });
      expect(taskCriticalNoDoc(t, ctxOf([t]))).toEqual([]);
    }
  });

  it('ignores non-task items', () => {
    const d = fakeItem({
      source: 'document',
      native_id: 'd1',
      title: 'doc',
      severity: 'critical',
    });
    expect(taskCriticalNoDoc(d, ctxOf([d]))).toEqual([]);
  });
});

// =====================================================================
// task-similar-other
// =====================================================================

describe('task-similar-other', () => {
  it('fires when another open task has similarity >= 0.6', () => {
    const a = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Renew gas cylinder contract for SALT branch',
    });
    const b = fakeItem({
      source: 'task',
      native_id: 't2',
      title: 'Renew gas cylinder contract for BBQ House',
    });
    const out = taskSimilarOther(a, ctxOf([a, b]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('link_to_existing');
    expect(out[0].target?.native_id).toBe('t2');
    expect(out[0].reason).toContain('possible duplicate');
  });

  it('does NOT fire below 0.6', () => {
    const a = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Renew gas cylinder contract',
    });
    const b = fakeItem({
      source: 'task',
      native_id: 't2',
      title: 'Pay electricity bill this month',
    });
    expect(taskSimilarOther(a, ctxOf([a, b]))).toEqual([]);
  });

  it('skips comparing a task to itself', () => {
    const a = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Renew gas cylinder contract',
    });
    expect(taskSimilarOther(a, ctxOf([a]))).toEqual([]);
  });
});
