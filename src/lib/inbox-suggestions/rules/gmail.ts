// Phase G2.2 — Gmail suggestion rules.
//
// Six pure SuggestionRule functions. They run only on items where
// source === 'gmail'. All matching is deterministic; no AI, no network.

import type { ActivityItem } from '../../activity-inbox';
import { similarityScore, withBranchBoost } from '../similarity';
import type { Suggestion, SuggestionRule } from '../types';

// =========================================================
// Keyword catalogs
// =========================================================
// Word-boundary matched, case-insensitive. Multi-word entries are matched
// allowing variable whitespace ("food  poisoning" still hits).

const PURCHASE_KEYWORDS = [
  'invoice',
  'quote',
  'estimate',
  'po',
  'order',
  'delivery',
  'payment',
];

const COMPLAINT_KEYWORDS = [
  'complaint',
  'broken',
  'leak',
  'spoiled',
  'sick',
  'food poisoning',
];

const URGENT_KEYWORDS = ['urgent', 'asap', 'immediately', 'critical'];

// Common corporate suffixes that we strip from supplier names before
// comparing against the sender's email domain.
const CORP_SUFFIXES = /\b(ltd|inc|llc|co|company|corp|corporation|gmbh|sarl|lda|sa|ag|bv)\b/g;

// =========================================================
// Helpers
// =========================================================

function combinedText(item: ActivityItem): string {
  return [item.title ?? '', item.summary ?? ''].join(' ');
}

function cleanSubject(rawTitle: string): string {
  return rawTitle.replace(/^\s*(re|fwd|fw)\s*:\s*/gi, '').trim();
}

function findKeyword(haystack: string, list: string[]): string | null {
  const lc = haystack.toLowerCase();
  for (const kw of list) {
    // Multi-word: tolerate runs of whitespace between words.
    const pattern = kw.replace(/\s+/g, '\\s+');
    const re = new RegExp(`\\b${pattern}\\b`, 'i');
    if (re.test(lc)) return kw;
  }
  return null;
}

function emailDomainFirstLabel(meta: Record<string, unknown>): string | null {
  const addr =
    typeof meta.from_address === 'string' ? meta.from_address.trim() : null;
  if (!addr) return null;
  const m = addr.match(/@([^>\s]+)/);
  if (!m) return null;
  const host = m[1].toLowerCase();
  return host.split('.')[0] ?? null;
}

function supplierSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(CORP_SUFFIXES, '')
    .replace(/[^a-z0-9]+/g, '');
}

function senderSlug(meta: Record<string, unknown>): string {
  const name =
    typeof meta.from_name === 'string' ? meta.from_name.toLowerCase() : '';
  return name.replace(/[^a-z0-9]+/g, '');
}

// =========================================================
// Date parsing — deterministic, English-only V1
// =========================================================

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validCalendarDate(dd: number, mm: number, yyyy: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
}

function isoFromYmd(yyyy: number, mm: number, dd: number): string {
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

export interface ParsedDatePhrase {
  iso: string; // yyyy-mm-dd
  phrase: string; // verbatim source phrase (lowercased)
}

/**
 * Returns the first parseable date phrase in `text`, or null.
 * Order of preference: ISO -> dd/mm/yyyy -> dd/mm -> today/tomorrow -> day-of-week.
 */
export function parseDatePhrase(
  text: string,
  now: Date,
): ParsedDatePhrase | null {
  const lc = text.toLowerCase();

  // ISO yyyy-mm-dd
  let m = lc.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const yyyy = +m[1];
    const mm = +m[2];
    const dd = +m[3];
    if (validCalendarDate(dd, mm, yyyy)) {
      return { iso: isoFromYmd(yyyy, mm, dd), phrase: m[0] };
    }
  }

  // dd/mm/yyyy or dd-mm-yyyy
  m = lc.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (m) {
    const dd = +m[1];
    const mm = +m[2];
    const yyyy = +m[3];
    if (validCalendarDate(dd, mm, yyyy)) {
      return { iso: isoFromYmd(yyyy, mm, dd), phrase: m[0] };
    }
  }

  // dd/mm or dd-mm (not part of a longer dd/mm/yyyy, asserted via negative lookahead)
  m = lc.match(/\b(\d{1,2})[\/\-](\d{1,2})\b(?![\/\-]\d)/);
  if (m) {
    const dd = +m[1];
    const mm = +m[2];
    let yyyy = now.getUTCFullYear();
    if (validCalendarDate(dd, mm, yyyy)) {
      let candidate = Date.UTC(yyyy, mm - 1, dd);
      // If candidate is more than 30 days in the past, assume next year.
      if (candidate - now.getTime() < -30 * 86400000) {
        yyyy += 1;
        candidate = Date.UTC(yyyy, mm - 1, dd);
      }
      return { iso: isoFromYmd(yyyy, mm, dd), phrase: m[0] };
    }
  }

  // today / tomorrow (UTC date arithmetic — frontend converts as needed).
  if (/\btomorrow\b/.test(lc)) {
    const d = new Date(now.getTime() + 86400000);
    return {
      iso: isoFromYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      phrase: 'tomorrow',
    };
  }
  if (/\btoday\b/.test(lc)) {
    return {
      iso: isoFromYmd(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()),
      phrase: 'today',
    };
  }

  // day of week (next occurrence; same-day if today is that day)
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(${DAY_NAMES[i]}|${DAY_ABBR[i]})\\b`, 'i');
    if (re.test(lc)) {
      const today = now.getUTCDay();
      let offset = i - today;
      if (offset < 0) offset += 7;
      const d = new Date(now.getTime() + offset * 86400000);
      return {
        iso: isoFromYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
        phrase: DAY_NAMES[i],
      };
    }
  }

  return null;
}

// =========================================================
// Rule 1 — gmail-invoice-from-supplier
// =========================================================
// Both signals required to keep false positives low:
//   * subject/snippet has a purchase keyword
//   * sender email domain or display name slug contains a known supplier slug

export const gmailInvoiceFromSupplier: SuggestionRule = (item, ctx) => {
  if (item.source !== 'gmail') return [];
  const keyword = findKeyword(combinedText(item), PURCHASE_KEYWORDS);
  if (!keyword) return [];

  const domainLabel = emailDomainFirstLabel(item.meta);
  const fromSlug = senderSlug(item.meta);

  // Build supplier index from context. We use the metadata.supplier_name
  // on each purchase row; we also remember a representative branch so
  // we can pre-fill it.
  const suppliers = new Map<
    string,
    { name: string; slug: string; branch: string | null }
  >();
  for (const p of ctx.bySource.purchase) {
    const name =
      typeof p.meta.supplier_name === 'string' ? p.meta.supplier_name : null;
    if (!name) continue;
    const slug = supplierSlug(name);
    if (slug.length < 3) continue;
    if (!suppliers.has(slug)) {
      suppliers.set(slug, { name, slug, branch: p.branch });
    }
  }

  const matched: Array<{ name: string; slug: string; branch: string | null }> = [];
  for (const s of suppliers.values()) {
    const domainHit = domainLabel ? domainLabel.includes(s.slug) : false;
    const fromHit = fromSlug ? fromSlug.includes(s.slug) : false;
    if (domainHit || fromHit) matched.push(s);
  }
  if (matched.length === 0) return [];

  const subject = cleanSubject(item.title);
  return matched.map<Suggestion>((s) => ({
    id: `${item.id}:gmail-invoice-from-supplier:${s.slug}`,
    rule: 'gmail-invoice-from-supplier',
    action: 'create_purchase_request',
    label: `Create purchase request for ${s.name}`,
    reason: `Sender ${
      domainLabel ? `domain "${domainLabel}"` : 'name'
    } matches supplier "${s.name}" and subject mentions "${keyword}".`,
    score: 0.9,
    prefill: {
      title: subject,
      supplier_name: s.name,
      branch: s.branch,
      description: item.summary ?? undefined,
    },
  }));
};

// =========================================================
// Rule 2 — gmail-similar-to-task
// =========================================================

export const gmailSimilarToTask: SuggestionRule = (item, ctx) => {
  if (item.source !== 'gmail') return [];
  const subject = cleanSubject(item.title);
  if (!subject) return [];

  const out: Suggestion[] = [];
  for (const task of ctx.bySource.task) {
    const raw = similarityScore(subject, task.title);
    if (raw < 0.5) continue;
    const score = withBranchBoost(raw, item.branch, task.branch);
    out.push({
      id: `${item.id}:gmail-similar-to-task:${task.native_id}`,
      rule: 'gmail-similar-to-task',
      action: 'link_to_existing',
      label: `Link to task: ${task.title}`,
      reason: `Subject has similar wording to open task "${task.title}" (${Math.round(score * 100)}% match).`,
      score,
      target: {
        source: 'task',
        native_id: task.native_id,
        title: task.title,
      },
    });
  }
  return out;
};

// =========================================================
// Rule 3 — gmail-similar-to-followup
// =========================================================

export const gmailSimilarToFollowUp: SuggestionRule = (item, ctx) => {
  if (item.source !== 'gmail') return [];
  const subject = cleanSubject(item.title);
  if (!subject) return [];

  const out: Suggestion[] = [];
  for (const fu of ctx.bySource.follow_up) {
    const raw = similarityScore(subject, fu.title);
    if (raw < 0.5) continue;
    const score = withBranchBoost(raw, item.branch, fu.branch);
    out.push({
      id: `${item.id}:gmail-similar-to-followup:${fu.native_id}`,
      rule: 'gmail-similar-to-followup',
      action: 'link_to_existing',
      label: `Link to follow-up: ${fu.title}`,
      reason: `Subject has similar wording to open follow-up "${fu.title}" (${Math.round(score * 100)}% match).`,
      score,
      target: {
        source: 'follow_up',
        native_id: fu.native_id,
        title: fu.title,
      },
    });
  }
  return out;
};

// =========================================================
// Rule 4 — gmail-date-mentioned
// =========================================================

export const gmailDateMentioned: SuggestionRule = (item, ctx) => {
  if (item.source !== 'gmail') return [];
  const parsed = parseDatePhrase(combinedText(item), ctx.now);
  if (!parsed) return [];

  const subject = cleanSubject(item.title);
  return [
    {
      id: `${item.id}:gmail-date-mentioned`,
      rule: 'gmail-date-mentioned',
      action: 'create_follow_up',
      label: `Create follow-up due ${parsed.iso}`,
      reason: `Email mentions "${parsed.phrase}" — parsed as ${parsed.iso}.`,
      score: 0.7,
      prefill: {
        title: subject,
        due_date: parsed.iso,
        description: item.summary ?? undefined,
      },
    },
  ];
};

// =========================================================
// Rule 5 — gmail-complaint
// =========================================================

export const gmailComplaint: SuggestionRule = (item) => {
  if (item.source !== 'gmail') return [];
  const keyword = findKeyword(combinedText(item), COMPLAINT_KEYWORDS);
  if (!keyword) return [];

  const subject = cleanSubject(item.title);
  return [
    {
      id: `${item.id}:gmail-complaint`,
      rule: 'gmail-complaint',
      action: 'create_task',
      label: 'Create urgent task',
      reason: `Email mentions "${keyword}" — log a task to follow up on the issue.`,
      score: 0.7,
      prefill: {
        title: subject,
        priority: 'urgent',
        description: item.summary ?? undefined,
      },
    },
  ];
};

// =========================================================
// Rule 6 — gmail-urgent
// =========================================================

export const gmailUrgent: SuggestionRule = (item) => {
  if (item.source !== 'gmail') return [];
  const keyword = findKeyword(combinedText(item), URGENT_KEYWORDS);
  if (!keyword) return [];

  const subject = cleanSubject(item.title);
  return [
    {
      id: `${item.id}:gmail-urgent`,
      rule: 'gmail-urgent',
      action: 'create_task',
      label: 'Create urgent task',
      reason: `Email flags itself as "${keyword}".`,
      score: 0.6,
      prefill: {
        title: subject,
        priority: 'urgent',
        description: item.summary ?? undefined,
      },
    },
  ];
};

// =========================================================
// Bundle for easy import by the orchestrator.
// =========================================================

export const GMAIL_RULES: SuggestionRule[] = [
  gmailInvoiceFromSupplier,
  gmailSimilarToTask,
  gmailSimilarToFollowUp,
  gmailDateMentioned,
  gmailComplaint,
  gmailUrgent,
];

// Exposed for tests — not part of the public API.
export const __GMAIL_INTERNALS__ = {
  PURCHASE_KEYWORDS,
  COMPLAINT_KEYWORDS,
  URGENT_KEYWORDS,
  supplierSlug,
  emailDomainFirstLabel,
  findKeyword,
};
