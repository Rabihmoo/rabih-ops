// Shared CORS helper for browser-facing Edge Functions.
// Functions called server-to-server (Telegram webhook, pg_cron tick) don't
// need this — only the ones called from the RabihOS frontend.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}

export function withCors(res: Response): Response {
  // Copy existing headers and add CORS to a fresh Response.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function jsonResponse(
  body: unknown,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function textResponse(
  body: string,
  status: number = 200,
): Response {
  return new Response(body, { status, headers: CORS_HEADERS });
}
