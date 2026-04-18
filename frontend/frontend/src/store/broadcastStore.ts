import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type BroadcastStoreState = {
  unreadCount: number;
  lastFetchedAt: number | null;
};

type BroadcastStoreActions = {
  setUnreadCount: (count: number) => void;
  incrementUnread: (amount?: number) => void;
  decrementUnread: (amount?: number) => void;
  clearUnread: () => void;
  resetBroadcastStore: () => void;
};

export type BroadcastStore = BroadcastStoreState & BroadcastStoreActions;

const initialState: BroadcastStoreState = {
  unreadCount: 0,
  lastFetchedAt: null,
};

export const BROADCAST_UNREAD_STALE_MS = 30_000;

const clampUnreadCount = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const clampDelta = (value: number | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
};

export const shouldRefreshBroadcastUnread = (
  lastFetchedAt: number | null,
  staleMs: number = BROADCAST_UNREAD_STALE_MS,
): boolean => {
  if (!Number.isFinite(lastFetchedAt) || !lastFetchedAt) return true;
  return Date.now() - lastFetchedAt >= staleMs;
};

export const useBroadcastStore = create<BroadcastStore>()(
  persist(
    (set) => ({
      ...initialState,

      setUnreadCount: (count) => {
        set({
          unreadCount: clampUnreadCount(count),
          lastFetchedAt: Date.now(),
        });
      },

      incrementUnread: (amount = 1) => {
        const delta = clampDelta(amount);
        set((state) => ({
          unreadCount: clampUnreadCount(state.unreadCount + delta),
          lastFetchedAt: Date.now(),
        }));
      },

      decrementUnread: (amount = 1) => {
        const delta = clampDelta(amount);
        set((state) => ({
          unreadCount: clampUnreadCount(state.unreadCount - delta),
          lastFetchedAt: Date.now(),
        }));
      },

      clearUnread: () => {
        set((state) => {
          if (state.unreadCount === 0) {
            return state;
          }

          return {
            unreadCount: 0,
            lastFetchedAt: Date.now(),
          };
        });
      },

      resetBroadcastStore: () => {
        set({ ...initialState });
      },
    }),
    {
      name: 'hrsp-broadcast-cache',
      partialize: (state) => ({
        unreadCount: state.unreadCount,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);