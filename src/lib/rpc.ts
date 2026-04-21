import { supabase } from './supabase';

export async function callRpc<T = unknown>(name: string, args: Record<string, unknown> = {}) {
  // Generic RPC helper; typed RPCs will be added when Supabase types are generated.
  const { data, error } = await (supabase.rpc as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: T; error: Error | null }>)(name, args);
  if (error) throw error;
  return data;
}
