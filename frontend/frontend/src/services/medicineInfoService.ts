import { catalogApi } from '@/services/api';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown, path: string): UnknownRecord => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  throw new Error(`Invalid medicine info response: expected object at ${path}.`);
};

const readRequiredBoolean = (record: UnknownRecord, key: string, path: string): boolean => {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid medicine info response: expected boolean at ${path}.${key}.`);
  }
  return value;
};

const readRequiredRecord = (record: UnknownRecord, key: string, path: string): UnknownRecord => {
  return asRecord(record[key], `${path}.${key}`);
};

export type MedicineInfo = UnknownRecord;

export type MedicineInfoResponse = {
  success: boolean;
  data: MedicineInfo;
  cache: {
    hit: boolean;
    stale: boolean;
  };
};

const parseMedicineInfoResponse = (payload: unknown): MedicineInfoResponse => {
  const root = asRecord(payload, 'root');
  const success = readRequiredBoolean(root, 'success', 'root');
  const data = readRequiredRecord(root, 'data', 'root');
  const cache = readRequiredRecord(root, 'cache', 'root');
  const hit = readRequiredBoolean(cache, 'hit', 'root.cache');
  const stale = readRequiredBoolean(cache, 'stale', 'root.cache');

  if (!success) {
    throw new Error('Medicine info request was not successful.');
  }

  return {
    success,
    data,
    cache: {
      hit,
      stale,
    },
  };
};

const normalizeCatalogItemId = (id: string): string => {
  const normalized = String(id || '').trim();
  if (!normalized) {
    throw new Error('Catalog item id is required to fetch medicine info.');
  }
  return normalized;
};

export const medicineInfoService = {
  getMedicineInfo: async (id: string, language?: 'en' | 'bn'): Promise<MedicineInfoResponse> => {
    const normalizedId = normalizeCatalogItemId(id);
    const payload = await catalogApi.getMedicineInfo(
      normalizedId,
      language ? { language } : undefined,
    );
    return parseMedicineInfoResponse(payload);
  },

  refreshMedicineInfo: async (id: string, language?: 'en' | 'bn'): Promise<void> => {
    const normalizedId = normalizeCatalogItemId(id);
    await catalogApi.refreshMedicineInfo(normalizedId, language ? { language } : undefined);
  },
};
