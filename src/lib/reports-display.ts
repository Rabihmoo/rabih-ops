// Pure display helpers for reports — env-free, vitest-safe.

import type { CurrencyBreakdown } from './reports';

/** Format a number with thousands separators and 2 decimal places. */
export function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format supplier spend with currency-safe display.
 *
 * Returns "1,234.56 MZN" for MZN-only suppliers, or
 * "1,234.56 MZN + 2,400.00 USD + 850.00 LBP" when
 * multiple currencies are present.
 *
 * NEVER silently sums across currencies — each currency
 * is listed separately.
 */
export function formatSupplierTotal(
  totalMzn: number,
  breakdown: CurrencyBreakdown[],
): string {
  const parts: string[] = [];

  // Always show MZN first (even if 0 and there are other currencies)
  if (totalMzn > 0 || breakdown.length === 0 || breakdown.every((b) => b.currency === 'MZN')) {
    parts.push(`${formatAmount(totalMzn)} MZN`);
  }

  // Add non-MZN currencies
  for (const b of breakdown) {
    if (b.currency === 'MZN') continue;
    if (b.total_amount > 0) {
      parts.push(`${formatAmount(b.total_amount)} ${b.currency}`);
    }
  }

  return parts.length > 0 ? parts.join(' + ') : '0.00 MZN';
}
