import { create } from 'zustand';
import { medicineInfoService, type MedicineInfo } from '@/services/medicineInfoService';

export type CachedMedicineEntry = {
  data: MedicineInfo;
  stale: boolean;
  fetchedAt: string;
};

export type MedicineInfoStore = {
  cache: Record<string, CachedMedicineEntry>;
  loading: boolean;
  error: string | null;
  fetchMedicineInfo: (id: string, forceRefresh?: boolean, language?: 'en' | 'bn') => Promise<void>;
  clearMedicineCache: () => void;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Unable to load medicine information right now.';
};

const normalizeCatalogItemId = (id: string): string => String(id || '').trim();

let pendingRequests = 0;

const beginRequest = (set: (nextState: Partial<MedicineInfoStore>) => void) => {
  pendingRequests += 1;
  set({ loading: true });
};

const endRequest = (set: (nextState: Partial<MedicineInfoStore>) => void) => {
  pendingRequests = Math.max(0, pendingRequests - 1);
  set({ loading: pendingRequests > 0 });
};

const saveCacheEntry = (
  set: (nextState: Partial<MedicineInfoStore> | ((state: MedicineInfoStore) => Partial<MedicineInfoStore>)) => void,
  catalogItemId: string,
  data: MedicineInfo,
  stale: boolean,
) => {
  set((state) => ({
    cache: {
      ...state.cache,
      [catalogItemId]: {
        data,
        stale,
        fetchedAt: new Date().toISOString(),
      },
    },
    error: null,
  }));
};

export const useMedicineInfoStore = create<MedicineInfoStore>()((set, get) => ({
  cache: {},
  loading: false,
  error: null,

  fetchMedicineInfo: async (id, forceRefresh = false, language) => {
    const catalogItemId = normalizeCatalogItemId(id);
    if (!catalogItemId) {
      set({ error: 'Catalog item id is required to load medicine information.' });
      return;
    }

    const existingEntry = get().cache[catalogItemId];

    if (existingEntry && !forceRefresh) {
      // Keep cached UI immediate and refresh from backend in the background.
      set({ error: null });
      beginRequest(set);

      void (async () => {
        try {
          const response = await medicineInfoService.getMedicineInfo(catalogItemId, language);
          saveCacheEntry(set, catalogItemId, response.data, response.cache.stale);
        } catch (error) {
          set({ error: toErrorMessage(error) });
        } finally {
          endRequest(set);
        }
      })();

      return;
    }

    beginRequest(set);
    set({ error: null });

    try {
      if (forceRefresh) {
        await medicineInfoService.refreshMedicineInfo(catalogItemId, language);
      }

      const response = await medicineInfoService.getMedicineInfo(catalogItemId, language);
      saveCacheEntry(set, catalogItemId, response.data, response.cache.stale);
    } catch (error) {
      set({ error: toErrorMessage(error) });
    } finally {
      endRequest(set);
    }
  },

  clearMedicineCache: () => {
    pendingRequests = 0;
    set({
      cache: {},
      loading: false,
      error: null,
    });
  },
}));
