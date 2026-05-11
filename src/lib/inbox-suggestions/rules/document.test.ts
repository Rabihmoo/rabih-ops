import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { documentUnlinked } from './document';
import { ctxOf, FIXTURE_NOW, fakeItem } from './test-helpers';

function docAged(ageDays: number, status: string, title: string) {
  const ms = FIXTURE_NOW.getTime() - ageDays * 86400000;
  return fakeItem({
    source: 'document',
    native_id: 'd1',
    title,
    occurred_at: new Date(ms).toISOString(),
    severity: 'info',
    meta: { category: 'sop', status, visibility: 'work' },
  });
}

describe('document-unlinked', () => {
  it('fires for an old active doc with a similar-titled open task', () => {
    const doc = docAged(10, 'active', 'Cold-room cleaning checklist for SALT');
    const task = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Cold-room cleaning routine review for SALT',
    });
    const out = documentUnlinked(doc, ctxOf([doc, task]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('link_to_existing');
    expect(out[0].target?.source).toBe('task');
    expect(out[0].target?.native_id).toBe('t1');
    expect(out[0].reason).toContain('unlinked');
    expect(out[0].reason).toContain('similar');
    expect(out[0].score).toBeLessThanOrEqual(0.5);
  });

  it('caps at 2 targets per doc, picking the strongest matches', () => {
    const doc = docAged(10, 'active', 'Cold-room cleaning checklist');
    const t1 = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Cold-room cleaning routine schedule',
    });
    const t2 = fakeItem({
      source: 'task',
      native_id: 't2',
      title: 'Cold-room cleaning checklist for SALT and BBQ House',
    });
    const t3 = fakeItem({
      source: 'task',
      native_id: 't3',
      title: 'Cold-room cleaning supplies order list',
    });
    const out = documentUnlinked(doc, ctxOf([doc, t1, t2, t3]));
    expect(out.length).toBeLessThanOrEqual(2);
    // Higher-similarity candidates should come first.
    expect(out[0].score).toBeGreaterThanOrEqual(out[1]?.score ?? 0);
  });

  it('does NOT fire when no candidate is similar enough', () => {
    const doc = docAged(10, 'active', 'Cold-room cleaning checklist');
    const task = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Pay electricity bill',
    });
    expect(documentUnlinked(doc, ctxOf([doc, task]))).toEqual([]);
  });

  it('does NOT fire for docs younger than 7 days even with a candidate', () => {
    const doc = docAged(3, 'active', 'Cold-room cleaning checklist');
    const task = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Cold-room cleaning checklist routine',
    });
    expect(documentUnlinked(doc, ctxOf([doc, task]))).toEqual([]);
  });

  it('does NOT fire for archived/draft docs', () => {
    for (const status of ['archived', 'draft']) {
      const doc = docAged(20, status, 'Cold-room cleaning checklist');
      const task = fakeItem({
        source: 'task',
        native_id: 't1',
        title: 'Cold-room cleaning checklist routine',
      });
      expect(documentUnlinked(doc, ctxOf([doc, task]))).toEqual([]);
    }
  });

  it('ignores non-document items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'wrong source',
      severity: 'info',
      meta: { status: 'active' },
    });
    expect(documentUnlinked(t, ctxOf([t]))).toEqual([]);
  });
});
