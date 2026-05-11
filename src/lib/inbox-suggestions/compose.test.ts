import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  composeAllSuggestions,
  composeSuggestionsForItem,
} from './compose';
import {
  buildSuggestionContext,
  type Suggestion,
  type SuggestionRule,
} from './types';
import type { ActivityItem } from '../activity-inbox';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

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

function suggestion(
  partial: Partial<Suggestion> & Pick<Suggestion, 'id' | 'rule' | 'action' | 'label' | 'reason' | 'score'>,
): Suggestion {
  return partial;
}

const NOW = new Date('2026-05-11T09:00:00Z');

// ---------------------------------------------------------------------
// composeSuggestionsForItem
// ---------------------------------------------------------------------

describe('composeSuggestionsForItem', () => {
  const item = fakeItem({ source: 'task', native_id: 't1' });

  it('returns [] when no rules emit anything', () => {
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [] });
    expect(out).toEqual([]);
  });

  it('drops suggestions below the score floor (default 0.4)', () => {
    const rule: SuggestionRule = () => [
      suggestion({ id: 'task:t1:low',  rule: 'low',  action: 'create_task', label: 'l', reason: 'r', score: 0.3 }),
      suggestion({ id: 'task:t1:high', rule: 'high', action: 'create_task', label: 'l', reason: 'r', score: 0.9 }),
    ];
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [rule] });
    expect(out.map((s) => s.id)).toEqual(['task:t1:high']);
  });

  it('sorts by score desc; alphabetical rule id breaks ties', () => {
    const rule: SuggestionRule = () => [
      suggestion({ id: 'a', rule: 'beta',  action: 'create_task', label: 'l', reason: 'r', score: 0.7 }),
      suggestion({ id: 'b', rule: 'alpha', action: 'create_task', label: 'l', reason: 'r', score: 0.7 }),
      suggestion({ id: 'c', rule: 'gamma', action: 'create_task', label: 'l', reason: 'r', score: 0.9 }),
    ];
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [rule], maxPerAction: 5 });
    expect(out.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('honors maxPerItem (default 3)', () => {
    const rule: SuggestionRule = () =>
      Array.from({ length: 6 }, (_, i) =>
        suggestion({
          id: `id-${i}`,
          rule: `rule-${i}`,
          action: 'create_task',
          label: 'l',
          reason: 'r',
          score: 0.9 - i * 0.01,
        }),
      );
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [rule], maxPerAction: 10 });
    expect(out).toHaveLength(3);
  });

  it('honors maxPerAction (default 2)', () => {
    const rule: SuggestionRule = () => [
      suggestion({ id: 'ct1', rule: 'a', action: 'create_task',      label: 'l', reason: 'r', score: 0.9 }),
      suggestion({ id: 'ct2', rule: 'b', action: 'create_task',      label: 'l', reason: 'r', score: 0.8 }),
      suggestion({ id: 'ct3', rule: 'c', action: 'create_task',      label: 'l', reason: 'r', score: 0.7 }),
      suggestion({ id: 'cf1', rule: 'd', action: 'create_follow_up', label: 'l', reason: 'r', score: 0.6 }),
    ];
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [rule] });
    expect(out.map((s) => s.id)).toEqual(['ct1', 'ct2', 'cf1']);
  });

  it('filters dismissed ids before capping', () => {
    const rule: SuggestionRule = () => [
      suggestion({ id: 'keep',    rule: 'a', action: 'create_task', label: 'l', reason: 'r', score: 0.9 }),
      suggestion({ id: 'dismiss', rule: 'b', action: 'create_task', label: 'l', reason: 'r', score: 0.8 }),
    ];
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, {
      rules: [rule],
      isDismissed: (id) => id === 'dismiss',
    });
    expect(out.map((s) => s.id)).toEqual(['keep']);
  });

  it('de-duplicates by suggestion id when multiple rules emit the same one', () => {
    const ruleA: SuggestionRule = () => [
      suggestion({ id: 'same', rule: 'a', action: 'create_task', label: 'l', reason: 'r', score: 0.9 }),
    ];
    const ruleB: SuggestionRule = () => [
      suggestion({ id: 'same', rule: 'b', action: 'create_task', label: 'l', reason: 'r', score: 0.8 }),
    ];
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [ruleA, ruleB] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('same');
  });

  it('catches exceptions from misbehaving rules and continues', () => {
    const bad: SuggestionRule = () => {
      throw new Error('boom');
    };
    const good: SuggestionRule = () => [
      suggestion({ id: 'g', rule: 'good', action: 'create_task', label: 'l', reason: 'r', score: 0.9 }),
    ];
    const ctx = buildSuggestionContext([item], NOW);
    const out = composeSuggestionsForItem(item, ctx, { rules: [bad, good] });
    expect(out.map((s) => s.id)).toEqual(['g']);
  });
});

// ---------------------------------------------------------------------
// composeAllSuggestions
// ---------------------------------------------------------------------

describe('composeAllSuggestions', () => {
  it('produces an entry per item, in the same iteration order', () => {
    const items = [
      fakeItem({ source: 'task',      native_id: 't1' }),
      fakeItem({ source: 'follow_up', native_id: 'f1' }),
    ];
    const rule: SuggestionRule = (it) => [
      suggestion({
        id: `${it.id}:hello`,
        rule: 'hello',
        action: 'create_task',
        label: 'l',
        reason: 'r',
        score: 0.9,
      }),
    ];
    const out = composeAllSuggestions(items, { rules: [rule] });
    expect(Array.from(out.keys())).toEqual(['task:t1', 'follow_up:f1']);
    expect(out.get('task:t1')![0].id).toBe('task:t1:hello');
  });

  it('exposes a stable context (bySource bucketing) to rules', () => {
    const items = [
      fakeItem({ source: 'task',  native_id: 't1' }),
      fakeItem({ source: 'task',  native_id: 't2' }),
      fakeItem({ source: 'gmail', native_id: 'g1' }),
    ];
    const seen: number[] = [];
    const rule: SuggestionRule = (_item, ctx) => {
      seen.push(ctx.bySource.task.length, ctx.bySource.gmail.length);
      return [];
    };
    composeAllSuggestions(items, { rules: [rule] });
    // Rule runs once per item; bySource should be (2, 1) every time.
    expect(seen).toEqual([2, 1, 2, 1, 2, 1]);
  });
});
