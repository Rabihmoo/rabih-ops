// gmail-list-today — returns two metadata-only arrays for the caller:
//   - important: Gmail's `is:important is:unread` (signal stays the
//     primary surface; can be older than today).
//   - today: messages received since local midnight in PROJECT_TZ,
//     excluding promotions/social/forums and explicitly muted threads.
//
// Read-only. Scope: gmail.readonly. No body, no attachments, no writes.
//
// Auth: user JWT (verify_jwt = true).
//
// Response shape:
//   {
//     connected: boolean,
//     email?: string,
//     important: GmailMessage[],   // <= 50, thread-collapsed
//     today: GmailMessage[],       // <= 50, thread-collapsed
//   }
// GmailMessage matches the existing gmail-list-important payload one-for-
// one, plus an `is_important` flag so the client can label "Important +
// Unread" rows that also fall inside today's bucket.

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessTokenFor,
  getUserIdFromJwt,
} from '../_shared/google.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { PROJECT_TZ, localMidnightUnix } from '../_shared/timezone.ts';

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
    subject,
    from_address: fromAddress,
    from_name: fromName,
    snippet: m.snippet ?? '',
    internal_date: internalDate,
    internal_date_unix: Math.floor(internalDateMs / 1000),
    html_link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
    is_unread: labels.includes('UNREAD'),
    is_important: labels.includes('IMPORTANT'),
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

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const jwt = auth.slice(7);

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
    return jsonResponse({ connected: false, important: [], today: [] });
  }

  // Build the "today" query: messages newer than local midnight in
  // PROJECT_TZ, with promo/social/forum categories and muted threads
  // explicitly excluded.
  const startUnix = localMidnightUnix(new Date(), PROJECT_TZ);
  const todayQ =
    `after:${startUnix} ` +
    `-category:promotions -category:social -category:forums -label:muted`;

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
    important,
    today,
  });
});
