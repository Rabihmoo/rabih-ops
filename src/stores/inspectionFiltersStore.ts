import { create } from 'zustand';
import type { InspectionListFilters } from '@/lib/inspections';
import type { InspectionArea, InspectionResult } from '@/types/database';

export type InspectionBucket = 'recent' | 'pending' | 'failed' | 'mine' | 'all';

export interface InspectionFiltersState {
  bucket: InspectionBucket;
  branch: string | null;
  result: InspectionResult | null;
  area: InspectionArea | null;
  search: string;

  setBucket: (bucket: InspectionBucket) => void;
  setBranch: (branch: string | null) => void;
  setResult: (result: InspectionResult | null) => void;
  setArea: (area: InspectionArea | null) => void;
  setSearch: (search: string) => void;
  resetGranular: () => void;
}

export const useInspectionFiltersStore = create<InspectionFiltersState>((set) => ({
  bucket: 'recent',
  branch: null,
  result: null,
  area: null,
  search: '',

  setBucket: (bucket) => set({ bucket }),
  setBranch: (branch) => set({ branch }),
  setResult: (result) => set({ result }),
  setArea: (area) => set({ area }),
  setSearch: (search) => set({ search }),
  resetGranular: () =>
    set({ branch: null, result: null, area: null, search: '' }),
}));

export type InspectionFilterFields = Pick<
  InspectionFiltersState,
  'bucket' | 'branch' | 'result' | 'area' | 'search'
>;

export function inspectionFiltersToRpcParams(
  state: InspectionFilterFields,
  currentUserId: string | undefined,
): InspectionListFilters {
  const params: InspectionListFilters = {
    branch: state.branch,
    result: state.result,
    area: state.area,
    search: state.search.trim() || null,
  };

  switch (state.bucket) {
    case 'pending':
      params.result = 'pending';
      break;
    case 'failed':
      // failed bucket = result IN ('issues_found','failed'); RPC takes a single
      // value, so we widen this client-side after fetch.
      break;
    case 'mine':
      if (currentUserId) params.inspectedBy = currentUserId;
      break;
    case 'recent':
    case 'all':
    default:
      break;
  }

  return params;
}
