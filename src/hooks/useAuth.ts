import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UserRow } from '@/types/database';

const SESSION_KEY = ['auth', 'session'];

export function useSession() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<Session | null> => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      qc.setQueryData(SESSION_KEY, session);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return query;
}

export function useCurrentUserProfile() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ['auth', 'profile', session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async (): Promise<UserRow | null> => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session!.user.id)
        .maybeSingle<UserRow>();
      if (error) throw error;
      return data;
    },
  });
}

export async function signInWithMagicLink(email: string) {
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
