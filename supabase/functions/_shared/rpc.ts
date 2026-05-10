// Tiny Supabase RPC client used by both Edge Functions. Service-role key
// is read from env at startup and never logged. Returns the parsed body or
// throws an Error with the upstream message.

type Json = unknown;

export function makeRpc(supabaseUrl: string, serviceRoleKey: string) {
  return async function rpc<T = Json>(name: string, args: Record<string, Json>): Promise<T> {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const j = JSON.parse(text);
        detail = j.message ?? j.hint ?? text;
      } catch (_e) {
        // body wasn't JSON; keep raw text
      }
      throw new Error(detail);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (_e) {
      return text as unknown as T;
    }
  };
}
