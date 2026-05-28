// Pure helpers for Smart Suggestions v2 — threshold + disabled-rules checks.
// No supabase import — vitest-safe.

import type { InboxSettings } from '../inbox-settings';

/** Default thresholds — used when no user row exists. */
export const DEFAULTS: InboxSettings = {
  stale_follow_up_days: 7,
  supplier_silence_days: 5,
  draft_doc_aging_days: 14,
  recurring_grace_days: 2,
  disabled_rules: [],
};

/** Merge user settings over defaults. Handles null/undefined fields. */
export function mergeSettings(
  user: Partial<InboxSettings> | null | undefined,
): InboxSettings {
  if (!user) return DEFAULTS;
  return {
    stale_follow_up_days: user.stale_follow_up_days ?? DEFAULTS.stale_follow_up_days,
    supplier_silence_days: user.supplier_silence_days ?? DEFAULTS.supplier_silence_days,
    draft_doc_aging_days: user.draft_doc_aging_days ?? DEFAULTS.draft_doc_aging_days,
    recurring_grace_days: user.recurring_grace_days ?? DEFAULTS.recurring_grace_days,
    disabled_rules: user.disabled_rules ?? DEFAULTS.disabled_rules,
  };
}

/** True if the rule key is in the user's disabled list. */
export function isRuleDisabled(
  settings: InboxSettings,
  ruleKey: string,
): boolean {
  return settings.disabled_rules.includes(ruleKey);
}

/** Days since an ISO timestamp. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
