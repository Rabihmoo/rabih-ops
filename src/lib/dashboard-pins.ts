// Dashboard pin/unpin feature.
//
// Pure helpers are in dashboard-pins-pure.ts (env-free, vitest-safe).
// This file re-exports them and adds the RPC wrapper that needs supabase.

export {
  DEFAULT_SECTION_ORDER,
  sortSections,
  togglePin,
  validatePins,
  type DashboardSectionKey,
} from './dashboard-pins-pure';

import { callRpc } from './rpc';
import type { UserRow } from '@/types/database';
import type { DashboardSectionKey } from './dashboard-pins-pure';

export async function setDashboardPins(
  pins: DashboardSectionKey[],
): Promise<UserRow> {
  return callRpc<UserRow>('rpc_set_dashboard_pins', {
    p_pins: pins,
  });
}
