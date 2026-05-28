import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  daysSince,
  isRuleDisabled,
  mergeSettings,
} from './settings-helpers';

describe('mergeSettings', () => {
  it('returns defaults for null input', () => {
    expect(mergeSettings(null)).toEqual(DEFAULTS);
  });

  it('returns defaults for undefined input', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULTS);
  });

  it('merges partial user settings over defaults', () => {
    const result = mergeSettings({ stale_follow_up_days: 3 });
    expect(result.stale_follow_up_days).toBe(3);
    expect(result.supplier_silence_days).toBe(5); // default
    expect(result.disabled_rules).toEqual([]); // default
  });

  it('preserves disabled_rules', () => {
    const result = mergeSettings({ disabled_rules: ['stale-follow-up'] });
    expect(result.disabled_rules).toEqual(['stale-follow-up']);
  });
});

describe('isRuleDisabled', () => {
  it('returns false when rule is not in disabled list', () => {
    expect(isRuleDisabled(DEFAULTS, 'stale-follow-up')).toBe(false);
  });

  it('returns true when rule is disabled', () => {
    expect(
      isRuleDisabled(
        { ...DEFAULTS, disabled_rules: ['stale-follow-up', 'draft-doc-aging'] },
        'stale-follow-up',
      ),
    ).toBe(true);
  });
});

describe('daysSince', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('returns 0 for today', () => {
    expect(daysSince('2026-06-15T06:00:00Z', now)).toBe(0);
  });

  it('returns 1 for yesterday', () => {
    expect(daysSince('2026-06-14T12:00:00Z', now)).toBe(1);
  });

  it('returns 7 for a week ago', () => {
    expect(daysSince('2026-06-08T12:00:00Z', now)).toBe(7);
  });

  it('returns negative for future timestamps', () => {
    expect(daysSince('2026-06-20T12:00:00Z', now)).toBe(-5);
  });
});
