// Deterministic, no-AI similarity score in [0, 1].
//
// Approach: length-weighted Jaccard variant on normalized tokens.
//   - lowercase, strip Re:/Fwd:/FW: prefixes, strip non-alphanumerics
//   - drop stop-words + tokens shorter than 3 chars
//   - score = |intersection| / min(|A|, |B|)
//
// This is intentionally simple and explainable: every rule that uses it
// can quote token-overlap as the reason. No embeddings, no AI.

const STOP_WORDS = new Set([
  // articles / prepositions
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'and', 'or',
  // pronouns / aux
  'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'we', 'you', 'they', 'he', 'she', 'them', 'our', 'your', 'their',
  // generic boilerplate
  'please', 'kindly', 'thanks', 'thank', 'regards', 'hello', 'hi', 'hey', 'fyi',
  'today', 'tomorrow', 'now', 'soon', 'asap', 'urgent',
  // generic actions that show up everywhere
  'follow', 'up', 'about', 're', 'fwd', 'fw',
]);

const SUBJECT_PREFIX = /^\s*(re|fwd|fw)\s*:\s*/gi;
const PUNCT = /[^a-z0-9\s]/g;

export function tokenize(input: string): string[] {
  if (!input) return [];
  return input
    .toLowerCase()
    .replace(SUBJECT_PREFIX, '')
    // Iteratively strip nested Re/Fwd prefixes ("Re: Fwd: Re: …")
    .replace(SUBJECT_PREFIX, '')
    .replace(PUNCT, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Returns a similarity score in [0, 1].
 * Returns 0 when either side has fewer than 2 informative tokens — strings
 * that short are too unreliable for deterministic matching.
 */
export function similarityScore(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size < 2 || B.size < 2) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect++;
  return intersect / Math.min(A.size, B.size);
}

/**
 * Apply an optional branch-match boost: rules can use this to weight
 * candidates that share a branch with the source item. Capped at 1.0.
 */
export function withBranchBoost(
  score: number,
  branchA: string | null,
  branchB: string | null,
  boost = 0.1,
): number {
  if (!branchA || !branchB) return score;
  if (branchA !== branchB) return score;
  return Math.min(1, score + boost);
}

// Exposed for tests so they don't drift from the constant.
export const __SIMILARITY_INTERNALS__ = { STOP_WORDS };
