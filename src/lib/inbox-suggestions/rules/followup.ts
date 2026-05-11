// Phase G2.4 — Follow-up suggestion rules.

import { similarityScore, withBranchBoost } from '../similarity';
import type { Suggestion, SuggestionRule } from '../types';

// =========================================================
// followup-overdue-no-task — score 0.7
// =========================================================
// The RPC meta doesn't expose follow_ups.task_id today, so this rule
// can't verify "linked to a task" deterministically. We gate on
// severity=overdue and accept the trivially-true predicate; a user
// can dismiss false positives per row.

export const followUpOverdueNoTask: SuggestionRule = (item) => {
  if (item.source !== 'follow_up') return [];
  if (item.severity !== 'overdue') return [];
  return [
    {
      id: `${item.id}:followup-overdue-no-task`,
      rule: 'followup-overdue-no-task',
      action: 'create_task',
      label: 'Create task to act on this',
      reason:
        'This follow-up is overdue — promote it to a tracked task so it has a clear next action.',
      score: 0.7,
      prefill: {
        title: item.title,
        branch: item.branch,
        description: item.summary ?? undefined,
      },
    },
  ];
};

// =========================================================
// followup-similar-other — score = similarity + branch boost
// =========================================================
// Possible-duplicate hint between two open follow-ups, threshold 0.6.

export const followUpSimilarOther: SuggestionRule = (item, ctx) => {
  if (item.source !== 'follow_up') return [];
  const title = item.title?.trim();
  if (!title) return [];

  const out: Suggestion[] = [];
  for (const other of ctx.bySource.follow_up) {
    if (other.native_id === item.native_id) continue;
    const raw = similarityScore(title, other.title);
    if (raw < 0.6) continue;
    const score = withBranchBoost(raw, item.branch, other.branch);
    out.push({
      id: `${item.id}:followup-similar-other:${other.native_id}`,
      rule: 'followup-similar-other',
      action: 'link_to_existing',
      label: `Possible duplicate: ${other.title}`,
      reason: `Title is similar to open follow-up "${other.title}" (${Math.round(score * 100)}% match) — possible duplicate.`,
      score,
      target: {
        source: 'follow_up',
        native_id: other.native_id,
        title: other.title,
      },
    });
  }
  return out;
};

export const FOLLOWUP_RULES: SuggestionRule[] = [
  followUpOverdueNoTask,
  followUpSimilarOther,
];
