import { describe, expect, it } from 'vitest';

import {
  composeEmailStatusPill,
  availableEmailActions,
  emailActionToStatus,
  emailStatusLabel,
  emailStatusTone,
  EMAIL_ACTION_LABEL,
  type EmailStateRow,
  type EmailStatus,
} from './email-status';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function stateRow(
  status: EmailStatus,
  overrides: Partial<EmailStateRow> = {},
): EmailStateRow {
  return {
    user_id: 'u1',
    google_account_id: '109876543210987654321',
    gmail_message_id: 'm1',
    status,
    gmail_thread_id: 't1',
    subject: 'Test',
    from_address: 'a@b.c',
    from_name: 'A',
    snippet: 'snip',
    internal_date: '2026-05-13T10:00:00Z',
    note: null,
    set_at: '2026-05-13T10:00:01Z',
    updated_at: '2026-05-13T10:00:01Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// emailStatusLabel / emailStatusTone — simple lookup tables
// ---------------------------------------------------------------------

describe('emailStatusLabel', () => {
  const cases: [EmailStatus, string][] = [
    ['pending',     'Pending'],
    ['followed_up', 'Followed up'],
    ['done',        'Done'],
    ['dismissed',   'Dismissed'],
  ];
  it.each(cases)('%s → %s', (s, label) => {
    expect(emailStatusLabel(s)).toBe(label);
  });
});

describe('emailStatusTone', () => {
  it('pending is warning', () => expect(emailStatusTone('pending')).toBe('warning'));
  it('followed_up is info', () => expect(emailStatusTone('followed_up')).toBe('info'));
  it('done is success', () => expect(emailStatusTone('done')).toBe('success'));
  it('dismissed is muted', () => expect(emailStatusTone('dismissed')).toBe('muted'));
});

// ---------------------------------------------------------------------
// composeEmailStatusPill — priority and labels
// ---------------------------------------------------------------------

describe('composeEmailStatusPill', () => {
  // Baseline: no state, no links → no pill
  it('returns null when state is null and no links', () => {
    expect(composeEmailStatusPill(null)).toBeNull();
    expect(composeEmailStatusPill(undefined)).toBeNull();
    expect(composeEmailStatusPill(null, {})).toBeNull();
    expect(composeEmailStatusPill(null, { hasTaskLink: false, hasFollowUpLink: false })).toBeNull();
  });

  // 4 statuses × no links → explicit pill renders
  const statusCases: [EmailStatus, string, string][] = [
    ['pending',     'Pending',     'warning'],
    ['followed_up', 'Followed up', 'info'],
    ['done',        'Done',        'success'],
    ['dismissed',   'Dismissed',   'muted'],
  ];
  it.each(statusCases)('state=%s with no links → %s/%s', (s, label, tone) => {
    const pill = composeEmailStatusPill(stateRow(s));
    expect(pill).toEqual({ label, tone });
  });

  // Linked > explicit status — task link wins over every explicit status
  it.each(statusCases)('hasTaskLink wins over state=%s', (s) => {
    const pill = composeEmailStatusPill(stateRow(s), { hasTaskLink: true });
    expect(pill).toEqual({ label: 'Linked to task', tone: 'info' });
  });

  // Linked > explicit status — follow_up link wins over every explicit status
  it.each(statusCases)('hasFollowUpLink wins over state=%s', (s) => {
    const pill = composeEmailStatusPill(stateRow(s), { hasFollowUpLink: true });
    expect(pill).toEqual({ label: 'Linked to follow-up', tone: 'purple' });
  });

  // Edge: both links present — task wins (priority 1 in docs)
  it('task link wins over follow_up link when both present', () => {
    const pill = composeEmailStatusPill(stateRow('pending'), {
      hasTaskLink: true,
      hasFollowUpLink: true,
    });
    expect(pill).toEqual({ label: 'Linked to task', tone: 'info' });
  });

  // Edge: link without state still renders the linked pill
  it('hasTaskLink alone renders linked-to-task pill', () => {
    expect(composeEmailStatusPill(null, { hasTaskLink: true })).toEqual({
      label: 'Linked to task',
      tone: 'info',
    });
  });
  it('hasFollowUpLink alone renders linked-to-follow-up pill', () => {
    expect(composeEmailStatusPill(null, { hasFollowUpLink: true })).toEqual({
      label: 'Linked to follow-up',
      tone: 'purple',
    });
  });

  // Edge: explicit false flags are equivalent to no links
  it('explicit false link flags fall through to explicit state', () => {
    const pill = composeEmailStatusPill(stateRow('done'), {
      hasTaskLink: false,
      hasFollowUpLink: false,
    });
    expect(pill).toEqual({ label: 'Done', tone: 'success' });
  });
});

// ---------------------------------------------------------------------
// availableEmailActions — clear is conditional on existing state
// ---------------------------------------------------------------------

describe('availableEmailActions', () => {
  it('omits clear when no state row exists', () => {
    expect(availableEmailActions(null)).toEqual([
      'mark_pending',
      'mark_followed_up',
      'mark_done',
      'mark_dismissed',
    ]);
    expect(availableEmailActions(undefined)).toEqual([
      'mark_pending',
      'mark_followed_up',
      'mark_done',
      'mark_dismissed',
    ]);
  });

  it('includes clear when a state row exists', () => {
    const actions = availableEmailActions(stateRow('pending'));
    expect(actions).toContain('clear');
    expect(actions).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------
// emailActionToStatus — mapping table
// ---------------------------------------------------------------------

describe('emailActionToStatus', () => {
  it.each([
    ['mark_pending',     'pending'],
    ['mark_followed_up', 'followed_up'],
    ['mark_done',        'done'],
    ['mark_dismissed',   'dismissed'],
  ] as const)('%s → %s', (action, status) => {
    expect(emailActionToStatus(action)).toBe(status);
  });

  it('clear maps to null (delete operation, not a status change)', () => {
    expect(emailActionToStatus('clear')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// EMAIL_ACTION_LABEL — every action has a user-facing label
// ---------------------------------------------------------------------

describe('EMAIL_ACTION_LABEL', () => {
  it('every action has a non-empty label', () => {
    for (const a of [
      'mark_pending',
      'mark_followed_up',
      'mark_done',
      'mark_dismissed',
      'clear',
    ] as const) {
      expect(EMAIL_ACTION_LABEL[a]).toBeTruthy();
      expect(EMAIL_ACTION_LABEL[a].length).toBeGreaterThan(0);
    }
  });
});
