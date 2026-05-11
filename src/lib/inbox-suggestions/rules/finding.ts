// Phase G2.4 — Inspection-finding suggestion rules.

import { similarityScore } from '../similarity';
import type { SuggestionRule } from '../types';

const OPEN_FINDING_STATUSES = new Set(['open', 'in_progress', 'escalated']);

// =========================================================
// finding-critical-no-task — score 0.9
// =========================================================
// Fires when a critical finding has no open task whose title resembles
// the finding's description (item.title for finding rows). Threshold 0.4
// — low bar so we don't double-up if any task is already tracking it.

export const findingCriticalNoTask: SuggestionRule = (item, ctx) => {
  if (item.source !== 'inspection_finding') return [];
  if (item.severity !== 'critical') return [];

  const desc = item.title;
  for (const task of ctx.bySource.task) {
    if (similarityScore(desc, task.title) >= 0.4) {
      // A task already references this finding — nothing to suggest.
      return [];
    }
  }

  return [
    {
      id: `${item.id}:finding-critical-no-task`,
      rule: 'finding-critical-no-task',
      action: 'create_task',
      label: 'Create urgent task',
      reason: 'Critical finding with no task tracking it yet — open one so the fix is owned.',
      score: 0.9,
      prefill: {
        title: item.title,
        priority: 'urgent',
        branch: item.branch,
        description: item.summary ?? undefined,
      },
    },
  ];
};

// =========================================================
// finding-follow-up-overdue — score 0.6
// =========================================================
// The finding has a follow_up_date in the past and is still open.

export const findingFollowUpOverdue: SuggestionRule = (item, ctx) => {
  if (item.source !== 'inspection_finding') return [];
  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (!status || !OPEN_FINDING_STATUSES.has(status)) return [];
  if (!item.due_at) return [];
  const dueMs = Date.parse(item.due_at);
  if (!Number.isFinite(dueMs) || dueMs >= ctx.now.getTime()) return [];

  return [
    {
      id: `${item.id}:finding-follow-up-overdue`,
      rule: 'finding-follow-up-overdue',
      action: 'create_follow_up',
      label: 'Create follow-up',
      reason:
        "Finding's follow-up date has passed and it's still open — log a follow-up so it gets revisited.",
      score: 0.6,
      prefill: {
        title: `Follow up on: ${item.title}`,
        branch: item.branch,
      },
    },
  ];
};

export const FINDING_RULES: SuggestionRule[] = [
  findingCriticalNoTask,
  findingFollowUpOverdue,
];
