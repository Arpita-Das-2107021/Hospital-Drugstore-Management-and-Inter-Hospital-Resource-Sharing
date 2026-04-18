const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const getAccessToken = (): string | null => {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const extractErrorMessage = (payload: unknown, fallback: string): string => {
  const record = asRecord(payload);
  const nestedError = asRecord(record.error);

  const messageCandidate =
    (typeof nestedError.message === 'string' && nestedError.message) ||
    (typeof nestedError.detail === 'string' && nestedError.detail) ||
    (typeof record.message === 'string' && record.message) ||
    (typeof record.detail === 'string' && record.detail);

  return messageCandidate || fallback;
};

const extractList = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  const candidates = [payload, root.data, root.results, data.results, data.items, root.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const requestJson = async (path: string, options: RequestInit = {}): Promise<unknown> => {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      extractErrorMessage(payload, `Request failed (${response.status})`),
    ) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export interface InventoryItem {
  id: string;
  catalog_item_name: string;
  catalog_item_id: string | null;
  resource_type_name: string | null;
  hospital_name: string | null;
  quantity_free: number;
  quantity_available: number;
  price_per_unit: number | null;
  discount: unknown;
}

const mapInventoryItem = (item: unknown): InventoryItem => {
  const row = asRecord(item);

  return {
    id: String(row.id ?? row.inventory_id ?? ''),
    catalog_item_name: String(row.catalog_item_name ?? row.name ?? 'Unnamed item'),
    catalog_item_id: toNullableString(row.catalog_item_id ?? row.catalog_item),
    resource_type_name: toNullableString(row.resource_type_name ?? row.category),
    hospital_name: toNullableString(row.hospital_name),
    quantity_free: toNumber(row.quantity_free ?? row.quantity_available),
    quantity_available: toNumber(row.quantity_available ?? row.quantity_free),
    price_per_unit: toNullableNumber(row.price_per_unit ?? row.unit_price),
    discount: row.discount ?? null,
  };
};

export const inventoryService = {
  list: async (): Promise<InventoryItem[]> => {
    const payload = await requestJson('/api/v1/inventory/');
    return extractList(payload).map(mapInventoryItem);
  },
};
