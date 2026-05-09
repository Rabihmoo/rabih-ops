import { create } from 'zustand';
import type { PurchaseListFilters } from '@/lib/purchase-requests';
import type {
  PaymentStatus,
  PurchaseStatus,
  TaskPriority,
} from '@/types/database';

export type PurchaseBucket =
  | 'pending'           // status in (draft, submitted)
  | 'awaiting_delivery' // status in (ordered, partially_received)
  | 'unpaid'            // payment_status in (unpaid, partial); not cancelled
  | 'mine'              // requested_by = me
  | 'all';

export interface PurchaseFiltersState {
  bucket: PurchaseBucket;
  branch: string | null;
  status: PurchaseStatus | null;
  priority: TaskPriority | null;
  paymentStatus: PaymentStatus | null;
  search: string;

  setBucket: (bucket: PurchaseBucket) => void;
  setBranch: (branch: string | null) => void;
  setStatus: (status: PurchaseStatus | null) => void;
  setPriority: (priority: TaskPriority | null) => void;
  setPaymentStatus: (paymentStatus: PaymentStatus | null) => void;
  setSearch: (search: string) => void;
  resetGranular: () => void;
}

export const usePurchaseFiltersStore = create<PurchaseFiltersState>((set) => ({
  bucket: 'awaiting_delivery',
  branch: null,
  status: null,
  priority: null,
  paymentStatus: null,
  search: '',

  setBucket: (bucket) => set({ bucket }),
  setBranch: (branch) => set({ branch }),
  setStatus: (status) => set({ status }),
  setPriority: (priority) => set({ priority }),
  setPaymentStatus: (paymentStatus) => set({ paymentStatus }),
  setSearch: (search) => set({ search }),
  resetGranular: () =>
    set({
      branch: null,
      status: null,
      priority: null,
      paymentStatus: null,
      search: '',
    }),
}));

export type PurchaseFilterFields = Pick<
  PurchaseFiltersState,
  'bucket' | 'branch' | 'status' | 'priority' | 'paymentStatus' | 'search'
>;

// Translate the store + caller's user id into rpc_list_purchase_requests args.
// 'pending' / 'awaiting_delivery' / 'unpaid' bucket presets widen multiple
// statuses, so the RPC can't express them with a single p_status — we filter
// client-side after fetch.
export function purchaseFiltersToRpcParams(
  state: PurchaseFilterFields,
  currentUserId: string | undefined,
): PurchaseListFilters {
  const params: PurchaseListFilters = {
    branch: state.branch,
    status: state.status,
    priority: state.priority,
    paymentStatus: state.paymentStatus,
    search: state.search.trim() || null,
    includeDone: state.bucket === 'all',
  };

  switch (state.bucket) {
    case 'mine':
      if (currentUserId) params.requestedBy = currentUserId;
      break;
    case 'pending':
    case 'awaiting_delivery':
    case 'unpaid':
    case 'all':
    default:
      break;
  }

  return params;
}
