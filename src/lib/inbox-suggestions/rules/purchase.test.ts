import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  purchaseOverdueNoFollowUp,
  purchaseUnpaidNoFollowUp,
} from './purchase';
import { ctxOf, FIXTURE_NOW, fakeItem } from './test-helpers';

// =====================================================================
// purchase-overdue-no-followup
// =====================================================================

describe('purchase-overdue-no-followup', () => {
  it('fires when delivery is overdue and no follow-up references the supplier', () => {
    const p = fakeItem({
      source: 'purchase',
      native_id: 'p1',
      title: 'Frozen lamb order',
      branch: 'salt',
      severity: 'overdue',
      meta: { supplier_name: 'Acme Foods Ltd', payment_status: 'paid' },
    });
    const out = purchaseOverdueNoFollowUp(p, ctxOf([p]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_follow_up');
    expect(out[0].label).toBe('Chase Acme Foods Ltd');
    expect(out[0].reason).toContain('Acme Foods Ltd');
    expect(out[0].prefill?.supplier_name).toBe('Acme Foods Ltd');
    expect(out[0].prefill?.person).toBe('Acme Foods Ltd');
    expect(out[0].prefill?.branch).toBe('salt');
  });

  it('does NOT fire when a follow-up already references the supplier name', () => {
    const p = fakeItem({
      source: 'purchase',
      native_id: 'p1',
      title: 'Frozen lamb order',
      severity: 'overdue',
      meta: { supplier_name: 'Acme Foods Ltd', payment_status: 'paid' },
    });
    const f = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Reminder',
      meta: { person: 'Acme Foods Ltd' },
    });
    expect(purchaseOverdueNoFollowUp(p, ctxOf([p, f]))).toEqual([]);
  });

  it('does NOT fire when a follow-up title contains the supplier name', () => {
    const p = fakeItem({
      source: 'purchase',
      native_id: 'p1',
      title: 'Frozen lamb order',
      severity: 'overdue',
      meta: { supplier_name: 'Acme Foods Ltd', payment_status: 'paid' },
    });
    const f = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Chase Acme Foods Ltd about late delivery',
    });
    expect(purchaseOverdueNoFollowUp(p, ctxOf([p, f]))).toEqual([]);
  });

  it('does NOT fire when severity is not overdue', () => {
    const p = fakeItem({
      source: 'purchase',
      native_id: 'p1',
      title: 'Frozen lamb order',
      severity: 'due_today',
      meta: { supplier_name: 'Acme Foods', payment_status: 'unpaid' },
    });
    expect(purchaseOverdueNoFollowUp(p, ctxOf([p]))).toEqual([]);
  });

  it('ignores non-purchase items', () => {
    const t = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'wrong',
      severity: 'overdue',
      meta: { supplier_name: 'Acme Foods' },
    });
    expect(purchaseOverdueNoFollowUp(t, ctxOf([t]))).toEqual([]);
  });
});

// =====================================================================
// purchase-unpaid-no-followup
// =====================================================================

describe('purchase-unpaid-no-followup', () => {
  function recentPurchase(ageDays: number, payment: string) {
    const ms = FIXTURE_NOW.getTime() - ageDays * 86400000;
    return fakeItem({
      source: 'purchase',
      native_id: 'p1',
      title: 'Frozen lamb order',
      branch: 'salt',
      severity: 'info',
      occurred_at: new Date(ms).toISOString(),
      meta: { supplier_name: 'Acme Foods Ltd', payment_status: payment },
    });
  }

  it('fires when unpaid and older than 14 days with no related follow-up', () => {
    const p = recentPurchase(20, 'unpaid');
    const out = purchaseUnpaidNoFollowUp(p, ctxOf([p]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_follow_up');
    expect(out[0].reason.toLowerCase()).toContain('unpaid');
    expect(out[0].score).toBe(0.5);
  });

  it('fires for partial payment when older than 14 days', () => {
    const p = recentPurchase(15, 'partial');
    expect(purchaseUnpaidNoFollowUp(p, ctxOf([p]))).toHaveLength(1);
  });

  it('does NOT fire when age is 14 days or less', () => {
    const p = recentPurchase(10, 'unpaid');
    expect(purchaseUnpaidNoFollowUp(p, ctxOf([p]))).toEqual([]);
  });

  it('does NOT fire when payment status is paid', () => {
    const p = recentPurchase(30, 'paid');
    expect(purchaseUnpaidNoFollowUp(p, ctxOf([p]))).toEqual([]);
  });

  it('does NOT fire when a related follow-up exists', () => {
    const p = recentPurchase(30, 'unpaid');
    const f = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'reminder',
      meta: { person: 'Acme Foods Ltd' },
    });
    expect(purchaseUnpaidNoFollowUp(p, ctxOf([p, f]))).toEqual([]);
  });
});
