import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isLoading: sessionLoading } = useSession();
  const profile = useAuthStore((s) => s.profile);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const bootstrapError = useAuthStore((s) => s.bootstrapError);
  const location = useLocation();

  if (sessionLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (bootstrapError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="text-destructive text-sm">
          Could not load your RabihOS profile: {bootstrapError.message}
        </div>
      </div>
    );
  }

  if (!profile || isBootstrapping) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Setting up your profile...</div>
      </div>
    );
  }

  return <>{children}</>;
}
