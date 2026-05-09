import { create } from 'zustand';
import type { TaskListFilters } from '@/lib/tasks';
import type { TaskPriority, TaskStatus } from '@/types/database';

// Bucket presets that drive the dashboard tiles + the default list view.
// Buckets compose with the granular filters below; e.g. bucket='today'
// + branch='salt' lists today's SALT tasks only.
export type TaskBucket =
  | 'today'
  | 'overdue'
  | 'mine'
  | 'waiting'
  | 'delayed'
  | 'repeat'
  | 'active'
  | 'history';

export interface TaskFiltersState {
  bucket: TaskBucket;
  branch: string | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  assignedTo: string | null;
  search: string;

  setBucket: (bucket: TaskBucket) => void;
  setBranch: (branch: string | null) => void;
  setStatus: (status: TaskStatus | null) => void;
  setPriority: (priority: TaskPriority | null) => void;
  setAssignedTo: (uid: string | null) => void;
  setSearch: (search: string) => void;
  resetGranular: () => void;
}

export const useTaskFiltersStore = create<TaskFiltersState>((set) => ({
  bucket: 'today',
  branch: null,
  status: null,
  priority: null,
  assignedTo: null,
  search: '',

  setBucket: (bucket) => set({ bucket }),
  setBranch: (branch) => set({ branch }),
  setStatus: (status) => set({ status }),
  setPriority: (priority) => set({ priority }),
  setAssignedTo: (uid) => set({ assignedTo: uid }),
  setSearch: (search) => set({ search }),
  resetGranular: () =>
    set({ branch: null, status: null, priority: null, assignedTo: null, search: '' }),
}));

// Convert the store state + the current user's id into RPC parameters.
// `priority` is applied client-side (rpc_list_tasks doesn't take it).
export type TaskFilterFields = Pick<
  TaskFiltersState,
  'bucket' | 'branch' | 'status' | 'priority' | 'assignedTo' | 'search'
>;

export function filtersToRpcParams(
  state: TaskFilterFields,
  currentUserId: string | undefined,
): TaskListFilters {
  const today = new Date().toISOString().slice(0, 10);
  const params: TaskListFilters = {
    branch: state.branch,
    status: state.status,
    assignedTo: state.assignedTo,
    search: state.search.trim() || null,
    includeDone: false,
    includeArchived: false,
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
    case 'waiting':
      params.status = 'waiting_for_someone';
      break;
    case 'delayed':
      params.status = 'delayed';
      break;
    case 'repeat':
      params.status = 'needs_repeat';
      break;
    case 'history':
      params.includeDone = true;
      params.includeArchived = true;
      break;
    case 'active':
    default:
      // active = default: not finished, not archived, not template
      break;
  }

  return params;
}
