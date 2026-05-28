import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/** Allows only admin and ceo roles. Others get redirected to /. */
export function AdminCeoGuard() {
  const role = useAuthStore((s) => s.profile?.role);
  if (!role) return null; // still loading
  if (role !== 'admin' && role !== 'ceo') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
