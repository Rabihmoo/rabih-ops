import { describe, expect, it } from 'vitest';
import {
  CLOSED_STATUSES,
  FOLLOW_UP_STATUSES,
  OPEN_STATUSES,
  followUpStatusLabel,
  followUpStatusTone,
  isOpenStatus,
  isValidStatusTransition,
} from './follow-up-status';

describe('FOLLOW_UP_STATUSES', () => {
  it('contains exactly the 7 user-approved values in order', () => {
    expect(FOLLOW_UP_STATUSES).toEqual([
      'pending',
      'working',
      'waiting',
      'no_answer',
      'postponed',
      'done',
      'cancelled',
    ]);
  });

  it('partitions cleanly into open + closed buckets covering every value', () => {
    const combined = new Set([...OPEN_STATUSES, ...CLOSED_STATUSES]);
    expect(combined.size).toBe(FOLLOW_UP_STATUSES.length);
    for (const s of FOLLOW_UP_STATUSES) {
      expect(combined.has(s)).toBe(true);
    }
  });
});

describe('followUpStatusLabel', () => {
  it('returns the user-approved label for each known status', () => {
    expect(followUpStatusLabel('pending')).toBe('Pending');
    expect(followUpStatusLabel('working')).toBe('Working on it');
    expect(followUpStatusLabel('waiting')).toBe('Waiting for someone');
    expect(followUpStatusLabel('no_answer')).toBe('No answer');
    expect(followUpStatusLabel('postponed')).toBe('Postponed');
    expect(followUpStatusLabel('done')).toBe('Done');
    expect(followUpStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('falls back to a Title-cased label for unknown values (forward-compat)', () => {
    expect(followUpStatusLabel('snoozed' as unknown as 'pending')).toBe('Snoozed');
    expect(followUpStatusLabel('on_hold' as unknown as 'pending')).toBe('On hold');
    expect(followUpStatusLabel('' as unknown as 'pending')).toBe('Unknown');
  });
});

describe('followUpStatusTone', () => {
  it('maps every known status to a tone', () => {
    expect(followUpStatusTone('pending')).toBe('muted');
    expect(followUpStatusTone('working')).toBe('info');
    expect(followUpStatusTone('waiting')).toBe('warning');
    expect(followUpStatusTone('no_answer')).toBe('warning');
    expect(followUpStatusTone('postponed')).toBe('muted');
    expect(followUpStatusTone('done')).toBe('success');
    expect(followUpStatusTone('cancelled')).toBe('muted');
  });

  it('defaults to muted for unknown values', () => {
    expect(followUpStatusTone('mystery' as unknown as 'pending')).toBe('muted');
  });
});

describe('isOpenStatus', () => {
  it('returns true for pending/working/waiting/no_answer/postponed', () => {
    for (const s of OPEN_STATUSES) expect(isOpenStatus(s)).toBe(true);
  });
  it('returns false for done/cancelled', () => {
    for (const s of CLOSED_STATUSES) expect(isOpenStatus(s)).toBe(false);
  });
  it('returns false for unknown values', () => {
    expect(isOpenStatus('mystery' as unknown as 'pending')).toBe(false);
  });
});

describe('isValidStatusTransition', () => {
  it('same-status is treated as a legal transition (idempotent)', () => {
    for (const s of FOLLOW_UP_STATUSES) {
      expect(isValidStatusTransition(s, s)).toBe(true);
    }
  });

  it('all known→known transitions are legal in V1', () => {
    for (const from of FOLLOW_UP_STATUSES) {
      for (const to of FOLLOW_UP_STATUSES) {
        expect(isValidStatusTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects transitions involving unknown values', () => {
    expect(isValidStatusTransition('pending', 'mystery' as unknown as 'done'))
      .toBe(false);
    expect(isValidStatusTransition('mystery' as unknown as 'done', 'pending'))
      .toBe(false);
  });
});
