import { describe, expect, it } from 'vitest';
import { supplierSilence } from './supplier-silence';
import { ctxOf, fakeItem } from './test-helpers';

describe('supplier-silence rule', () => {
  const purchase = fakeItem({
    source: 'purchase',
    native_id: 'p-1',
    title: 'Gas cylinders order',
    occurred_at: '2026-04-30T08:00:00Z', // 11 days before FIXTURE_NOW
    meta: { status: 'ordered', supplier_name: 'Al Amin Supplies' },
  });

  it('fires when purchase is ordered and no recent inbound', () => {
    const suggestions = supplierSilence(purchase, ctxOf([purchase]));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].rule).toBe('supplier-silence');
    expect(suggestions[0].label).toContain('Al Amin Supplies');
  });

  it('does not fire when recent gmail mentions the supplier', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g-1',
      title: 'Re: Al Amin Supplies invoice',
      occurred_at: '2026-05-09T08:00:00Z', // 2 days before FIXTURE_NOW
    });
    const suggestions = supplierSilence(purchase, ctxOf([purchase, email]));
    expect(suggestions).toEqual([]);
  });

  it('does not fire when purchase is < 5 days old', () => {
    const recent = fakeItem({
      ...purchase,
      native_id: 'p-2',
      occurred_at: '2026-05-08T08:00:00Z', // 3 days before FIXTURE_NOW
    });
    expect(supplierSilence(recent, ctxOf([recent]))).toEqual([]);
  });

  it('does not fire for non-ordered status', () => {
    const delivered = fakeItem({
      ...purchase,
      native_id: 'p-3',
      meta: { status: 'fully_received', supplier_name: 'Al Amin Supplies' },
    });
    expect(supplierSilence(delivered, ctxOf([delivered]))).toEqual([]);
  });

  it('does not fire for non-purchase items', () => {
    const task = fakeItem({
      source: 'task',
      native_id: 't-1',
      meta: { status: 'ordered', supplier_name: 'Al Amin' },
    });
    expect(supplierSilence(task, ctxOf([task]))).toEqual([]);
  });

  it('does not fire when supplier_name is missing', () => {
    const noSupplier = fakeItem({
      source: 'purchase',
      native_id: 'p-4',
      occurred_at: '2026-04-30T08:00:00Z',
      meta: { status: 'ordered' },
    });
    expect(supplierSilence(noSupplier, ctxOf([noSupplier]))).toEqual([]);
  });
});
