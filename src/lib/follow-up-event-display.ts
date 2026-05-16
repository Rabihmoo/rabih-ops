// F1.2 — pure formatter for follow_up_events rows.
//
// Lives outside React so the kind-specific labels can be vitested cheaply.
// Mirrors the email-status.ts / follow-up-status.ts pattern: take a row,
// return a small descriptor object; the React component owns rendering.

import { followUpStatusLabel } from './follow-up-status';
import type { FollowUpEventWithActor } from '@/types/database';

export type FollowUpEventIcon =
  | 'note'
  | 'status'
  | 'reminder_on'
  | 'reminder_off'
  | 'calendar_on'
  | 'calendar_off'
  | 'invitee'
  | 'postponed';

export type FollowUpEventTone =
  | 'muted'
  | 'info'
  | 'success'
  | 'warning'
  | 'critical';

export interface FollowUpEventDisplay {
  icon:  FollowUpEventIcon;
  tone:  FollowUpEventTone;
  // One-line headline ("Rabih marked it Done" / "Reminder set"). The
  // actor name is included so consumers don't have to assemble it.
  title: string;
  // Optional body — present for kind=note (the note text) and for
  // reminder_set (the ISO timestamp formatted by the caller). The
  // formatter does NOT format dates; consumers do that with locale info.
  body:  string | null;
}

// Format a single event into a display descriptor. Pure. The component
// decides how to render the icon + title + body; this function only
// decides WHAT to show.
export function formatFollowUpEvent(
  ev: FollowUpEventWithActor,
): FollowUpEventDisplay {
  const actor = ev.actor_name?.trim() || 'Someone';

  switch (ev.kind) {
    case 'status_change': {
      // Trigger-written; from_status + to_status are populated.
      const to = ev.to_status ? followUpStatusLabel(ev.to_status) : 'Unknown';
      return {
        icon:  'status',
        tone:  toneForStatus(ev.to_status),
        title: `${actor} set status to ${to}`,
        body:  null,
      };
    }

    case 'note': {
      return {
        icon:  'note',
        tone:  'muted',
        title: `${actor} added a note`,
        body:  (ev.body && ev.body.trim()) || null,
      };
    }

    case 'reminder_set': {
      // payload.reminder_at carries the ISO timestamp. Consumers format
      // it; we pass it through verbatim so the helper stays locale-free.
      const at = readPayloadString(ev.payload, 'reminder_at');
      return {
        icon:  'reminder_on',
        tone:  'info',
        title: `${actor} set a reminder`,
        body:  at,
      };
    }

    case 'reminder_cleared': {
      return {
        icon:  'reminder_off',
        tone:  'muted',
        title: `${actor} cleared the reminder`,
        body:  null,
      };
    }

    case 'calendar_added': {
      return {
        icon:  'calendar_on',
        tone:  'info',
        title: `${actor} added to Calendar`,
        body:  readPayloadString(ev.payload, 'html_link'),
      };
    }

    case 'calendar_removed': {
      return {
        icon:  'calendar_off',
        tone:  'muted',
        title: `${actor} removed from Calendar`,
        body:  null,
      };
    }

    case 'invitee_added': {
      const email = readPayloadString(ev.payload, 'email') ?? '(unknown)';
      return {
        icon:  'invitee',
        tone:  'info',
        title: `${actor} invited ${email}`,
        body:  null,
      };
    }

    case 'postponed':
    case 'snoozed': {
      // Two kinds for analytics distinction (snoozed = legacy V1 alias);
      // visually identical in V1.
      const newDue = readPayloadString(ev.payload, 'new_due_date');
      return {
        icon:  'postponed',
        tone:  'warning',
        title: `${actor} postponed it`,
        body:  newDue,
      };
    }

    default: {
      // Forward-compatible default — render what we can with neutral tone.
      return {
        icon:  'note',
        tone:  'muted',
        title: `${actor} — ${String(ev.kind)}`,
        body:  ev.body ?? null,
      };
    }
  }
}

// Status→tone mapping for status_change events. Mirrors the open/closed
// semantics in follow-up-status.ts (info=in-flight, warning=blocked,
// success=closed-ok, muted=closed-noop, critical not used here).
function toneForStatus(
  status: string | null,
): FollowUpEventTone {
  switch (status) {
    case 'working':   return 'info';
    case 'waiting':   return 'warning';
    case 'no_answer': return 'warning';
    case 'done':      return 'success';
    case 'cancelled': return 'muted';
    case 'postponed': return 'warning';
    case 'pending':   return 'muted';
    default:          return 'muted';
  }
}

function readPayloadString(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!payload) return null;
  const v = payload[key];
  return typeof v === 'string' && v.trim() ? v : null;
}
