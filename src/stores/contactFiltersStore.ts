import { create } from 'zustand';

export interface ContactFiltersState {
  companyId: string | null;
  branch: string | null;
  search: string;
  includeInactive: boolean;
  setCompanyId: (v: string | null) => void;
  setBranch: (v: string | null) => void;
  setSearch: (v: string) => void;
  setIncludeInactive: (v: boolean) => void;
  reset: () => void;
}

export const useContactFiltersStore = create<ContactFiltersState>((set) => ({
  companyId: null,
  branch: null,
  search: '',
  includeInactive: false,
  setCompanyId: (companyId) => set({ companyId }),
  setBranch: (branch) => set({ branch }),
  setSearch: (search) => set({ search }),
  setIncludeInactive: (includeInactive) => set({ includeInactive }),
  reset: () =>
    set({ companyId: null, branch: null, search: '', includeInactive: false }),
}));
