import { create } from 'zustand';
import type { CompanyCategory } from '@/types/database';

export interface CompanyFiltersState {
  category: CompanyCategory | null;
  branch: string | null;
  search: string;
  includeInactive: boolean;
  setCategory: (v: CompanyCategory | null) => void;
  setBranch: (v: string | null) => void;
  setSearch: (v: string) => void;
  setIncludeInactive: (v: boolean) => void;
  reset: () => void;
}

export const useCompanyFiltersStore = create<CompanyFiltersState>((set) => ({
  category: null,
  branch: null,
  search: '',
  includeInactive: false,
  setCategory: (category) => set({ category }),
  setBranch: (branch) => set({ branch }),
  setSearch: (search) => set({ search }),
  setIncludeInactive: (includeInactive) => set({ includeInactive }),
  reset: () =>
    set({ category: null, branch: null, search: '', includeInactive: false }),
}));
