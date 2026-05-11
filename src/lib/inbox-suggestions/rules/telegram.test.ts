import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { telegramOpenRelated } from './telegram';
import { buildSuggestionContext } from '../types';
import type { ActivityItem } from '../../activity-inbox';

const NOW = new Date('2026-05-11T09:00:00Z');

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

describe('telegram-open-related', () => {
  it('emits open_related when meta references a task in context — using the fresh task title', () => {
    const task = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Renew gas cylinder contract',
    });
    const reminder = fakeItem({
      source: 'telegram',
      native_id: '42',
      title: 'Renew gas cylinder contract', // matches task title (RPC's coalesce)
      meta: { entity_type: 'task', entity_id: 't1', kind: 'deadline_reminder', channel: 'in_app' },
    });
    const out = telegramOpenRelated(reminder, ctxOf([reminder, task]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('open_related');
    expect(out[0].target?.source).toBe('task');
    expect(out[0].target?.native_id).toBe('t1');
    expect(out[0].target?.title).toBe('Renew gas cylinder contract');
    expect(out[0].reason.toLowerCase()).toContain('task');
    expect(out[0].score).toBe(0.95);
  });

  it('emits when linked to a follow_up', () => {
    const fu = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Call landlord',
    });
    const reminder = fakeItem({
      source: 'telegram',
      native_id: '7',
      title: 'Call landlord',
      meta: { entity_type: 'follow_up', entity_id: 'f1', kind: 'followup_due', channel: 'in_app' },
    });
    const out = telegramOpenRelated(reminder, ctxOf([reminder, fu]));
    expect(out).toHaveLength(1);
    expect(out[0].target?.source).toBe('follow_up');
    expect(out[0].label).toContain('follow-up');
  });

  it('falls back to the reminder title when the linked entity is not in context', () => {
    const reminder = fakeItem({
      source: 'telegram',
      native_id: '99',
      title: 'Pay supplier invoice',
      meta: { entity_type: 'task', entity_id: 'gone-uuid', kind: 'deadline_reminder', channel: 'in_app' },
    });
    const out = telegramOpenRelated(reminder, ctxOf([reminder]));
    expect(out).toHaveLength(1);
    expect(out[0].target?.title).toBe('Pay supplier invoice');
  });

  it('does NOT fire when meta lacks entity_type or entity_id', () => {
    const noType = fakeItem({
      source: 'telegram',
      native_id: '1',
      title: 'orphan reminder',
      meta: { entity_id: 'x' },
    });
    const noId = fakeItem({
      source: 'telegram',
      native_id: '2',
      title: 'orphan reminder',
      meta: { entity_type: 'task' },
    });
    expect(telegramOpenRelated(noType, ctxOf([noType]))).toEqual([]);
    expect(telegramOpenRelated(noId, ctxOf([noId]))).toEqual([]);
  });

  it('does NOT fire when meta.entity_type is something other than task/follow_up', () => {
    const reminder = fakeItem({
      source: 'telegram',
      native_id: '3',
      title: 'odd reminder',
      meta: { entity_type: 'inspection', entity_id: 'i1' },
    });
    expect(telegramOpenRelated(reminder, ctxOf([reminder]))).toEqual([]);
  });

  it('ignores non-telegram items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'wrong source',
      meta: { entity_type: 'task', entity_id: 't1' },
    });
    expect(telegramOpenRelated(t, ctxOf([t]))).toEqual([]);
  });
});
