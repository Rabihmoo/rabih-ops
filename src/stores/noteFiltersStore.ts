import { create } from 'zustand';
import type { NoteKind, NoteModule, NoteVisibility } from '@/types/database';

export interface NoteFiltersState {
  kind: NoteKind | null;
  module: NoteModule | null;
  visibility: NoteVisibility | null;
  branch: string | null;
  search: string;
  includeArchived: boolean;
  setKind: (v: NoteKind | null) => void;
  setModule: (v: NoteModule | null) => void;
  setVisibility: (v: NoteVisibility | null) => void;
  setBranch: (v: string | null) => void;
  setSearch: (v: string) => void;
  setIncludeArchived: (v: boolean) => void;
  reset: () => void;
}

export const useNoteFiltersStore = create<NoteFiltersState>((set) => ({
  kind: null,
  module: null,
  visibility: null,
  branch: null,
  search: '',
  includeArchived: false,
  setKind: (kind) => set({ kind }),
  setModule: (module) => set({ module }),
  setVisibility: (visibility) => set({ visibility }),
  setBranch: (branch) => set({ branch }),
  setSearch: (search) => set({ search }),
  setIncludeArchived: (includeArchived) => set({ includeArchived }),
  reset: () =>
    set({
      kind: null,
      module: null,
      visibility: null,
      branch: null,
      search: '',
      includeArchived: false,
    }),
}));
