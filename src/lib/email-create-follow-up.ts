// Pure orchestration for the "Create follow-up from email" action.
// Lives outside React so the flow can be vitested deterministically
// without jsdom or testing-library — same pattern as record-relations.ts.
//
// Two pieces:
//   composeFollowUpFromEmail(message, today)
//     Given an email snapshot + a reference date, returns the
//     CreateFollowUpInput shape to pass to rpc_create_follow_up.
//
//   createFollowUpFromEmailFlow({ message, today, deps })
//     Runs the two-step workflow: create the follow-up, then call the
//     gmail-action Edge Function to link the email to it. Returns the
//     created follow-up + whether the link succeeded. Surfaces partial
//     success so the UI can toast "created (linking failed)" instead of
//     dropping the follow-up because the link RPC threw.

import type { CreateFollowUpInput } from './follow-ups';
import type { FollowUpRow } from '@/types/database';
import type { EmailLinkSnapshot, GmailActionLinkInput } from './gmail';

export interface EmailMessageSnapshot {
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string | null;
  fromAddress: string | null;
  fromName: string | null;
  snippet: string | null;
  internalDate: string | null;
}

// Pad helper so date math doesn't depend on locale.
function toYyyyMmDdLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function composeFollowUpFromEmail(
  message: EmailMessageSnapshot,
  today: Date = new Date(),
): CreateFollowUpInput {
  // Title cascade: subject → from name → from address → '(no subject)'.
  // Verbatim per operator choice (no "Follow up: " prefix).
  const title =
    (message.subject && message.subject.trim()) ||
    (message.fromName && message.fromName.trim()) ||
    (message.fromAddress && message.fromAddress.trim()) ||
    '(no subject)';

  // Local-time today + 3 days. follow_ups.due_date is a DATE column, no
  // timezone — keep the math in local so the operator's "today + 3"
  // matches what they see on the FollowUpForm date picker.
  const due = new Date(today);
  due.setDate(due.getDate() + 3);

  return {
    category:    'email',
    title,
    due_date:    toYyyyMmDdLocal(due),
    branch:      null,
    priority:    'normal',
    description: message.snippet ?? null,
    person:      message.fromName ?? message.fromAddress ?? null,
    assigned_to: null,
    task_id:     null,
  };
}

export interface CreateFollowUpFromEmailDeps {
  createFollowUp: (input: CreateFollowUpInput) => Promise<FollowUpRow>;
  linkEmail: (input: GmailActionLinkInput) => Promise<{
    success: boolean;
    link: EmailLinkSnapshot;
  }>;
}

export interface CreateFollowUpFromEmailResult {
  followUp: FollowUpRow;
  linked: boolean;
  linkError?: Error;
}

export async function createFollowUpFromEmailFlow(args: {
  message: EmailMessageSnapshot;
  today?: Date;
  deps: CreateFollowUpFromEmailDeps;
}): Promise<CreateFollowUpFromEmailResult> {
  const { message, today, deps } = args;

  // Step 1 — the follow-up row. Errors here propagate to the caller
  // so the UI can surface "Could not create follow-up".
  const input = composeFollowUpFromEmail(message, today);
  const followUp = await deps.createFollowUp(input);

  // Step 2 — link the email. The follow-up already exists at this
  // point; a link failure is reported alongside the follow-up rather
  // than thrown, so the operator can retry the link from the email row
  // or from the follow-up detail without losing work.
  try {
    await deps.linkEmail({
      action:      'link',
      entity_type: 'follow_up',
      entity_id:   followUp.id,
      message_id:  message.gmailMessageId,
    });
    return { followUp, linked: true };
  } catch (err) {
    return {
      followUp,
      linked: false,
      linkError: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
