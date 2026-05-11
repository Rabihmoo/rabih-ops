// Phase G2.3 — Calendar suggestion rules.
//
// Three pure SuggestionRule functions that run only on items where
// source === 'calendar'. Deterministic; no AI; no network.

import { BRANCH_LIST } from '../../branches';
import { similarityScore, withBranchBoost } from '../similarity';
import type { Suggestion, SuggestionRule } from '../types';

// =========================================================
// Helpers
// =========================================================

function formatLocalTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // en-US, 24-hour, no seconds — short and unambiguous for the reason text.
  return new Date(t).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function todayIso(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// =========================================================
// Rule 1 — calendar-similar-to-task
// =========================================================

export const calendarSimilarToTask: SuggestionRule = (item, ctx) => {
  if (item.source !== 'calendar') return [];
  const title = item.title?.trim();
  if (!title) return [];

  const out: Suggestion[] = [];
  for (const task of ctx.bySource.task) {
    const raw = similarityScore(title, task.title);
    if (raw < 0.5) continue;
    // Calendar items always have branch=null in the normalizer, so the
    // branch boost is a no-op today — kept for symmetry with the Gmail
    // version in case calendar items grow a branch field later.
    const score = withBranchBoost(raw, item.branch, task.branch);
    out.push({
      id: `${item.id}:calendar-similar-to-task:${task.native_id}`,
      rule: 'calendar-similar-to-task',
      action: 'link_to_existing',
      label: `Link to task: ${task.title}`,
      reason: `Event has similar wording to open task "${task.title}" (${Math.round(score * 100)}% match).`,
      score,
      target: {
        source: 'task',
        native_id: task.native_id,
        title: task.title,
      },
    });
  }
  return out;
};

// =========================================================
// Rule 2 — calendar-today-near-start
// =========================================================

export const calendarTodayNearStart: SuggestionRule = (item, ctx) => {
  if (item.source !== 'calendar') return [];
  if (!item.due_at) return [];
  const startMs = Date.parse(item.due_at);
  if (!Number.isFinite(startMs)) return [];

  const nowMs = ctx.now.getTime();
  const minutesUntilStart = (startMs - nowMs) / 60000;
  // Window: 60 minutes ahead through to 30 minutes after start
  // (covers "about to start" and "just started" — both are moments
  // when capturing a follow-up beats waiting until the meeting is over).
  if (minutesUntilStart > 60 || minutesUntilStart < -30) return [];

  const timeLabel = formatLocalTime(item.due_at);
  const reason = timeLabel
    ? `Event starts at ${timeLabel} — log a follow-up so action items don't get lost.`
    : `Event starts soon — log a follow-up so action items don't get lost.`;

  return [
    {
      id: `${item.id}:calendar-today-near-start`,
      rule: 'calendar-today-near-start',
      action: 'create_follow_up',
      label: 'Create follow-up',
      reason,
      score: 0.6,
      prefill: {
        title: `Follow up after ${item.title}`,
        due_date: todayIso(ctx.now),
        description: item.summary ?? undefined,
      },
    },
  ];
};

// =========================================================
// Rule 3 — calendar-location-known-branch
// =========================================================

export const calendarLocationKnownBranch: SuggestionRule = (item) => {
  if (item.source !== 'calendar') return [];
  const location =
    typeof item.meta.location === 'string' ? item.meta.location.trim() : null;
  if (!location) return [];

  const haystack = location.toLowerCase();
  const out: Suggestion[] = [];
  for (const b of BRANCH_LIST) {
    const codeHit = haystack.includes(b.code.toLowerCase());
    const nameHit = haystack.includes(b.name.toLowerCase());
    if (!codeHit && !nameHit) continue;
    out.push({
      id: `${item.id}:calendar-location-known-branch:${b.code}`,
      rule: 'calendar-location-known-branch',
      action: 'create_task',
      label: `Create task for ${b.name}`,
      reason: `Event location "${location}" matches branch "${b.name}".`,
      score: 0.5,
      prefill: {
        title: item.title,
        branch: b.code,
        description: item.summary ?? undefined,
      },
    });
  }
  return out;
};

// =========================================================
// Bundle
// =========================================================

export const CALENDAR_RULES: SuggestionRule[] = [
  calendarSimilarToTask,
  calendarTodayNearStart,
  calendarLocationKnownBranch,
];
