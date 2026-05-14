// gmail-list-important — returns the caller's important + unread Gmail
// messages from the last 7 days. Used by the Dashboard "Important this
// week" section.
//
// Query: `is:important is:unread newer_than:7d` (Gmail's own importance
// signal + unread + recency cap). Without the recency cap, the function
// surfaces important+unread messages of any age — which on a real
// mailbox includes things that have been unread for months. The 7-day
// cap keeps the Dashboard surface relevant to current work.
// Narrow field list — no body, no attachments, no contents.
//
// Auth: user JWT (verify_jwt = true).

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessTokenFor,
  getUserIdFromJwt,
} from '../_shared/google.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { decodeHtmlEntities } from '../_shared/html-decode.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RESULTS = 15;
const GMAIL_QUERY = 'is:important is:unread newer_than:7d';

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

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === lower) return h.value ?? null;
  }
  return null;
}

// "Name <addr@x.com>" → { name: "Name", address: "addr@x.com" }
function splitFrom(raw: string | null): { name: string | null; address: string | null } {
  if (!raw) return { name: null, address: null };
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/);
  if (m) {
    return { name: (m[1] ?? '').trim() || null, address: (m[2] ?? '').trim() || null };
  }
  // Bare address with no display name.
  if (raw.includes('@')) {
    return { name: null, address: raw.trim() };
  }
  return { name: raw.trim() || null, address: null };
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
    userId = await getUserIdFromJwt(jwt, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
        messages: [],
      },
      200,
    );
  }
  if (!token.connected) {
    return jsonResponse({ connected: false, messages: [] });
  }

  // 1. List message ids.
  const listUrl =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?' +
    new URLSearchParams({
      q: GMAIL_QUERY,
      maxResults: String(MAX_RESULTS),
    });
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const listText = await listRes.text();
  if (!listRes.ok) {
    return jsonResponse({ connected: true, error: listText, messages: [] }, 502);
  }
  const listJ = JSON.parse(listText);
  const ids: { id: string }[] = listJ.messages ?? [];
  if (ids.length === 0) {
    return jsonResponse({ connected: true, email: token.email, messages: [] });
  }

  // 2. Fetch metadata for each message (narrow fields).
  const metaFields = ['id', 'threadId', 'snippet', 'internalDate', 'labelIds'];
  const fieldsParam =
    metaFields.join(',') + ',payload/headers';
  const messages = await Promise.all(
    ids.map(async ({ id }) => {
      const url =
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?` +
        new URLSearchParams({
          format: 'metadata',
          metadataHeaders: 'Subject',
          fields: fieldsParam,
        }) +
        // Gmail wants each metadataHeaders as repeated param.
        `&metadataHeaders=${encodeURIComponent('From')}` +
        `&metadataHeaders=${encodeURIComponent('Date')}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const txt = await res.text();
      if (!res.ok) return null;
      const m = JSON.parse(txt) as GmailMessageMeta;
      const subject = header(m.payload?.headers, 'Subject');
      const fromRaw = header(m.payload?.headers, 'From');
      const { name: fromName, address: fromAddress } = splitFrom(fromRaw);
      const internalDate = m.internalDate
        ? new Date(parseInt(m.internalDate, 10)).toISOString()
        : null;
      const isUnread = (m.labelIds ?? []).includes('UNREAD');
      const html_link = `https://mail.google.com/mail/u/0/#inbox/${m.id}`;
      return {
        id: m.id,
        thread_id: m.threadId,
        // Decode Gmail's raw HTML entities (e.g. `can&#39;t`, `&lt;`)
        // server-side. Preserve null for the row's fallback labels.
        subject:      subject  != null ? decodeHtmlEntities(subject)  : null,
        from_address: fromAddress,
        from_name:    fromName != null ? decodeHtmlEntities(fromName) : null,
        snippet: decodeHtmlEntities(m.snippet ?? ''),
        internal_date: internalDate,
        html_link,
        is_unread: isUnread,
      };
    }),
  );

  return jsonResponse({
    connected: true,
    email: token.email,
    messages: messages.filter(Boolean),
  });
});
