// Phase 6 — supplier-silence rule.
//
// Fires when a purchase has been in ordered/submitted status for > N
// days (default 5) with no recent inbound activity referencing the
// same supplier. Detection uses the inbox context: checks gmail and
// follow-up items for title/summary overlap with the purchase's
// supplier_name via a simple substring match.

import { daysSince } from '../settings-helpers';
import type { SuggestionRule } from '../types';

export const RULE_KEY = 'supplier-silence';

export const supplierSilence: SuggestionRule = (item, ctx) => {
  if (item.source !== 'purchase') return [];

  const status = typeof item.meta.status === 'string' ? item.meta.status : null;
  if (status !== 'ordered' && status !== 'submitted') return [];

  const age = daysSince(item.occurred_at, ctx.now);
  if (age < 5) return []; // default threshold

  // Look for the supplier name in the item title or meta
  const supplierName =
    typeof item.meta.supplier_name === 'string' ? item.meta.supplier_name.toLowerCase() : null;
  if (!supplierName) return [];

  // Check for recent inbound activity mentioning this supplier
  const recentWindow = 5; // days
  const hasRecentInbound = [...(ctx.bySource.gmail ?? []), ...(ctx.bySource.follow_up ?? [])].some(
    (other) => {
      const otherAge = daysSince(other.occurred_at, ctx.now);
      if (otherAge > recentWindow) return false;
      const text = `${other.title} ${other.summary ?? ''}`.toLowerCase();
      return text.includes(supplierName);
    },
  );

  if (hasRecentInbound) return [];

  return [
    {
      id: `${item.id}:${RULE_KEY}`,
      rule: RULE_KEY,
      action: 'create_follow_up',
      label: `No reply from ${item.meta.supplier_name} in ${age}d`,
      reason: `This purchase order has been ${status} for ${age} days with no visible reply from the supplier. Consider following up.`,
      score: 0.7,
      prefill: {
        title: `Chase supplier: ${item.meta.supplier_name}`,
        branch: item.branch,
      },
    },
  ];
};

export const SUPPLIER_SILENCE_RULES: SuggestionRule[] = [supplierSilence];
