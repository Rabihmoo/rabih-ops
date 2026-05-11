import { describe, expect, it } from 'vitest';
import { similarityScore, tokenize, withBranchBoost } from './similarity';

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops short tokens', () => {
    expect(tokenize("Renew gas-cylinder contract!")).toEqual([
      'renew',
      'gas',
      'cylinder',
      'contract',
    ]);
  });

  it('strips a single Re:/Fwd: prefix', () => {
    expect(tokenize('Re: invoice 2034')).toEqual(['invoice', '2034']);
    expect(tokenize('Fwd: delivery delayed')).toEqual(['delivery', 'delayed']);
  });

  it('drops stop-words and 1-2-letter tokens', () => {
    expect(tokenize('Please follow up on the order today')).toEqual(['order']);
  });

  it('returns [] for empty / whitespace input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('similarityScore', () => {
  it('returns 1.0 when both sides reduce to the same token set', () => {
    expect(similarityScore('Renew gas cylinder contract', 'Renew gas-cylinder contract')).toBe(
      1,
    );
  });

  it('returns 0 when there is no informative overlap', () => {
    expect(similarityScore('Cold-room temperature out of range', 'New laptop quote')).toBe(0);
  });

  it('returns 0 when either side has fewer than 2 informative tokens', () => {
    // After dropping stop-words + <3-char tokens, the left side reduces to
    // ["fix"]. Even with strong overlap on the right, the short-string
    // guard kicks in and returns 0.
    expect(similarityScore('Fix it today', 'Fix gas cylinder contract')).toBe(0);
  });

  it('ignores Re:/Fwd: prefixes when scoring', () => {
    const s = similarityScore('Renew gas cylinder contract', 'Re: Renew gas cylinder contract');
    expect(s).toBe(1);
  });

  it('partial overlap returns a score between 0 and 1', () => {
    const s = similarityScore(
      'Renew gas cylinder contract for SALT',
      'Renew gas cylinder contract for BBQ House',
    );
    // Sets: {renew, gas, cylinder, contract, salt} vs {renew, gas, cylinder, contract, bbq, house}
    // Intersection = 4. min(|A|,|B|) = 5. Score = 0.8.
    expect(s).toBeCloseTo(0.8, 5);
  });

  it('is symmetric', () => {
    const a = 'Renew gas cylinder contract for SALT';
    const b = 'Renew gas cylinder contract for BBQ House';
    expect(similarityScore(a, b)).toBeCloseTo(similarityScore(b, a), 5);
  });
});

describe('withBranchBoost', () => {
  it('boosts only when both branches are non-null and equal', () => {
    expect(withBranchBoost(0.5, 'salt', 'salt')).toBeCloseTo(0.6, 5);
    expect(withBranchBoost(0.5, 'salt', 'bbqhouse')).toBe(0.5);
    expect(withBranchBoost(0.5, null, 'salt')).toBe(0.5);
    expect(withBranchBoost(0.5, 'salt', null)).toBe(0.5);
    expect(withBranchBoost(0.5, null, null)).toBe(0.5);
  });

  it('clamps to 1.0', () => {
    expect(withBranchBoost(0.95, 'salt', 'salt', 0.2)).toBe(1);
  });
});
