import { useAuthStore } from '@/stores/authStore';

// Mirrors public._can_mutate() in supabase/migrations/20260421_rpcs.sql.
// Viewers can read; admin/ceo/manager can write. The DB enforces this — the
// hook just lets the UI hide options that would otherwise hit a 42501.
export function useCanMutate(): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  return role === 'admin' || role === 'ceo' || role === 'manager';
}

// Mirrors public._can_admin_inspect() in 20260511_inspections_module.sql.
// Inspections are an audit function — only admin/ceo can create/update them
// or add/edit findings. Managers can resolve findings (they implement fixes).
export function useCanAdminInspect(): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  return role === 'admin' || role === 'ceo';
}

// Mirrors public._can_admin_purchases() in 20260512_purchasing_module.sql.
// Approve / record-payment / cancel / soft-delete on purchase requests are
// fiscal commitments and need admin/ceo. Managers handle create / edit-while-
// draft / submit / record-delivery / comment / attach (gated by useCanMutate).
export function useCanAdminPurchases(): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  return role === 'admin' || role === 'ceo';
}
