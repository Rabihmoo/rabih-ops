import { describe, expect, it } from 'vitest';
import { formatFollowUpEvent } from './follow-up-event-display';
import type {
  FollowUpEventKind,
  FollowUpEventWithActor,
  FollowUpStatus,
} from '@/types/database';

function event(
  kind: FollowUpEventKind,
  overrides: Partial<FollowUpEventWithActor> = {},
): FollowUpEventWithActor {
  return {
    id:           1,
    follow_up_id: 'fu-1',
    kind,
    from_status:  null,
    to_status:    null,
    body:         null,
    payload:      null,
    created_by:   'u-1',
    created_at:   '2026-05-15T12:00:00Z',
    actor_name:   'Rabih',
    ...overrides,
  };
}

describe('formatFollowUpEvent — note', () => {
  it('renders body as the bottom line', () => {
    const out = formatFollowUpEvent(event('note', { body: 'Called supplier' }));
    expect(out.title).toBe('Rabih added a note');
    expect(out.body).toBe('Called supplier');
    expect(out.icon).toBe('note');
    expect(out.tone).toBe('muted');
  });

  it('trims whitespace-only body to null', () => {
    expect(formatFollowUpEvent(event('note', { body: '   ' })).body).toBeNull();
  });
});

describe('formatFollowUpEvent — status_change', () => {
  it('renders to_status as a friendly label and picks the matching tone', () => {
    const out = formatFollowUpEvent(
      event('status_change', { from_status: 'pending' as FollowUpStatus, to_status: 'working' as FollowUpStatus }),
    );
    expect(out.title).toBe('Rabih set status to Working on it');
    expect(out.tone).toBe('info');
    expect(out.icon).toBe('status');
  });

  it('warning tone for waiting / no_answer / postponed', () => {
    expect(formatFollowUpEvent(event('status_change', { to_status: 'waiting' as FollowUpStatus })).tone).toBe('warning');
    expect(formatFollowUpEvent(event('status_change', { to_status: 'no_answer' as FollowUpStatus })).tone).toBe('warning');
    expect(formatFollowUpEvent(event('status_change', { to_status: 'postponed' as FollowUpStatus })).tone).toBe('warning');
  });

  it('success tone for done, muted for cancelled', () => {
    expect(formatFollowUpEvent(event('status_change', { to_status: 'done' as FollowUpStatus })).tone).toBe('success');
    expect(formatFollowUpEvent(event('status_change', { to_status: 'cancelled' as FollowUpStatus })).tone).toBe('muted');
  });

  it('handles missing to_status defensively', () => {
    const out = formatFollowUpEvent(event('status_change', { to_status: null }));
    expect(out.title).toBe('Rabih set status to Unknown');
    expect(out.tone).toBe('muted');
  });
});

describe('formatFollowUpEvent — reminder events', () => {
  it('reminder_set carries reminder_at as the body', () => {
    const out = formatFollowUpEvent(
      event('reminder_set', { payload: { reminder_at: '2026-05-20T08:00:00Z', channels: ['in_app'] } }),
    );
    expect(out.title).toBe('Rabih set a reminder');
    expect(out.body).toBe('2026-05-20T08:00:00Z');
    expect(out.icon).toBe('reminder_on');
    expect(out.tone).toBe('info');
  });

  it('reminder_set without payload still renders title (no body)', () => {
    const out = formatFollowUpEvent(event('reminder_set'));
    expect(out.title).toBe('Rabih set a reminder');
    expect(out.body).toBeNull();
  });

  it('reminder_cleared has muted tone + no body', () => {
    const out = formatFollowUpEvent(event('reminder_cleared'));
    expect(out.title).toBe('Rabih cleared the reminder');
    expect(out.body).toBeNull();
    expect(out.tone).toBe('muted');
    expect(out.icon).toBe('reminder_off');
  });
});

describe('formatFollowUpEvent — calendar events', () => {
  it('calendar_added carries html_link as the body', () => {
    const out = formatFollowUpEvent(
      event('calendar_added', { payload: { event_id: 'evt-1', html_link: 'https://cal.example/x' } }),
    );
    expect(out.title).toBe('Rabih added to Calendar');
    expect(out.body).toBe('https://cal.example/x');
    expect(out.icon).toBe('calendar_on');
  });

  it('calendar_removed has no body', () => {
    const out = formatFollowUpEvent(event('calendar_removed'));
    expect(out.title).toBe('Rabih removed from Calendar');
    expect(out.body).toBeNull();
    expect(out.icon).toBe('calendar_off');
    expect(out.tone).toBe('muted');
  });
});

describe('formatFollowUpEvent — invitee_added', () => {
  it('renders the email in the title', () => {
    const out = formatFollowUpEvent(
      event('invitee_added', { payload: { email: 'supplier@example.com' } }),
    );
    expect(out.title).toBe('Rabih invited supplier@example.com');
    expect(out.icon).toBe('invitee');
  });

  it('falls back when email missing', () => {
    const out = formatFollowUpEvent(event('invitee_added'));
    expect(out.title).toBe('Rabih invited (unknown)');
  });
});

describe('formatFollowUpEvent — postponed / snoozed', () => {
  it('postponed shows new_due_date as body when present', () => {
    const out = formatFollowUpEvent(
      event('postponed', { payload: { new_due_date: '2026-06-01' } }),
    );
    expect(out.title).toBe('Rabih postponed it');
    expect(out.body).toBe('2026-06-01');
    expect(out.tone).toBe('warning');
  });

  it('snoozed (legacy alias) renders identically', () => {
    const out = formatFollowUpEvent(event('snoozed'));
    expect(out.title).toBe('Rabih postponed it');
    expect(out.icon).toBe('postponed');
  });
});

describe('formatFollowUpEvent — fallbacks', () => {
  it('blank actor falls back to "Someone"', () => {
    const out = formatFollowUpEvent(event('note', { actor_name: '   ' }));
    expect(out.title).toBe('Someone added a note');
  });

  it('unknown kind renders neutrally with raw kind in the title', () => {
    const out = formatFollowUpEvent(
      event('mystery_kind' as unknown as FollowUpEventKind, { body: 'something' }),
    );
    expect(out.title).toBe('Rabih — mystery_kind');
    expect(out.tone).toBe('muted');
    expect(out.icon).toBe('note');
    expect(out.body).toBe('something');
  });
});
