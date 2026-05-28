import { describe, expect, it } from 'vitest';
import { formatAmount, formatSupplierTotal } from './reports-display';

describe('formatAmount', () => {
  it('formats with 2 decimals and thousands separator', () => {
    expect(formatAmount(1234.5)).toBe('1,234.50');
  });

  it('handles zero', () => {
    expect(formatAmount(0)).toBe('0.00');
  });

  it('handles large numbers', () => {
    expect(formatAmount(1000000)).toBe('1,000,000.00');
  });
});

describe('formatSupplierTotal', () => {
  it('returns MZN-only when no other currencies', () => {
    const result = formatSupplierTotal(5000, [
      { currency: 'MZN', total_amount: 5000, amount_paid: 3000, count: 3 },
    ]);
    expect(result).toBe('5,000.00 MZN');
  });

  it('returns MZN + other currencies when mixed', () => {
    const result = formatSupplierTotal(5000, [
      { currency: 'MZN', total_amount: 5000, amount_paid: 3000, count: 2 },
      { currency: 'USD', total_amount: 2400, amount_paid: 2400, count: 1 },
      { currency: 'LBP', total_amount: 850, amount_paid: 0, count: 1 },
    ]);
    expect(result).toBe('5,000.00 MZN + 2,400.00 USD + 850.00 LBP');
  });

  it('does NOT sum across currencies', () => {
    // Verify that MZN total is NOT 5000+2400+850
    const result = formatSupplierTotal(5000, [
      { currency: 'MZN', total_amount: 5000, amount_paid: 0, count: 1 },
      { currency: 'USD', total_amount: 2400, amount_paid: 0, count: 1 },
    ]);
    expect(result).not.toContain('7,400');
    expect(result).toBe('5,000.00 MZN + 2,400.00 USD');
  });

  it('skips zero-amount other currencies', () => {
    const result = formatSupplierTotal(5000, [
      { currency: 'MZN', total_amount: 5000, amount_paid: 0, count: 1 },
      { currency: 'USD', total_amount: 0, amount_paid: 0, count: 0 },
    ]);
    expect(result).toBe('5,000.00 MZN');
  });

  it('shows only other currency when MZN is 0', () => {
    const result = formatSupplierTotal(0, [
      { currency: 'USD', total_amount: 2400, amount_paid: 0, count: 2 },
    ]);
    // MZN is 0 but there are non-MZN items, skip the 0 MZN
    expect(result).toBe('2,400.00 USD');
  });

  it('returns "0.00 MZN" for completely empty breakdown', () => {
    expect(formatSupplierTotal(0, [])).toBe('0.00 MZN');
  });

  it('returns "0.00 MZN" when all breakdown is MZN with 0', () => {
    const result = formatSupplierTotal(0, [
      { currency: 'MZN', total_amount: 0, amount_paid: 0, count: 0 },
    ]);
    expect(result).toBe('0.00 MZN');
  });
});
