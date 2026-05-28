// Phase 6 — recurring-template-missing-instance rule.
//
// Tasks with status='needs_repeat' signal the recurring system flagged
// them but no new instance has been spawned. If this persists for > N
// days (grace period, default 2), suggest reviewing the template.
//
// Templates themselves are excluded from the inbox (is_template=false
// filter in rpc_activity_inbox), so we detect via the child task's
// status rather than checking templates directly.

import { daysSince } from '../settings-helpers';
import type { SuggestionRule } from '../types';

export const RULE_KEY = 'recurring-template-missing-instance';

export const recurringMissing: SuggestionRule = (item, ctx) => {
  if (item.source !== 'task') return [];

  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status !== 'needs_repeat') return [];

  // How long has it been stuck in needs_repeat?
  const age = daysSince(item.occurred_at, ctx.now);
  if (age < 2) return []; // default grace

  return [
    {
      id: `${item.id}:${RULE_KEY}`,
      rule: RULE_KEY,
      action: 'open_related',
      label: `Recurring task stuck for ${age} days — check template`,
      reason: `This task has been in "needs repeat" for ${age} days. The recurring template may need attention.`,
      score: 0.8,
    },
  ];
};

export const RECURRING_MISSING_RULES: SuggestionRule[] = [recurringMissing];
