import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  gmailComplaint,
  gmailDateMentioned,
  gmailInvoiceFromSupplier,
  gmailSimilarToFollowUp,
  gmailSimilarToTask,
  gmailUrgent,
  parseDatePhrase,
} from './gmail';
import { buildSuggestionContext } from '../types';
import type { ActivityItem } from '../../activity-inbox';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const NOW = new Date('2026-05-11T09:00:00Z'); // Monday

function fakeItem(
  partial: Partial<ActivityItem> &
    Pick<ActivityItem, 'source' | 'native_id'>,
): ActivityItem {
  return {
    id: `${partial.source}:${partial.native_id}`,
    title: partial.title ?? 'untitled',
    summary: partial.summary ?? null,
    branch: partial.branch ?? null,
    entity_url: partial.entity_url ?? '/',
    occurred_at: partial.occurred_at ?? '2026-05-11T08:00:00Z',
    due_at: partial.due_at ?? null,
    severity: partial.severity ?? 'info',
    is_unread: partial.is_unread ?? false,
    is_blocked: partial.is_blocked ?? false,
    meta: partial.meta ?? {},
    ...partial,
  };
}

function ctxOf(items: ActivityItem[]) {
  return buildSuggestionContext(items, NOW);
}

// =====================================================================
// gmail-invoice-from-supplier
// =====================================================================

describe('gmail-invoice-from-supplier', () => {
  const supplier = fakeItem({
    source: 'purchase',
    native_id: 'p1',
    title: 'PR for Acme Foods order',
    branch: 'salt',
    meta: { supplier_name: 'Acme Foods Ltd' },
  });

  it('fires when sender domain matches a known supplier slug AND subject mentions a purchase keyword', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Invoice 2034 attached',
      summary: 'Please find the invoice for last week.',
      meta: { from_address: 'billing@acmefoods.com', from_name: 'Acme Foods Billing' },
    });
    const ctx = ctxOf([email, supplier]);
    const out = gmailInvoiceFromSupplier(email, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_purchase_request');
    expect(out[0].score).toBe(0.9);
    expect(out[0].reason).toContain('Acme Foods');
    expect(out[0].reason).toContain('invoice');
    expect(out[0].prefill?.supplier_name).toBe('Acme Foods Ltd');
    expect(out[0].prefill?.branch).toBe('salt');
  });

  it('fires when sender display name matches the supplier even with a generic domain', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g2',
      title: 'Quote request',
      meta: { from_address: 'someone@gmail.com', from_name: 'Acme Foods Sales' },
    });
    const ctx = ctxOf([email, supplier]);
    expect(gmailInvoiceFromSupplier(email, ctx)).toHaveLength(1);
  });

  it('does NOT fire when only the keyword matches (no supplier match) — keeps false positives low', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g3',
      title: 'Invoice 9000',
      meta: { from_address: 'spam@unknown.example', from_name: 'Random' },
    });
    const ctx = ctxOf([email, supplier]);
    expect(gmailInvoiceFromSupplier(email, ctx)).toEqual([]);
  });

  it('does NOT fire when supplier matches but no purchase keyword is present', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g4',
      title: 'Greetings from Acme Foods',
      meta: { from_address: 'noreply@acmefoods.com', from_name: 'Acme Foods' },
    });
    const ctx = ctxOf([email, supplier]);
    expect(gmailInvoiceFromSupplier(email, ctx)).toEqual([]);
  });

  it('does NOT fire when there are no purchase rows in context (no suppliers known)', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g5',
      title: 'Invoice 2034',
      meta: { from_address: 'billing@acmefoods.com', from_name: 'Acme Foods' },
    });
    const ctx = ctxOf([email]);
    expect(gmailInvoiceFromSupplier(email, ctx)).toEqual([]);
  });

  it('ignores non-Gmail items even if everything else lines up', () => {
    const item = fakeItem({
      source: 'task',
      native_id: 't1',
      title: 'Invoice from Acme Foods',
    });
    expect(gmailInvoiceFromSupplier(item, ctxOf([item, supplier]))).toEqual([]);
  });
});

// =====================================================================
// gmail-similar-to-task
// =====================================================================

describe('gmail-similar-to-task', () => {
  const task = fakeItem({
    source: 'task',
    native_id: 't1',
    title: 'Renew gas cylinder contract',
    branch: 'salt',
  });

  it('fires when subject is similar to an open task', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Re: Renew gas cylinder contract for next month',
    });
    const ctx = ctxOf([email, task]);
    const out = gmailSimilarToTask(email, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('link_to_existing');
    expect(out[0].target?.source).toBe('task');
    expect(out[0].target?.native_id).toBe('t1');
    expect(out[0].reason).toContain('similar wording');
    expect(out[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('does NOT fire when similarity is below 0.5', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'New laptop order confirmation',
    });
    const ctx = ctxOf([email, task]);
    expect(gmailSimilarToTask(email, ctx)).toEqual([]);
  });

  it('applies branch boost when the email and the task share a branch', () => {
    // Partial overlap (3/4 = 0.75 raw) so the +0.1 branch boost is visible
    // and not clamped away by the 1.0 ceiling.
    const partialTask = fakeItem({
      source: 'task',
      native_id: 't9',
      title: 'Renew gas cylinder contract',
      branch: 'salt',
    });
    const sameBranch = fakeItem({
      source: 'gmail',
      native_id: 'g-same',
      title: 'Gas cylinder contract update for supplier',
      branch: 'salt',
    });
    const otherBranch = fakeItem({
      source: 'gmail',
      native_id: 'g-other',
      title: 'Gas cylinder contract update for supplier',
      branch: 'bbqhouse',
    });
    const s1 = gmailSimilarToTask(sameBranch,  ctxOf([sameBranch, partialTask]))[0].score;
    const s2 = gmailSimilarToTask(otherBranch, ctxOf([otherBranch, partialTask]))[0].score;
    expect(s1).toBeGreaterThan(s2);
  });

  it('returns one suggestion per matching task', () => {
    const t1 = fakeItem({ source: 'task', native_id: 't1', title: 'Cold-room freezer service appointment' });
    const t2 = fakeItem({ source: 'task', native_id: 't2', title: 'Cold-room freezer maintenance schedule' });
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Cold-room freezer service confirmation',
    });
    const out = gmailSimilarToTask(email, ctxOf([email, t1, t2]));
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.target?.native_id).sort()).toEqual(['t1', 't2']);
  });

  it('ignores non-Gmail items', () => {
    const otherTask = fakeItem({ source: 'task', native_id: 't2', title: 'Renew gas cylinder contract for salt' });
    expect(gmailSimilarToTask(task, ctxOf([task, otherTask]))).toEqual([]);
  });
});

// =====================================================================
// gmail-similar-to-followup
// =====================================================================

describe('gmail-similar-to-followup', () => {
  it('fires when subject is similar to an open follow-up', () => {
    const fu = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Call landlord about rent payment',
    });
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Re: landlord rent payment',
    });
    const out = gmailSimilarToFollowUp(email, ctxOf([email, fu]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('link_to_existing');
    expect(out[0].target?.source).toBe('follow_up');
  });

  it('does NOT fire below similarity threshold', () => {
    const fu = fakeItem({
      source: 'follow_up',
      native_id: 'f1',
      title: 'Call landlord about rent payment',
    });
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Marketing newsletter for May',
    });
    expect(gmailSimilarToFollowUp(email, ctxOf([email, fu]))).toEqual([]);
  });
});

// =====================================================================
// gmail-date-mentioned
// =====================================================================

describe('parseDatePhrase', () => {
  it('parses "tomorrow"', () => {
    expect(parseDatePhrase('please send it by tomorrow', NOW)?.iso).toBe('2026-05-12');
  });
  it('parses "today"', () => {
    expect(parseDatePhrase('we need it today', NOW)?.iso).toBe('2026-05-11');
  });
  it('parses day-of-week names', () => {
    // NOW is Monday 2026-05-11. "Friday" -> next Friday = 2026-05-15.
    expect(parseDatePhrase('let us aim for Friday', NOW)?.iso).toBe('2026-05-15');
  });
  it('parses dd/mm with current year', () => {
    expect(parseDatePhrase('delivery on 20/05', NOW)?.iso).toBe('2026-05-20');
  });
  it('rolls dd/mm to next year when more than 30 days in the past', () => {
    expect(parseDatePhrase('see you on 01/01', NOW)?.iso).toBe('2027-01-01');
  });
  it('parses dd/mm/yyyy', () => {
    expect(parseDatePhrase('signed 03/06/2026', NOW)?.iso).toBe('2026-06-03');
  });
  it('parses ISO yyyy-mm-dd', () => {
    expect(parseDatePhrase('plan for 2026-07-04', NOW)?.iso).toBe('2026-07-04');
  });
  it('returns null when no date is present', () => {
    expect(parseDatePhrase('just a quick hello', NOW)).toBeNull();
  });
  it('rejects invalid calendar dates', () => {
    expect(parseDatePhrase('see you 32/13', NOW)).toBeNull();
  });
});

describe('gmail-date-mentioned', () => {
  it('emits create_follow_up with prefilled due_date when a date is parseable', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Quote for tomorrow',
      summary: 'Please reply by tomorrow.',
    });
    const out = gmailDateMentioned(email, ctxOf([email]));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('create_follow_up');
    expect(out[0].prefill?.due_date).toBe('2026-05-12');
    expect(out[0].reason).toContain('tomorrow');
  });

  it('does NOT fire when no date phrase is present', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Hello — general inquiry',
      summary: 'How are you?',
    });
    expect(gmailDateMentioned(email, ctxOf([email]))).toEqual([]);
  });

  it('ignores non-Gmail items', () => {
    const task = fakeItem({ source: 'task', native_id: 't1', title: 'Do something tomorrow' });
    expect(gmailDateMentioned(task, ctxOf([task]))).toEqual([]);
  });
});

// =====================================================================
// gmail-complaint
// =====================================================================

describe('gmail-complaint', () => {
  it('fires on each complaint keyword', () => {
    for (const kw of ['complaint', 'broken', 'leak', 'spoiled', 'sick', 'food poisoning']) {
      const email = fakeItem({
        source: 'gmail',
        native_id: `g-${kw}`,
        title: `something ${kw} happened`,
      });
      const out = gmailComplaint(email, ctxOf([email]));
      expect(out, kw).toHaveLength(1);
      expect(out[0].action).toBe('create_task');
      expect(out[0].prefill?.priority).toBe('urgent');
      expect(out[0].reason.toLowerCase()).toContain(kw);
    }
  });

  it('does NOT fire on unrelated subjects', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Quarterly marketing summary',
    });
    expect(gmailComplaint(email, ctxOf([email]))).toEqual([]);
  });

  it('ignores non-Gmail items', () => {
    const task = fakeItem({ source: 'task', native_id: 't1', title: 'Fix broken sink' });
    expect(gmailComplaint(task, ctxOf([task]))).toEqual([]);
  });
});

// =====================================================================
// gmail-urgent
// =====================================================================

describe('gmail-urgent', () => {
  it('fires on each urgent keyword', () => {
    for (const kw of ['urgent', 'asap', 'immediately', 'critical']) {
      const email = fakeItem({
        source: 'gmail',
        native_id: `g-${kw}`,
        title: `Please reply ${kw}`,
      });
      const out = gmailUrgent(email, ctxOf([email]));
      expect(out, kw).toHaveLength(1);
      expect(out[0].action).toBe('create_task');
      expect(out[0].prefill?.priority).toBe('urgent');
      expect(out[0].score).toBe(0.6);
      expect(out[0].reason.toLowerCase()).toContain(kw);
    }
  });

  it('does NOT fire when no urgent keyword is present', () => {
    const email = fakeItem({
      source: 'gmail',
      native_id: 'g1',
      title: 'Weekly delivery schedule',
    });
    expect(gmailUrgent(email, ctxOf([email]))).toEqual([]);
  });
});
