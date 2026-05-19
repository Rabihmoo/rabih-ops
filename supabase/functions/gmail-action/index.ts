// gmail-action — currently one verb: link a Gmail message to a task or
// follow_up. Fetches the message metadata server-side (so the frontend
// never has to ship subject/from snapshots over the wire) and snapshots
// it via rpc_email_link_create.
//
// Future verbs (V2): unread/read management would need gmail.modify scope
// (intentionally out of V1).

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import {
  getFreshGoogleAccessTokenFor,
  getUserIdFromJwt,
  isNeedsReconnectError,
} from '../_shared/google.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet: string;
  internalDate?: string;
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

function splitFrom(raw: string | null): { name: string | null; address: string | null } {
  if (!raw) return { name: null, address: null };
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/);
  if (m) {
    return { name: (m[1] ?? '').trim() || null, address: (m[2] ?? '').trim() || null };
  }
  if (raw.includes('@')) {
    return { name: null, address: raw.trim() };
  }
  return { name: raw.trim() || null, address: null };
}

interface LinkAction {
  action: 'link';
  entity_type: 'task' | 'follow_up';
  entity_id: string;
  message_id: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

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

  let body: LinkAction;
  try {
    body = (await req.json()) as LinkAction;
  } catch {
    return jsonResponse({ error: 'invalid json body' }, 400);
  }
  if (body.action !== 'link') {
    return jsonResponse({ error: `unknown action: ${(body as any).action}` }, 400);
  }
  if (!body.entity_type || !body.entity_id || !body.message_id) {
    return jsonResponse(
      { error: 'entity_type, entity_id, and message_id are required' },
      400,
    );
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
          error: 'Gmail connection expired. Reconnect in Settings.',
          needs_reconnect: true,
          service: 'gmail',
        },
        409,
      );
    }
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'token error' },
      500,
    );
  }
  if (!token.connected) {
    return jsonResponse({ error: 'gmail not connected' }, 409);
  }

  // Fetch the message metadata to snapshot.
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(body.message_id)}?` +
    new URLSearchParams({
      format: 'metadata',
      fields: 'id,threadId,snippet,internalDate,payload/headers',
    }) +
    `&metadataHeaders=${encodeURIComponent('Subject')}` +
    `&metadataHeaders=${encodeURIComponent('From')}` +
    `&metadataHeaders=${encodeURIComponent('Date')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    return jsonResponse({ error: `gmail ${res.status}: ${text}` }, 502);
  }
  const m = JSON.parse(text) as GmailMessageMeta;
  const subject = header(m.payload?.headers, 'Subject');
  const fromRaw = header(m.payload?.headers, 'From');
  const { name: fromName, address: fromAddress } = splitFrom(fromRaw);
  const internalDate = m.internalDate
    ? new Date(parseInt(m.internalDate, 10)).toISOString()
    : null;
  const html_link = `https://mail.google.com/mail/u/0/#inbox/${m.id}`;

  // Snapshot via the SECURITY DEFINER RPC, using the user's JWT so the
  // auth.uid() inside the RPC matches the caller.
  let link;
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_email_link_create`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        p_entity_type:   body.entity_type,
        p_entity_id:     body.entity_id,
        p_message_id:    m.id,
        p_thread_id:     m.threadId,
        p_subject:       subject,
        p_from_address:  fromAddress,
        p_from_name:     fromName,
        p_snippet:       m.snippet ?? null,
        p_internal_date: internalDate,
        p_html_link:     html_link,
      }),
    });
    const rpcText = await rpcRes.text();
    if (!rpcRes.ok) {
      let detail = rpcText;
      try {
        const j = JSON.parse(rpcText);
        detail = j.message ?? j.hint ?? rpcText;
      } catch (_e) {
        // body wasn't JSON
      }
      return jsonResponse({ error: detail }, 400);
    }
    link = JSON.parse(rpcText);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'rpc failed' },
      500,
    );
  }

  return jsonResponse({ success: true, link });
});
