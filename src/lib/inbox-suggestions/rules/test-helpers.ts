// Test-only fixture builder shared by the rule test files. Not exported
// from any production code path. Kept in the rules folder so vitest's
// scan picks it up but no UI code can reach for it.

import type { ActivityItem } from '../../activity-inbox';
import { buildSuggestionContext } from '../types';

export function fakeItem(
  partial: Partial<ActivityItem> & Pick<ActivityItem, 'source' | 'native_id'>,
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

export const FIXTURE_NOW = new Date('2026-05-11T09:00:00Z'); // Monday

export function ctxOf(items: ActivityItem[], now: Date = FIXTURE_NOW) {
  return buildSuggestionContext(items, now);
}
