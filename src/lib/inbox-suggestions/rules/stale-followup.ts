// Phase 6 — stale-follow-up rule.
//
// Fires when an open follow-up has had no activity for > N days (default 7).

import { daysSince } from '../settings-helpers';
import type { SuggestionRule } from '../types';

export const RULE_KEY = 'stale-follow-up';

export const staleFollowUp: SuggestionRule = (item, ctx) => {
  if (item.source !== 'follow_up') return [];

  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status === 'done' || status === 'cancelled') return [];

  const age = daysSince(item.occurred_at, ctx.now);
  if (age < 7) return [];

  return [
    {
      id: `${item.id}:${RULE_KEY}`,
      rule: RULE_KEY,
      action: 'create_follow_up',
      label: `Stale for ${age} days — chase or close`,
      reason: `This follow-up has been open for ${age} days with no activity. Consider following up or closing it.`,
      score: 0.65,
      prefill: {
        title: `Chase: ${item.title}`,
        branch: item.branch,
      },
    },
  ];
};

export const STALE_FOLLOWUP_RULES: SuggestionRule[] = [staleFollowUp];
