import { create } from 'zustand';
import type { UserRow } from '@/types/database';

interface AuthState {
  profile: UserRow | null;
  isBootstrapping: boolean;
  bootstrapError: Error | null;
  setProfile: (profile: UserRow) => void;
  setBootstrapping: (loading: boolean) => void;
  setBootstrapError: (err: Error | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isBootstrapping: false,
  bootstrapError: null,
  setProfile: (profile) => set({ profile, bootstrapError: null }),
  setBootstrapping: (loading) => set({ isBootstrapping: loading }),
  setBootstrapError: (err) => set({ bootstrapError: err, isBootstrapping: false }),
  clear: () => set({ profile: null, isBootstrapping: false, bootstrapError: null }),
}));
