import { useAuthStore } from '@/stores/authStore';

// Mirrors public._can_mutate() in supabase/migrations/20260421_rpcs.sql.
// Viewers can read; admin/ceo/manager can write. The DB enforces this — the
// hook just lets the UI hide options that would otherwise hit a 42501.
export function useCanMutate(): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  return role === 'admin' || role === 'ceo' || role === 'manager';
}
