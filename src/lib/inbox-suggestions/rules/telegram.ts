// Phase G2.3 — Telegram suggestion rules.
//
// One pure SuggestionRule that runs only on items where source === 'telegram'.
// Surfaces an explicit "open related entity" action when the queued reminder
// is tied to a task or follow-up. The row's entity_url already navigates
// there, but emitting an explicit suggestion lets the UI present the
// destination by name (with a reason that explains the linkage).

import type { ActivitySource } from '../../activity-inbox';
import type { SuggestionRule } from '../types';

const SUPPORTED_TARGETS = new Set<ActivitySource>(['task', 'follow_up']);

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export const telegramOpenRelated: SuggestionRule = (item, ctx) => {
  if (item.source !== 'telegram') return [];

  const entityType = asString(item.meta.entity_type) as ActivitySource | null;
  const entityId = asString(item.meta.entity_id);
  if (!entityType || !entityId) return [];
  if (!SUPPORTED_TARGETS.has(entityType)) return [];

  // Try to find the linked entity in the current context so we can use
  // a fresh title (the item.title sometimes contains a fallback like
  // "deadline_reminder reminder" when the underlying entity is closed).
  // The RPC's coalesce already does its best to fetch the task/follow-up
  // title — but the row may pre-date a recent rename.
  const linked = ctx.bySource[entityType]?.find(
    (x) => x.native_id === entityId,
  );

  const title = linked?.title ?? item.title;
  const labelKind = entityType === 'task' ? 'task' : 'follow-up';

  return [
    {
      id: `${item.id}:telegram-open-related`,
      rule: 'telegram-open-related',
      action: 'open_related',
      label: `Open ${labelKind}: ${title}`,
      reason: `Reminder is linked to ${labelKind} "${title}".`,
      score: 0.95,
      target: {
        source: entityType,
        native_id: entityId,
        title,
      },
    },
  ];
};

export const TELEGRAM_RULES: SuggestionRule[] = [telegramOpenRelated];
