import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // detectSessionInUrl handles PKCE exchange automatically on client init.
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        navigate(data.session ? '/' : '/login', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-muted-foreground text-sm">Signing you in…</div>
    </div>
  );
}
