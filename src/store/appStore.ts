import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, User } from '../db/schema';
import { defaultSettings } from '../db/seed';

interface AppState {
  currentUser: User | null;
  locked: boolean;
  settings: Settings;
  online: boolean;
  pendingSync: number;
  lastActivityAt: number;
  setUser: (user: User | null) => void;
  lockSession: () => void;
  unlockSession: () => void;
  touchActivity: () => void;
  setSettings: (settings: Settings) => void;
  setOnline: (online: boolean) => void;
  setPendingSync: (count: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUser: null,
      locked: false,
      settings: defaultSettings(),
      online: navigator.onLine,
      pendingSync: 0,
      lastActivityAt: Date.now(),
      setUser: (user) => set({ currentUser: user, locked: false, lastActivityAt: Date.now() }),
      lockSession: () => set((state) => ({ locked: Boolean(state.currentUser) })),
      unlockSession: () => set({ locked: false, lastActivityAt: Date.now() }),
      touchActivity: () => set({ lastActivityAt: Date.now() }),
      setSettings: (settings) => set({ settings }),
      setOnline: (online) => set({ online }),
      setPendingSync: (pendingSync) => set({ pendingSync })
    }),
    {
      name: 'nexus-pos-session',
      partialize: (state) => ({
        currentUser: state.currentUser,
        locked: state.locked,
        settings: state.settings,
        lastActivityAt: state.lastActivityAt
      })
    }
  )
);
