import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/rpc';
import { useAuthStore } from '@/stores/authStore';
import type { UserRow } from '@/types/database';

const SESSION_KEY = ['auth', 'session'];

async function ensureProfile(session: Session) {
  const state = useAuthStore.getState();
  if (state.profile?.id === session.user.id || state.isBootstrapping) return;
  if (state.profile && state.profile.id !== session.user.id) {
    state.clear();
  }

  state.setBootstrapping(true);
  try {
    const row = await callRpc<UserRow>('rpc_bootstrap_user');
    if (!row?.id) {
      throw new Error('rpc_bootstrap_user returned no profile');
    }
    state.setProfile(row);
  } catch (err) {
    state.setBootstrapError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    state.setBootstrapping(false);
  }
}

export function useSession() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<Session | null> => {
      const { data } = await supabase.auth.getSession();
      if (data.session) void ensureProfile(data.session);
      return data.session;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      qc.setQueryData(SESSION_KEY, session);
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void ensureProfile(session);
      }
      if (event === 'SIGNED_OUT') {
        useAuthStore.getState().clear();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return query;
}

export function useCurrentUserProfile() {
  const profile = useAuthStore((s) => s.profile);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const error = useAuthStore((s) => s.bootstrapError);
  return { data: profile, isLoading: isBootstrapping, error };
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
  useAuthStore.getState().clear();
}
