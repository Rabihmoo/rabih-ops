// Phase G2.4 — Task suggestion rules.

import type { ActivityItem } from '../../activity-inbox';
import { similarityScore, withBranchBoost } from '../similarity';
import type { Suggestion, SuggestionRule } from '../types';

const HIGH_PRIORITY_SEVERITIES: ReadonlySet<ActivityItem['severity']> = new Set([
  'critical',
  'overdue',
  'due_today',
]);

// =========================================================
// task-waiting-on-someone — score 0.7
// =========================================================
// Fires when the task is flagged as waiting on someone. Suggests creating
// a follow-up so the chase doesn't slip. Uses waiting_on_label when set.

export const taskWaitingOnSomeone: SuggestionRule = (item) => {
  if (item.source !== 'task') return [];
  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status !== 'waiting_for_someone') return [];

  const waitingOn =
    typeof item.meta.waiting_on_label === 'string' &&
    item.meta.waiting_on_label.trim().length > 0
      ? item.meta.waiting_on_label.trim()
      : null;

  return [
    {
      id: `${item.id}:task-waiting-on-someone`,
      rule: 'task-waiting-on-someone',
      action: 'create_follow_up',
      label: waitingOn ? `Chase ${waitingOn}` : 'Create follow-up to chase',
      reason: waitingOn
        ? `Task is waiting on "${waitingOn}" — log a follow-up so the chase doesn't slip.`
        : "Task is waiting on someone — log a follow-up so the chase doesn't slip.",
      score: 0.7,
      prefill: {
        title: `Chase: ${item.title}`,
        person: waitingOn ?? undefined,
        branch: item.branch,
      },
    },
  ];
};

// =========================================================
// task-critical-no-doc — score 0.5
// =========================================================
// The RPC payload doesn't expose document_links presence, so this rule
// can't deterministically check "no linked document". We gate on
// severity (critical/overdue/due_today) and surface a low-priority hint
// — the dismiss store lets the user silence false positives per row.

export const taskCriticalNoDoc: SuggestionRule = (item) => {
  if (item.source !== 'task') return [];
  if (!HIGH_PRIORITY_SEVERITIES.has(item.severity)) return [];
  return [
    {
      id: `${item.id}:task-critical-no-doc`,
      rule: 'task-critical-no-doc',
      action: 'link_document',
      label: 'Link an SOP or document',
      reason:
        'This task is high-priority — link an SOP, policy or note if one is relevant.',
      score: 0.5,
    },
  ];
};

// =========================================================
// task-similar-other — score = similarity + branch boost
// =========================================================
// Possible-duplicate hint between two open tasks. Requires similarity
// >= 0.6 (one notch higher than gmail-similar-to-task) so we only flag
// strong overlaps. Skips comparing a task to itself.

export const taskSimilarOther: SuggestionRule = (item, ctx) => {
  if (item.source !== 'task') return [];
  const title = item.title?.trim();
  if (!title) return [];

  const out: Suggestion[] = [];
  for (const other of ctx.bySource.task) {
    if (other.native_id === item.native_id) continue;
    const raw = similarityScore(title, other.title);
    if (raw < 0.6) continue;
    const score = withBranchBoost(raw, item.branch, other.branch);
    out.push({
      id: `${item.id}:task-similar-other:${other.native_id}`,
      rule: 'task-similar-other',
      action: 'link_to_existing',
      label: `Possible duplicate: ${other.title}`,
      reason: `Title is similar to open task "${other.title}" (${Math.round(score * 100)}% match) — possible duplicate.`,
      score,
      target: {
        source: 'task',
        native_id: other.native_id,
        title: other.title,
      },
    });
  }
  return out;
};

export const TASK_RULES: SuggestionRule[] = [
  taskWaitingOnSomeone,
  taskCriticalNoDoc,
  taskSimilarOther,
];
