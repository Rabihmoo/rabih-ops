import { create } from 'zustand';
import type {
  DocumentCategory,
  DocumentStatus,
  DocumentVisibility,
} from '@/types/database';

export interface DocumentFiltersState {
  category: DocumentCategory | null;
  branch: string | null;
  status: DocumentStatus | null;
  visibility: DocumentVisibility | null;
  search: string;
  setCategory: (v: DocumentCategory | null) => void;
  setBranch: (v: string | null) => void;
  setStatus: (v: DocumentStatus | null) => void;
  setVisibility: (v: DocumentVisibility | null) => void;
  setSearch: (v: string) => void;
  reset: () => void;
}

export const useDocumentFiltersStore = create<DocumentFiltersState>((set) => ({
  category: null,
  branch: null,
  status: null,
  visibility: null,
  search: '',
  setCategory: (category) => set({ category }),
  setBranch: (branch) => set({ branch }),
  setStatus: (status) => set({ status }),
  setVisibility: (visibility) => set({ visibility }),
  setSearch: (search) => set({ search }),
  reset: () => set({ category: null, branch: null, status: null, visibility: null, search: '' }),
}));
