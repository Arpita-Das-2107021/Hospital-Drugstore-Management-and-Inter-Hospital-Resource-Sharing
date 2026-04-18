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

const extractNode = (payload: unknown): Record<string, unknown> => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  if (Object.keys(data).length > 0) {
    return data;
  }

  return root;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

export interface RetailSale {
  id: string;
  inventory: string;
  inventory_name: string;
  sold_at: string;
  quantity: number;
  customer_reference: string;
  notes: string;
  unit_selling_price_snapshot: number | null;
  discount_amount: number | null;
  final_total: number | null;
}

export interface CreateRetailSalePayload {
  inventory_id: string;
  quantity: number;
  customer_reference?: string;
  notes?: string;
}

const mapRetailSale = (item: unknown): RetailSale => {
  const row = asRecord(item);

  return {
    id: String(row.id ?? ''),
    inventory: String(row.inventory ?? row.inventory_id ?? ''),
    inventory_name: String(row.inventory_name ?? row.catalog_item_name ?? ''),
    sold_at: String(row.sold_at ?? row.created_at ?? ''),
    quantity: toNumber(row.quantity),
    customer_reference: String(row.customer_reference ?? ''),
    notes: String(row.notes ?? ''),
    unit_selling_price_snapshot: toNullableNumber(row.unit_selling_price_snapshot),
    discount_amount: toNullableNumber(row.discount_amount),
    final_total: toNullableNumber(row.final_total),
  };
};

export const salesService = {
  create: async (payload: CreateRetailSalePayload): Promise<RetailSale> => {
    const response = await requestJson('/api/v1/retail-sales/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return mapRetailSale(extractNode(response));
  },
  list: async (): Promise<RetailSale[]> => {
    const response = await requestJson('/api/v1/retail-sales/');
    return extractList(response).map(mapRetailSale);
  },
  getById: async (id: string): Promise<RetailSale> => {
    const response = await requestJson(`/api/v1/retail-sales/${id}/`);
    return mapRetailSale(extractNode(response));
  },
};
