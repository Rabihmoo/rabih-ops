// gmail-list-today — returns two metadata-only arrays for the caller:
//   - important: Gmail's `is:important is:unread` (signal stays the
//     primary surface; can be older than today).
//   - today: messages received since local midnight in PROJECT_TZ.
//
// The today query has three modes selectable by the caller:
//   - 'focused' (default): in:inbox + excludes promotions / social /
//     forums / muted — the operational incoming view.
//   - 'all': in:inbox, drops the `-category:promotions` exclusion.
//     Still excludes social / forums / muted (these are noise classes
//     the operator never asked to see). Lets marketing emails through,
//     matching Gmail's own INBOX-Primary tab roughly.
//   - 'sent': in:sent for messages sent today. Lets the operator see
//     what they fired off without leaving the dashboard.
//
// Mode comes from the request body:
//   POST /functions/v1/gmail-list-today
//   body: { "mode": "focused" | "all" | "sent" }  -- optional, default 'focused'
//
// Read-only. Scope: gmail.readonly. No body, no attachments, no writes.
//
// Auth: user JWT (verify_jwt = true).
//
// Response shape:
//   {
//     connected: boolean,
//     email?: string,
//     mode: 'focused' | 'all',     // echoed back for frontend cache key sanity
//     important: GmailMessage[],   // <= 50, thread-collapsed
//     today: GmailMessage[],       // <= 50, thread-collapsed
//   }
// GmailMessage matches the existing gmail-list-important payload one-for-
// one, plus an `is_important` flag. Subject / from_name / snippet are
// HTML-entity-decoded server-side (see _shared/html-decode.ts).

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessTokenFor,
  getUserIdFromJwt,
  isNeedsReconnectError,
} from '../_shared/google.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { PROJECT_TZ, localMidnightUnix } from '../_shared/timezone.ts';
import { decodeHtmlEntities } from '../_shared/html-decode.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RESULTS = 50;
const IMPORTANT_Q = 'is:important is:unread';
// Today query is built per-request with the caller's local-midnight unix.

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
}

interface NormalizedMessage {
  id: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  snippet: string;
  internal_date: string | null;
  internal_date_unix: number; // seconds; 0 if missing — used only for sorting
  html_link: string;
  is_unread: boolean;
  is_important: boolean;
  // Direction flags derived from labelIds. A self-sent email can carry
  // both INBOX and SENT — both flags fire in that case so the row can
  // badge whichever the active view demands.
  is_inbox: boolean;
  is_sent: boolean;
}

function header(
  headers: GmailHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === lower) return h.value ?? null;
  }
  return null;
}

// "Name <addr@x.com>" → { name: "Name", address: "addr@x.com" }
function splitFrom(
  raw: string | null,
): { name: string | null; address: string | null } {
  if (!raw) return { name: null, address: null };
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/);
  if (m) {
    return {
      name: (m[1] ?? '').trim() || null,
      address: (m[2] ?? '').trim() || null,
    };
  }
  if (raw.includes('@')) {
    return { name: null, address: raw.trim() };
  }
  return { name: raw.trim() || null, address: null };
}

function buildMetadataUrl(id: string): string {
  // Three repeated metadataHeaders params (URLSearchParams doesn't repeat).
  const base =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?` +
    new URLSearchParams({
      format: 'metadata',
      fields: 'id,threadId,snippet,internalDate,labelIds,payload/headers',
    });
  return (
    base +
    `&metadataHeaders=${encodeURIComponent('Subject')}` +
    `&metadataHeaders=${encodeURIComponent('From')}` +
    `&metadataHeaders=${encodeURIComponent('Date')}`
  );
}

async function fetchMessage(
  id: string,
  accessToken: string,
): Promise<NormalizedMessage | null> {
  const res = await fetch(buildMetadataUrl(id), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const m = (await res.json()) as GmailMessageMeta;
  const subject = header(m.payload?.headers, 'Subject');
  const fromRaw = header(m.payload?.headers, 'From');
  const { name: fromName, address: fromAddress } = splitFrom(fromRaw);
  const internalDateMs = m.internalDate ? parseInt(m.internalDate, 10) : 0;
  const internalDate =
    internalDateMs > 0 ? new Date(internalDateMs).toISOString() : null;
  const labels = m.labelIds ?? [];
  return {
    id: m.id,
    thread_id: m.threadId,
    // Decode Gmail's raw HTML entities (e.g. `can&#39;t`, `&lt;tag&gt;`)
    // server-side so every consumer sees clean text. Preserve null
    // so the row's "(no subject)" / "Unknown sender" fallbacks still
    // trigger when the header was absent.
    subject:      subject  != null ? decodeHtmlEntities(subject)  : null,
    from_address: fromAddress,
    from_name:    fromName != null ? decodeHtmlEntities(fromName) : null,
    snippet: decodeHtmlEntities(m.snippet ?? ''),
    internal_date: internalDate,
    internal_date_unix: Math.floor(internalDateMs / 1000),
    html_link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
    is_unread: labels.includes('UNREAD'),
    is_important: labels.includes('IMPORTANT'),
    is_inbox: labels.includes('INBOX'),
    is_sent: labels.includes('SENT'),
  };
}

// Keep the latest message per threadId (by internalDate desc). Stable
// against the original order — preserves rank for messages on different
// threads.
function collapseByThread(
  messages: NormalizedMessage[],
): NormalizedMessage[] {
  const sorted = [...messages].sort(
    (a, b) => b.internal_date_unix - a.internal_date_unix,
  );
  const seen = new Set<string>();
  const out: NormalizedMessage[] = [];
  for (const m of sorted) {
    if (seen.has(m.thread_id)) continue;
    seen.add(m.thread_id);
    out.push(m);
  }
  return out;
}

async function listAndFetch(
  q: string,
  accessToken: string,
): Promise<NormalizedMessage[]> {
  const listUrl =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?' +
    new URLSearchParams({ q, maxResults: String(MAX_RESULTS) });
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const txt = await listRes.text();
    throw new Error(`gmail.list ${listRes.status}: ${txt}`);
  }
  const listJ = await listRes.json();
  const ids: { id: string }[] = listJ.messages ?? [];
  if (ids.length === 0) return [];
  const fetched = await Promise.all(
    ids.map(({ id }) => fetchMessage(id, accessToken)),
  );
  return collapseByThread(
    fetched.filter((m): m is NormalizedMessage => m !== null),
  );
}

type Mode = 'focused' | 'all' | 'sent';

async function readMode(req: Request): Promise<Mode> {
  // Tolerant body parsing. The lib sends `{mode}` for new callers;
  // legacy callers send no body at all (or a stale empty body). On
  // any parse failure, fall back to the default — preserves V1
  // behaviour for in-flight clients. Unknown modes also fall back so
  // a typo doesn't surprise the operator with a 400.
  try {
    const text = await req.text();
    if (!text) return 'focused';
    const j = JSON.parse(text);
    if (j?.mode === 'all') return 'all';
    if (j?.mode === 'sent') return 'sent';
    return 'focused';
  } catch {
    return 'focused';
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const jwt = auth.slice(7);
  const mode: Mode = await readMode(req);

  let userId: string;
  try {
    userId = await getUserIdFromJwt(
      jwt,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
  } catch {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let token;
  try {
    token = await getFreshGoogleAccessTokenFor(
      'gmail',
      rpc,
      userId,
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
    );
  } catch (err) {
    if (isNeedsReconnectError(err)) {
      return jsonResponse(
        {
          connected: false,
          needs_reconnect: true,
          service: 'gmail',
          email: err.email,
          mode,
          important: [],
          today: [],
        },
        200,
      );
    }
    return jsonResponse(
      {
        connected: false,
        error: err instanceof Error ? err.message : 'token error',
        important: [],
        today: [],
      },
      200,
    );
  }
  if (!token.connected) {
    return jsonResponse({ connected: false, mode, important: [], today: [] });
  }

  // Build the "today" query. Anchors on local midnight in PROJECT_TZ.
  // Three modes:
  //   - focused: in:inbox, drop promotions/social/forums/muted
  //   - all:     in:inbox, drop social/forums/muted (keep promos)
  //   - sent:    in:sent only, no category filters (promos in Sent
  //              are vanishingly rare and the operator explicitly
  //              opted into "what did I send today")
  //
  // Pre-fix: `after:` alone matched messages by internalDate across
  // EVERY label, which silently surfaced self-sent items in the
  // Focused / All views. The explicit in:inbox / in:sent scoping
  // closes that hole.
  const startUnix = localMidnightUnix(new Date(), PROJECT_TZ);
  let todayQ: string;
  if (mode === 'sent') {
    todayQ = `in:sent after:${startUnix}`;
  } else if (mode === 'all') {
    todayQ =
      `in:inbox after:${startUnix} ` +
      `-category:social -category:forums -label:muted`;
  } else {
    todayQ =
      `in:inbox after:${startUnix} ` +
      `-category:promotions -category:social -category:forums -label:muted`;
  }

  let important: NormalizedMessage[] = [];
  let today: NormalizedMessage[] = [];
  try {
    [important, today] = await Promise.all([
      listAndFetch(IMPORTANT_Q, token.accessToken!),
      listAndFetch(todayQ, token.accessToken!),
    ]);
  } catch (err) {
    return jsonResponse(
      {
        connected: true,
        email: token.email,
        mode,
        error: err instanceof Error ? err.message : 'gmail error',
        important: [],
        today: [],
      },
      502,
    );
  }

  return jsonResponse({
    connected: true,
    email: token.email,
    mode,
    important,
    today,
  });
});
