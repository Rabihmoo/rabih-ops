// Phase G2.4 — Purchase suggestion rules.

import type { ActivityItem } from '../../activity-inbox';
import { similarityScore } from '../similarity';
import type { SuggestionRule } from '../types';

// Helper — returns true when *some* follow-up in context appears to
// already be chasing the same supplier or the same purchase. Used by
// both purchase rules to avoid suggesting a duplicate follow-up.
function purchaseHasRelatedFollowUp(
  purchase: ActivityItem,
  followUps: ReadonlyArray<ActivityItem>,
): boolean {
  const supplierName =
    typeof purchase.meta.supplier_name === 'string'
      ? purchase.meta.supplier_name.toLowerCase().trim()
      : '';

  const purchaseTitleLc = purchase.title.toLowerCase();

  for (const fu of followUps) {
    // 1) Match on supplier name in either person or title.
    if (supplierName) {
      const person =
        typeof fu.meta.person === 'string' ? fu.meta.person.toLowerCase() : '';
      if (person.includes(supplierName)) return true;
      if (fu.title.toLowerCase().includes(supplierName)) return true;
    }
    // 2) Title-level similarity (catches "Chase ACME delivery" vs PR title).
    if (similarityScore(purchaseTitleLc, fu.title) >= 0.5) return true;
  }
  return false;
}

// =========================================================
// purchase-overdue-no-followup — score 0.7
// =========================================================

export const purchaseOverdueNoFollowUp: SuggestionRule = (item, ctx) => {
  if (item.source !== 'purchase') return [];
  if (item.severity !== 'overdue') return [];
  if (purchaseHasRelatedFollowUp(item, ctx.bySource.follow_up)) return [];

  const supplierName =
    typeof item.meta.supplier_name === 'string'
      ? item.meta.supplier_name
      : null;

  return [
    {
      id: `${item.id}:purchase-overdue-no-followup`,
      rule: 'purchase-overdue-no-followup',
      action: 'create_follow_up',
      label: supplierName ? `Chase ${supplierName}` : 'Create follow-up to chase delivery',
      reason: supplierName
        ? `Delivery is overdue and no follow-up is chasing "${supplierName}".`
        : 'Delivery is overdue and no follow-up is logged for this purchase.',
      score: 0.7,
      prefill: {
        title: `Chase delivery: ${item.title}`,
        person: supplierName ?? undefined,
        supplier_name: supplierName ?? undefined,
        branch: item.branch,
      },
    },
  ];
};

// =========================================================
// purchase-unpaid-no-followup — score 0.5
// =========================================================
// Fires when payment_status is unpaid/partial AND the row is more than
// 14 days old AND there's no follow-up that mentions the supplier or
// the purchase title.

export const purchaseUnpaidNoFollowUp: SuggestionRule = (item, ctx) => {
  if (item.source !== 'purchase') return [];
  const paymentStatus =
    typeof item.meta.payment_status === 'string'
      ? item.meta.payment_status
      : null;
  if (paymentStatus !== 'unpaid' && paymentStatus !== 'partial') return [];

  const occurredMs = Date.parse(item.occurred_at);
  if (!Number.isFinite(occurredMs)) return [];
  const ageDays = (ctx.now.getTime() - occurredMs) / 86400000;
  if (ageDays <= 14) return [];

  if (purchaseHasRelatedFollowUp(item, ctx.bySource.follow_up)) return [];

  const supplierName =
    typeof item.meta.supplier_name === 'string'
      ? item.meta.supplier_name
      : null;

  return [
    {
      id: `${item.id}:purchase-unpaid-no-followup`,
      rule: 'purchase-unpaid-no-followup',
      action: 'create_follow_up',
      label: supplierName ? `Chase payment: ${supplierName}` : 'Create payment follow-up',
      reason: supplierName
        ? `Purchase has been ${paymentStatus} for more than 14 days and no follow-up references "${supplierName}".`
        : `Purchase has been ${paymentStatus} for more than 14 days with no related follow-up.`,
      score: 0.5,
      prefill: {
        title: `Payment follow-up: ${item.title}`,
        person: supplierName ?? undefined,
        supplier_name: supplierName ?? undefined,
        branch: item.branch,
      },
    },
  ];
};

export const PURCHASE_RULES: SuggestionRule[] = [
  purchaseOverdueNoFollowUp,
  purchaseUnpaidNoFollowUp,
];

export const __PURCHASE_INTERNALS__ = { purchaseHasRelatedFollowUp };
