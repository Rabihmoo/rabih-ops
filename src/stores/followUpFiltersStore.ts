import { create } from 'zustand';
import type { FollowUpListFilters } from '@/lib/follow-ups';
import type { FollowUpCategory, FollowUpStatus, TaskPriority } from '@/types/database';

export type FollowUpBucket = 'all' | 'today' | 'overdue' | 'mine' | 'upcoming';

export interface FollowUpFiltersState {
  bucket: FollowUpBucket;
  branch: string | null;
  status: FollowUpStatus | null;
  category: FollowUpCategory | null;
  priority: TaskPriority | null; // applied client-side after fetch
  assignedTo: string | null;
  search: string;

  setBucket: (bucket: FollowUpBucket) => void;
  setBranch: (branch: string | null) => void;
  setStatus: (status: FollowUpStatus | null) => void;
  setCategory: (category: FollowUpCategory | null) => void;
  setPriority: (priority: TaskPriority | null) => void;
  setAssignedTo: (uid: string | null) => void;
  setSearch: (search: string) => void;
  resetGranular: () => void;
}

export const useFollowUpFiltersStore = create<FollowUpFiltersState>((set) => ({
  bucket: 'today',
  branch: null,
  status: null,
  category: null,
  priority: null,
  assignedTo: null,
  search: '',

  setBucket: (bucket) => set({ bucket }),
  setBranch: (branch) => set({ branch }),
  setStatus: (status) => set({ status }),
  setCategory: (category) => set({ category }),
  setPriority: (priority) => set({ priority }),
  setAssignedTo: (uid) => set({ assignedTo: uid }),
  setSearch: (search) => set({ search }),
  resetGranular: () =>
    set({
      branch: null,
      status: null,
      category: null,
      priority: null,
      assignedTo: null,
      search: '',
    }),
}));

export type FollowUpFilterFields = Pick<
  FollowUpFiltersState,
  'bucket' | 'branch' | 'status' | 'category' | 'priority' | 'assignedTo' | 'search'
>;

export function followUpFiltersToRpcParams(
  state: FollowUpFilterFields,
  currentUserId: string | undefined,
): FollowUpListFilters {
  const today = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const params: FollowUpListFilters = {
    branch: state.branch,
    status: state.status,
    category: state.category,
    assignedTo: state.assignedTo,
    search: state.search.trim() || null,
    includeDone: false,
  };

  switch (state.bucket) {
    case 'today':
      params.dueBefore = today;
      params.dueAfter = today;
      break;
    case 'overdue':
      params.dueBefore = today;
      break;
    case 'mine':
      if (currentUserId) params.assignedTo = currentUserId;
      break;
    case 'upcoming':
      params.dueAfter = today;
      params.dueBefore = inSevenDays;
      break;
    case 'all':
    default:
      break;
  }

  return params;
}
