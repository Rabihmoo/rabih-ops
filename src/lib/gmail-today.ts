// Client lib for the gmail-list-today Edge Function.
//
// Companion to `gmail.ts` (which still owns `listGmailImportant` for
// backwards compatibility). This file adds the new `listGmailToday`
// fetcher plus the pure compose helpers needed by the Dashboard and
// Inbox surfaces.
//
// The Edge Function already collapses each array by thread_id, so the
// client only needs to dedupe Today *against* Important for the
// Dashboard. The Inbox renders both sections inline and does not
// dedupe — a thread can legitimately appear in both, signaling "this
// is both Important+Unread and arrived today".

// =====================================================================
// Types
// =====================================================================

export interface GmailTodayMessage {
  id: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string;
  internal_date: string | null;
  internal_date_unix: number;
  html_link: string;
  is_unread: boolean;
  is_important: boolean;
  // Direction flags derived from Gmail labelIds, plumbed through from
  // the Edge Function. Both can be true for a self-sent message.
  // Older Edge Function deploys won't return them — types are required
  // in TS but the runtime fallback (?? false) lives at the consumer.
  is_inbox: boolean;
  is_sent: boolean;
}

export type GmailTodayMode = 'focused' | 'all' | 'sent';

export interface GmailTodayResult {
  connected: boolean;
  email?: string;
  /** Echoed by the Edge Function so the client can sanity-check
   *  the response matches the mode it asked for. */
  mode?: GmailTodayMode;
  important: GmailTodayMessage[];
  today: GmailTodayMessage[];
  error?: string;
}

// =====================================================================
// Fetch
// =====================================================================

export async function listGmailToday(
  mode: GmailTodayMode = 'focused',
): Promise<GmailTodayResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    return {
      connected: false,
      important: [],
      today: [],
      error: 'no supabase url',
    };
  }

  const { supabase } = await import('./supabase');
  const session = (await supabase.auth.getSession()).data.session;
  const jwt = session?.access_token;
  if (!jwt) {
    return {
      connected: false,
      important: [],
      today: [],
      error: 'not authenticated',
    };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/gmail-list-today`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  });
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (!res.ok) {
      return {
        connected: j.connected ?? false,
        important: [],
        today: [],
        error: typeof j.error === 'string' ? j.error : `HTTP ${res.status}`,
      };
    }
    return j as GmailTodayResult;
  } catch {
    return {
      connected: false,
      important: [],
      today: [],
      error: text || `HTTP ${res.status}`,
    };
  }
}

// =====================================================================
// Compose helpers (pure, tested)
// =====================================================================

/**
 * Dashboard "From today" card composition.
 *
 * Returns today's messages whose thread is NOT already represented in
 * the Important+Unread card. Preserves the original order of `today`.
 *
 * Why thread_id (not id): a thread that surfaced in Important via an
 * old unread message and also has a brand-new message today would
 * otherwise show twice on the dashboard for one conversation.
 */
export function dedupedTodayForDashboard(
  important: GmailTodayMessage[],
  today: GmailTodayMessage[],
): GmailTodayMessage[] {
  if (important.length === 0) return today;
  const importantThreadIds = new Set(important.map((m) => m.thread_id));
  return today.filter((m) => !importantThreadIds.has(m.thread_id));
}

/**
 * Inbox "Today's emails" filter composition.
 *
 * Two sections rendered in order: Important+Unread, then From-today.
 * The today section is NOT deduped against important — a message that
 * is both Important+Unread and from today is legitimately surfaced
 * twice (once per section), with the section header providing
 * context. Caller renders headers, this helper just returns the two
 * arrays untouched plus the count of overlapping threads.
 */
export function composeGmailInboxSections(
  important: GmailTodayMessage[],
  today: GmailTodayMessage[],
): {
  important: GmailTodayMessage[];
  today: GmailTodayMessage[];
  overlap_count: number;
} {
  const importantThreadIds = new Set(important.map((m) => m.thread_id));
  let overlap = 0;
  for (const m of today) {
    if (importantThreadIds.has(m.thread_id)) overlap += 1;
  }
  return { important, today, overlap_count: overlap };
}
