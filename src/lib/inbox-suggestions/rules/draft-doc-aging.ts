// Phase 6 — draft-doc-aging rule.
//
// Fires when a document has been in DRAFT status for > N days (default 14).

import { daysSince } from '../settings-helpers';
import type { SuggestionRule } from '../types';

export const RULE_KEY = 'draft-doc-aging';

export const draftDocAging: SuggestionRule = (item, ctx) => {
  if (item.source !== 'document') return [];

  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status !== 'draft') return [];

  const age = daysSince(item.occurred_at, ctx.now);
  if (age < 14) return []; // default threshold

  return [
    {
      id: `${item.id}:${RULE_KEY}`,
      rule: RULE_KEY,
      action: 'open_related',
      label: `Draft for ${age} days — finalize or archive`,
      reason: `This document has been in draft for ${age} days. Consider finalizing it or archiving if no longer needed.`,
      score: 0.5,
    },
  ];
};

export const DRAFT_DOC_AGING_RULES: SuggestionRule[] = [draftDocAging];
