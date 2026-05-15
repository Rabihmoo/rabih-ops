import { describe, expect, it, vi } from 'vitest';
import {
  composeFollowUpFromEmail,
  createFollowUpFromEmailFlow,
  type EmailMessageSnapshot,
} from './email-create-follow-up';
import type { CreateFollowUpInput } from './follow-ups';
import type { FollowUpRow } from '@/types/database';
import type { EmailLinkSnapshot, GmailActionLinkInput } from './gmail';

const TODAY = new Date('2026-05-15T10:00:00');
const EXPECTED_DUE = '2026-05-18';

function snapshot(overrides: Partial<EmailMessageSnapshot> = {}): EmailMessageSnapshot {
  return {
    gmailMessageId: 'abc123',
    gmailThreadId:  'thr1',
    subject:        'Quote for Q3 order',
    fromAddress:    'supplier@example.com',
    fromName:       'Acme Supply',
    snippet:        'Please see attached…',
    internalDate:   '2026-05-15T09:55:00Z',
    ...overrides,
  };
}

function followUpRow(id = 'fu-1'): FollowUpRow {
  // Only fields the orchestrator actually reads (`id`) need to be
  // accurate; the rest are placeholders so the cast satisfies the
  // FollowUpRow type without dragging in every column.
  return { id } as unknown as FollowUpRow;
}

function linkSnap(): { success: boolean; link: EmailLinkSnapshot } {
  return {
    success: true,
    link: { id: 7 } as unknown as EmailLinkSnapshot,
  };
}

describe('composeFollowUpFromEmail', () => {
  it('uses the subject verbatim when present', () => {
    const out = composeFollowUpFromEmail(snapshot(), TODAY);
    expect(out.title).toBe('Quote for Q3 order');
    expect(out.category).toBe('email');
    expect(out.due_date).toBe(EXPECTED_DUE);
    expect(out.priority).toBe('normal');
    expect(out.branch).toBeNull();
    expect(out.description).toBe('Please see attached…');
    expect(out.person).toBe('Acme Supply');
    expect(out.task_id).toBeNull();
    expect(out.assigned_to).toBeNull();
  });

  it('falls back to from name when subject is missing/empty', () => {
    expect(composeFollowUpFromEmail(snapshot({ subject: null }), TODAY).title).toBe(
      'Acme Supply',
    );
    expect(composeFollowUpFromEmail(snapshot({ subject: '   ' }), TODAY).title).toBe(
      'Acme Supply',
    );
  });

  it('falls back to from address when subject and from name are missing', () => {
    const out = composeFollowUpFromEmail(
      snapshot({ subject: null, fromName: null }),
      TODAY,
    );
    expect(out.title).toBe('supplier@example.com');
  });

  it('uses (no subject) when every label-source is missing', () => {
    const out = composeFollowUpFromEmail(
      snapshot({ subject: null, fromName: null, fromAddress: null }),
      TODAY,
    );
    expect(out.title).toBe('(no subject)');
  });

  it('person falls back to from address when from name is missing', () => {
    const out = composeFollowUpFromEmail(snapshot({ fromName: null }), TODAY);
    expect(out.person).toBe('supplier@example.com');
  });

  it('person is null when both from name and address are missing', () => {
    const out = composeFollowUpFromEmail(
      snapshot({ fromName: null, fromAddress: null }),
      TODAY,
    );
    expect(out.person).toBeNull();
  });

  it('description preserves null snippet (does not coerce to empty)', () => {
    const out = composeFollowUpFromEmail(snapshot({ snippet: null }), TODAY);
    expect(out.description).toBeNull();
  });

  it('due_date crosses month boundary correctly (Jan 30 + 3 = Feb 2)', () => {
    const jan30 = new Date('2026-01-30T10:00:00');
    expect(composeFollowUpFromEmail(snapshot(), jan30).due_date).toBe('2026-02-02');
  });

  it('due_date crosses year boundary correctly (Dec 30 + 3 = Jan 2)', () => {
    const dec30 = new Date('2026-12-30T10:00:00');
    expect(composeFollowUpFromEmail(snapshot(), dec30).due_date).toBe('2027-01-02');
  });
});

describe('createFollowUpFromEmailFlow', () => {
  it('creates the follow-up, links the email, returns linked=true', async () => {
    const created: CreateFollowUpInput[] = [];
    const linked: GmailActionLinkInput[] = [];

    const result = await createFollowUpFromEmailFlow({
      message: snapshot(),
      today:   TODAY,
      deps: {
        createFollowUp: async (input) => {
          created.push(input);
          return followUpRow('fu-real');
        },
        linkEmail: async (input) => {
          linked.push(input);
          return linkSnap();
        },
      },
    });

    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('Quote for Q3 order');
    expect(created[0].category).toBe('email');
    expect(created[0].due_date).toBe(EXPECTED_DUE);

    expect(linked).toHaveLength(1);
    expect(linked[0]).toEqual({
      action:      'link',
      entity_type: 'follow_up',
      entity_id:   'fu-real',
      message_id:  'abc123',
    });

    expect(result.followUp.id).toBe('fu-real');
    expect(result.linked).toBe(true);
    expect(result.linkError).toBeUndefined();
  });

  it('propagates createFollowUp errors (no linkEmail call)', async () => {
    const linkEmail = vi.fn();
    await expect(
      createFollowUpFromEmailFlow({
        message: snapshot(),
        today:   TODAY,
        deps: {
          createFollowUp: async () => {
            throw new Error('rpc denied');
          },
          linkEmail,
        },
      }),
    ).rejects.toThrow('rpc denied');
    expect(linkEmail).not.toHaveBeenCalled();
  });

  it('returns linked=false + linkError when linkEmail throws', async () => {
    const result = await createFollowUpFromEmailFlow({
      message: snapshot(),
      today:   TODAY,
      deps: {
        createFollowUp: async () => followUpRow('fu-after-link-fail'),
        linkEmail: async () => {
          throw new Error('edge function 500');
        },
      },
    });

    expect(result.followUp.id).toBe('fu-after-link-fail');
    expect(result.linked).toBe(false);
    expect(result.linkError).toBeInstanceOf(Error);
    expect(result.linkError?.message).toBe('edge function 500');
  });

  it('passes the returned follow-up id through to linkEmail (not an assumed value)', async () => {
    const linked: GmailActionLinkInput[] = [];
    await createFollowUpFromEmailFlow({
      message: snapshot(),
      today:   TODAY,
      deps: {
        createFollowUp: async () => followUpRow('different-uuid-from-default'),
        linkEmail: async (input) => {
          linked.push(input);
          return linkSnap();
        },
      },
    });
    expect(linked[0].entity_id).toBe('different-uuid-from-default');
  });

  it('orders the operations: createFollowUp must complete before linkEmail starts', async () => {
    const order: string[] = [];
    let resolveCreate: (row: FollowUpRow) => void = () => {};
    const createPending = new Promise<FollowUpRow>((res) => {
      resolveCreate = res;
    });

    const flow = createFollowUpFromEmailFlow({
      message: snapshot(),
      today:   TODAY,
      deps: {
        createFollowUp: async () => {
          order.push('create-start');
          const row = await createPending;
          order.push('create-end');
          return row;
        },
        linkEmail: async () => {
          order.push('link-start');
          return linkSnap();
        },
      },
    });

    // Yield once so the createFollowUp callback actually enters.
    await Promise.resolve();
    expect(order).toEqual(['create-start']);
    resolveCreate(followUpRow('fu-order'));

    await flow;
    expect(order).toEqual(['create-start', 'create-end', 'link-start']);
  });
});
