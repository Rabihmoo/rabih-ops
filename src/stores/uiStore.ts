import { create } from 'zustand';
import type { BranchCode } from '@/lib/branches';

interface UiState {
  branchFilter: BranchCode | 'all';
  setBranchFilter: (branch: BranchCode | 'all') => void;
}

export const useUiStore = create<UiState>((set) => ({
  branchFilter: 'all',
  setBranchFilter: (branch) => set({ branchFilter: branch }),
}));
