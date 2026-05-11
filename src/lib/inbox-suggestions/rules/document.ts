// Phase G2.4 — Document suggestion rule.
//
// The RPC payload doesn't expose document_links presence, so a naive
// "no link signal in meta" predicate fires for every recent active
// document, which would flood the inbox. We tighten the rule with a
// title-similarity gate: only suggest when a candidate task / follow-up /
// purchase in the active context has a title resembling the document's
// title. That keeps the rule conservative and gives the user a specific
// target to link.

import type { ActivityItem } from '../../activity-inbox';
import { similarityScore } from '../similarity';
import type { Suggestion, SuggestionRule } from '../types';

const MIN_AGE_DAYS = 7;
const TITLE_SIMILARITY_FLOOR = 0.4;
const MAX_TARGETS_PER_DOC = 2;
const SCORE_CAP = 0.5; // hint, not a strong signal

type CandidateSource = 'task' | 'follow_up' | 'purchase';

function candidateLabel(src: CandidateSource): string {
  return src === 'follow_up' ? 'follow-up' : src;
}

export const documentUnlinked: SuggestionRule = (item, ctx) => {
  if (item.source !== 'document') return [];
  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status !== 'active') return [];

  const occurredMs = Date.parse(item.occurred_at);
  if (!Number.isFinite(occurredMs)) return [];
  const ageDays = (ctx.now.getTime() - occurredMs) / 86400000;
  if (ageDays < MIN_AGE_DAYS) return [];

  const candidates: Array<{
    src: CandidateSource;
    item: ActivityItem;
    score: number;
  }> = [];
  const examine = (others: ReadonlyArray<ActivityItem>, src: CandidateSource) => {
    for (const o of others) {
      const score = similarityScore(item.title, o.title);
      if (score >= TITLE_SIMILARITY_FLOOR) candidates.push({ src, item: o, score });
    }
  };
  examine(ctx.bySource.task, 'task');
  examine(ctx.bySource.follow_up, 'follow_up');
  examine(ctx.bySource.purchase, 'purchase');
  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, MAX_TARGETS_PER_DOC);

  const ageRounded = Math.floor(ageDays);
  return top.map<Suggestion>(({ src, item: cand, score }) => ({
    id: `${item.id}:document-unlinked:${src}:${cand.native_id}`,
    rule: 'document-unlinked',
    action: 'link_to_existing',
    label: `Link to ${candidateLabel(src)}: ${cand.title}`,
    reason: `Document is ${ageRounded}d old and unlinked; title is similar to open ${candidateLabel(src)} "${cand.title}" (${Math.round(score * 100)}% match) — link them if related.`,
    score: Math.min(SCORE_CAP, score),
    target: {
      source: src,
      native_id: cand.native_id,
      title: cand.title,
    },
  }));
};

export const DOCUMENT_RULES: SuggestionRule[] = [documentUnlinked];
