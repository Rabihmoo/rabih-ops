// Phase 6 — overdue-finding rule.
//
// Fires when an inspection finding is past its due date and still open.

import type { SuggestionRule } from '../types';

export const RULE_KEY = 'overdue-finding';

export const overdueFinding: SuggestionRule = (item, ctx) => {
  if (item.source !== 'inspection_finding') return [];

  // Check if the finding is open (not resolved)
  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status === 'resolved') return [];

  // Must have a due date and be past it
  if (!item.due_at) return [];
  const dueMs = new Date(item.due_at).getTime();
  if (dueMs >= ctx.now.getTime()) return [];

  const daysOverdue = Math.floor((ctx.now.getTime() - dueMs) / (24 * 60 * 60 * 1000));

  return [
    {
      id: `${item.id}:${RULE_KEY}`,
      rule: RULE_KEY,
      action: 'open_related',
      label: `Finding overdue by ${daysOverdue}d — resolve or escalate`,
      reason: `This inspection finding is ${daysOverdue} days past its follow-up date. Resolve it or escalate to prevent compliance issues.`,
      score: 0.75,
    },
  ];
};

export const OVERDUE_FINDING_RULES: SuggestionRule[] = [overdueFinding];
