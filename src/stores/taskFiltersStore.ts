import { create } from 'zustand';
import type { TaskListFilters } from '@/lib/tasks';
import type { TaskPriority, TaskStatus } from '@/types/database';

// Bucket presets that drive the dashboard tiles + the default list view.
// Buckets compose with the granular filters below; e.g. bucket='today'
// + branch='salt' lists today's SALT tasks only.
export type TaskBucket = 'all' | 'today' | 'overdue' | 'mine' | 'waiting';

export interface TaskFiltersState {
  bucket: TaskBucket;
  branch: string | null; // null = all accessible
  status: TaskStatus | null;
  priority: TaskPriority | null; // applied client-side after fetch
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
  };

  switch (state.bucket) {
    case 'today':
      params.dueBefore = today;
      params.dueAfter = today;
      break;
    case 'overdue':
      params.dueBefore = today;
      // Drop the lower bound so older items show. RPC also filters out cancelled+done.
      break;
    case 'mine':
      if (currentUserId) params.assignedTo = currentUserId;
      break;
    case 'waiting':
      // 'waiting on others' = created by me, assigned to someone else.
      // RPC has no created_by filter — applied client-side from the result.
      break;
    case 'all':
    default:
      break;
  }

  return params;
}
