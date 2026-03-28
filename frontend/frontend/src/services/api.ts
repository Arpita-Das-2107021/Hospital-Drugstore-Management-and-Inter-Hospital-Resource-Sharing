/**
 * API Service for Hospital Resource Sharing System
 *
 * Base URL: http://localhost:8000
 * All v1 endpoints are under /api/v1/
 * Auth endpoints are under /api/auth/
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getStoredAccessToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

function hasStoredRefreshToken(): boolean {
  return !!(
    localStorage.getItem('refresh_token') ||
    sessionStorage.getItem('refresh_token')
  );
}

// Generic API request function
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const accessToken = getStoredAccessToken();
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const defaultHeaders: Record<string, string> = isMultipart
    ? {}
    : { 'Content-Type': 'application/json' };

  if (accessToken) {
    defaultHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> | undefined),
    },
  };

  try {
    const response = await fetchWithTimeout(url, config);

    if (!response.ok) {
      if (response.status === 401 && hasStoredRefreshToken()) {
        const authService = (await import('./authService')).default;
        try {
          await authService.refreshAccessToken();
          const newToken = getStoredAccessToken();
          if (newToken) {
            defaultHeaders['Authorization'] = `Bearer ${newToken}`;
            const retryResponse = await fetchWithTimeout(url, {
              ...config,
              headers: {
                ...defaultHeaders,
                ...(options.headers as Record<string, string> | undefined),
              },
            });
            if (retryResponse.ok) {
              return retryResponse.json();
            }
          }
        } catch {
          window.location.href = '/login';
          throw new Error('Session expired. Please login again.');
        }
      }
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody?.error?.message || `API Error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  } catch (error: unknown) {
    if (error?.name === 'AbortError') {
      throw new Error(`API request timed out after ${Math.round(API_TIMEOUT_MS / 1000)}s`);
    }
    console.error('API Request failed:', error);
    throw error;
  }
}

// ─── Hospitals ────────────────────────────────────────────────────────────────

export const hospitalsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/hospitals/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/hospitals/${id}/`),
  getMyHospital: () => apiRequest<unknown>('/api/v1/hospitals/my-hospital/'),
  updateMyHospital: (data: unknown) =>
    apiRequest<unknown>('/api/v1/hospitals/my-hospital/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  create: (data: unknown) =>
    apiRequest<unknown>('/api/v1/hospitals/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/hospitals/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  verify: (id: string) =>
    apiRequest<unknown>(`/api/v1/hospitals/${id}/verify/`, { method: 'POST' }),
  suspend: (id: string) =>
    apiRequest<unknown>(`/api/v1/hospitals/${id}/suspend/`, { method: 'POST' }),
  getCapacity: (id: string) => apiRequest<unknown>(`/api/v1/hospitals/${id}/capacity/`),
  getStaff: (id: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/hospitals/${id}/staff/${qs}`);
  },
  updateCapacity: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/hospitals/${id}/capacity/`, { method: 'PUT', body: JSON.stringify(data) }),
  submitOffboardingRequest: (id: string, reason: string) =>
    apiRequest<unknown>(`/api/v1/hospitals/${id}/offboarding-request/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// ─── Hospital Registration (Two-Step Onboarding) ──────────────────────────────

export const hospitalRegistrationApi = {
  submit: (data: unknown) => {
    if (data instanceof FormData) {
      return apiRequest<unknown>('/api/v1/hospital-registration/', {
        method: 'POST',
        body: data,
        headers: {},
      });
    }
    return apiRequest<unknown>('/api/v1/hospital-registration/', { method: 'POST', body: JSON.stringify(data) });
  },
  listAdminRegistrations: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/admin/hospital-registrations/${qs}`);
  },
  getAdminRegistration: (id: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-registrations/${id}/`),
  approve: (id: string, notes?: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-registrations/${id}/approve/`, {
      method: 'POST',
      body: JSON.stringify(notes ? { notes } : {}),
    }),
  reject: (id: string, rejection_reason: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-registrations/${id}/reject/`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason }),
    }),
};

// ─── Resource Catalog ─────────────────────────────────────────────────────────

export const catalogApi = {
  getTypes: () => apiRequest<unknown>('/api/v1/catalog/types/'),
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/catalog/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/catalog/${id}/`),
  create: (data: unknown) =>
    apiRequest<unknown>('/api/v1/catalog/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/catalog/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest<unknown>(`/api/v1/catalog/${id}/`, { method: 'DELETE' }),
};

// ─── Resource Inventory ───────────────────────────────────────────────────────
// Note: inventory is READ-ONLY (created automatically when catalog items are restocked)
// Use adjust() to change quantities

export const inventoryApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/inventory/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/inventory/${id}/`),
  adjust: (id: string, data: { quantity_delta: number; notes?: string; transaction_type?: string }) =>
    apiRequest<unknown>(`/api/v1/inventory/${id}/adjust/`, { method: 'POST', body: JSON.stringify(data) }),
  getTransactions: (id: string) =>
    apiRequest<unknown>(`/api/v1/inventory/${id}/transactions/`),
  getShareVisibility: () => apiRequest<unknown>('/api/v1/inventory/share-visibility/'),
  updateShareVisibility: async (data: {
    inventory_id?: string;
    inventory_item_id?: string;
    inventory?: string;
    catalog_item?: string;
    catalog_item_id?: string;
    shared_quantity: number;
    quantity_offered?: number;
    share_record_id?: string;
    resource_share_id?: string;
  }) => {
    const attempts: Record<string, unknown>[] = [];

    // Try explicit inventory-based payload first (new endpoint contract).
    if (data.inventory_id || data.inventory_item_id || data.inventory) {
      attempts.push({
        inventory_id: data.inventory_id || data.inventory_item_id || data.inventory,
        shared_quantity: data.shared_quantity,
        share_record_id: data.share_record_id || data.resource_share_id,
      });
    }

    // Fallback to catalog_item key if backend identifies by catalog entry.
    if (data.catalog_item || data.catalog_item_id) {
      attempts.push({
        catalog_item: data.catalog_item || data.catalog_item_id,
        shared_quantity: data.shared_quantity,
        share_record_id: data.share_record_id || data.resource_share_id,
      });
    }

    // Backward-compatible fallback using resource-share naming.
    attempts.push({
      catalog_item: data.catalog_item || data.catalog_item_id,
      quantity_offered: data.quantity_offered ?? data.shared_quantity,
      share_record_id: data.share_record_id || data.resource_share_id,
    });

    let lastError: unknown;
    for (const payload of attempts) {
      try {
        return await apiRequest<unknown>('/api/v1/inventory/share-visibility/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to save share visibility.');
  },
  // Inventory scope is derived by backend from authenticated JWT hospital context.
  getAnalytics: async () => {
    const res = await apiRequest<unknown>('/api/v1/inventory/');
    const items: unknown[] = (res as unknown)?.data ?? (res as unknown)?.results ?? [];
    const total = items.length;
    const totalValue = items.reduce((s: number, i: unknown) => s + ((i.quantity_available ?? 0) * (i.unit_price ?? 0)), 0);
    const lowStock = items.filter((i: unknown) => (i.quantity_available ?? 0) < (i.reorder_level ?? 5));
    return {
      summary: {
        total_items: total,
        total_value: totalValue,
        low_stock_count: lowStock.length,
        out_of_stock_count: items.filter((i: unknown) => (i.quantity_available ?? 0) === 0).length,
      },
      days_of_supply: [],
      clinical_impact: [],
      expiry_risk: [],
      turnover_by_category: [],
      top_value_items: items.slice(0, 5).map((i: unknown) => ({
        name: i.catalog_item_name ?? i.name ?? '',
        value: (i.quantity_available ?? 0) * (i.unit_price ?? 0),
        quantity: i.quantity_available ?? 0,
      })),
      attention_required: lowStock.map((i: unknown) => ({
        name: i.catalog_item_name ?? i.name ?? '',
        status: 'warning',
        current: i.quantity_available ?? 0,
        required: i.reorder_level ?? 5,
      })),
    };
  },
};

// ─── Resource Shares ──────────────────────────────────────────────────────────

export const resourceSharesApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/resource-shares/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/resource-shares/${id}/`),
  create: (data: unknown) =>
    // Required: hospital (UUID), catalog_item (UUID), quantity_offered (int)
    // Optional: status, notes, valid_until (datetime)
    apiRequest<unknown>('/api/v1/resource-shares/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/resource-shares/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest<unknown>(`/api/v1/resource-shares/${id}/`, { method: 'DELETE' }),
};

// ─── Resource Requests ────────────────────────────────────────────────────────

export const requestsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/requests/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/requests/${id}/`),
  create: (data: unknown) =>
    // Required: supplying_hospital (UUID), catalog_item (UUID), quantity_requested (int)
    // Optional: priority (normal|urgent|emergency), notes, needed_by (datetime)
    apiRequest<unknown>('/api/v1/requests/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/requests/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  approve: (id: string, data: { decision: 'approved' | 'rejected'; quantity_approved?: number; reason?: string }) =>
    apiRequest<unknown>(`/api/v1/requests/${id}/approve/`, { method: 'POST', body: JSON.stringify(data) }),
  dispatch: (
    id: string,
    payload?:
      | string
      | {
          notes?: string;
          rider_name?: string;
          rider_phone?: string;
          vehicle_info?: string;
          carrier_name?: string;
          tracking_number?: string;
          estimated_delivery_at?: string;
        }
  ) => {
    const body =
      typeof payload === 'string'
        ? { notes: payload }
        : {
            notes: payload?.notes || '',
            rider_name: payload?.rider_name,
            rider_phone: payload?.rider_phone,
            vehicle_info: payload?.vehicle_info,
            carrier_name: payload?.carrier_name,
            tracking_number: payload?.tracking_number,
            estimated_delivery_at: payload?.estimated_delivery_at,
          };

    return apiRequest<unknown>(`/api/v1/requests/${id}/dispatch/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  confirmDelivery: (data: {
    token?: string;
    dispatch_token?: string;
    receive_token?: string;
    shipment_id?: string;
    quantity_received?: number;
    notes?: string;
  }) =>
    apiRequest<unknown>('/api/v1/requests/confirm-delivery/', { method: 'POST', body: JSON.stringify(data) }),
  cancel: (id: string, data?: { return_reason?: string; reason?: string }) =>
    apiRequest<unknown>(`/api/v1/requests/${id}/`, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    }),
  verifyReturn: (id: string, data: { return_reason: string; return_verified?: boolean; notes?: string }) =>
    apiRequest<unknown>(`/api/v1/requests/${id}/verify-return/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Shipments ────────────────────────────────────────────────────────────────

export const shipmentsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/shipments/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/shipments/${id}/`),
  create: (data: unknown) =>
    // Required: origin_hospital (UUID), destination_hospital (UUID)
    // Optional: carrier_name, tracking_number, estimated_delivery_at, notes, status
    apiRequest<unknown>('/api/v1/shipments/', { method: 'POST', body: JSON.stringify(data) }),
  dispatch: (id: string, data: {
    rider_name: string;
    rider_phone: string;
    vehicle_info: string;
    carrier_name?: string;
    tracking_number?: string;
    estimated_delivery_at?: string;
    notes?: string;
  }) =>
    apiRequest<unknown>(`/api/v1/shipments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'dispatched',
        ...data,
      }),
    }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/shipments/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  addTracking: (id: string, data: { status: string; location?: string; notes?: string }) =>
    apiRequest<unknown>(`/api/v1/shipments/${id}/tracking/`, { method: 'POST', body: JSON.stringify(data) }),
  getTracking: (id: string) =>
    apiRequest<unknown>(`/api/v1/shipments/${id}/tracking/`),
  updateLocation: (id: string, data: { lat: number; lng: number; eta?: string }) =>
    apiRequest<unknown>(`/api/v1/shipments/${id}/location/`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmHandover: (id: string, data: { condition?: string; notes?: string; receiver_name?: string; receiver_position?: string }) =>
    apiRequest<unknown>(`/api/v1/shipments/${id}/handover/`, { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Staff ────────────────────────────────────────────────────────────────────

export const staffApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/staff/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/staff/${id}/`),
  create: (data: unknown) =>
    apiRequest<unknown>('/api/v1/staff/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/staff/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  suspend: (id: string) =>
    apiRequest<unknown>(`/api/v1/staff/${id}/suspend/`, { method: 'POST' }),
};

// ─── Roles ────────────────────────────────────────────────────────────────────

export const rolesApi = {
  getAll: () => apiRequest<unknown>('/api/v1/roles/'),
  create: (data: unknown) =>
    apiRequest<unknown>('/api/v1/roles/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/roles/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest<unknown>(`/api/v1/roles/${id}/`, { method: 'DELETE' }),
};

// ─── Invitations ─────────────────────────────────────────────────────────────

export const invitationsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/invitations/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/invitations/${id}/`),
  send: (data: unknown) =>
    apiRequest<unknown>('/api/v1/invitations/', { method: 'POST', body: JSON.stringify(data) }),
  revoke: (id: string) =>
    apiRequest<unknown>(`/api/v1/invitations/${id}/revoke/`, { method: 'POST' }),
  accept: (data: { token: string; password: string }) =>
    apiRequest<unknown>('/api/v1/invitations/accept/', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/notifications/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/notifications/${id}/`),
  markRead: (id: string) =>
    apiRequest<unknown>(`/api/v1/notifications/${id}/read/`, { method: 'POST' }),
  markAllRead: () =>
    apiRequest<unknown>('/api/v1/notifications/mark-all-read/', { method: 'POST' }),
};

// ─── Broadcasts ───────────────────────────────────────────────────────────────

export const broadcastsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/broadcasts/${qs}`);
  },
  getUnreadCount: () =>
    apiRequest<unknown>('/api/v1/broadcasts/unread-count/'),
  getById: (id: string) => apiRequest<unknown>(`/api/v1/broadcasts/${id}/`),
  create: (data: unknown) =>
    // Required: title, message
    // Optional: scope ('all'|'hospitals'), priority ('normal'|'urgent'|'emergency'), allow_response (bool), target_hospitals (UUID[])
    apiRequest<unknown>('/api/v1/broadcasts/', { method: 'POST', body: JSON.stringify(data) }),
  close: (id: string) =>
    apiRequest<unknown>(`/api/v1/broadcasts/${id}/close/`, { method: 'POST' }),
  delete: (id: string) =>
    apiRequest<unknown>(`/api/v1/broadcasts/${id}/`, { method: 'DELETE' }),
  respond: (id: string, data: { response: string }) =>
    apiRequest<unknown>(`/api/v1/broadcasts/${id}/respond/`, { method: 'POST', body: JSON.stringify(data) }),
  markRead: (id: string) =>
    apiRequest<unknown>(`/api/v1/broadcasts/${id}/read/`, { method: 'POST' }),
  getResponses: (id: string) =>
    apiRequest<unknown>(`/api/v1/broadcasts/${id}/responses/`),
};

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  get: () => apiRequest<unknown>('/api/v1/analytics/'),
};

// ─── Integrations ─────────────────────────────────────────────────────────────
// HospitalAPIConfig: per-resource external API integration config for a hospital

export const integrationsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/integrations/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/integrations/${id}/`),
  create: (data: unknown) =>
    // Required: resource_type (UUID), integration_type ('api'|'manual'|'csv_upload'), api_endpoint
    // Optional: http_method ('GET'|'POST'|'PUT'), auth_type ('bearer'|'basic'|'api_key'|'none'),
    //           api_token (raw, will be encrypted), headers (JSON), sync_frequency (int), is_active
    apiRequest<unknown>('/api/v1/integrations/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/integrations/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest<unknown>(`/api/v1/integrations/${id}/`, { method: 'DELETE' }),
};

// ─── Audit Logs ────────────────────────────────────────────────────────────────

export const auditApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/audit-logs/${qs}`);
  },
};

// ─── Conversations & Messaging ────────────────────────────────────────────────

export const conversationsApi = {
  openDirectConversation: (participantId: string) =>
    apiRequest<unknown>('/api/v1/chat/direct-conversations/open/', {
      method: 'POST',
      body: JSON.stringify({ participant_id: participantId }),
    }),
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/conversations/${qs}`).catch(() =>
      apiRequest<unknown>(`/api/v1/chat/conversations/${qs}`)
    );
  },
  getById: (id: string) =>
    apiRequest<unknown>(`/api/v1/conversations/${id}/`).catch(() =>
      apiRequest<unknown>(`/api/v1/chat/conversations/${id}/`)
    ),
  create: (data: unknown) => {
    // Backend expects participant_ids (array of user UUIDs), subject, resource_request (optional)
    const payload: unknown = { subject: data.subject || '' };
    if (data.participant_ids) payload.participant_ids = data.participant_ids;
    if (data.participants) payload.participant_ids = data.participants;
    if (data.resource_request) payload.resource_request = data.resource_request;
    return apiRequest<unknown>('/api/v1/conversations/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() =>
      apiRequest<unknown>('/api/v1/chat/conversations/', { method: 'POST', body: JSON.stringify(payload) })
    );
  },
  getMessages: (id: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/chat/conversations/${id}/messages/${qs}`).catch(() =>
      apiRequest<unknown>(`/api/v1/conversations/${id}/messages/${qs}`)
    );
  },
  sendMessage: (id: string, data: unknown) => {
    // Backend expects { body: string }
    const payload = { body: data.body || data.content || data.message || '' };
    return apiRequest<unknown>(`/api/v1/conversations/${id}/messages/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  uploadAttachment: (
    id: string,
    file: File,
    options?: {
      body?: string;
      mediaKind?: 'image' | 'file' | 'voice' | 'video';
    },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.body) {
      formData.append('body', options.body);
    }
    if (options?.mediaKind) {
      formData.append('media_kind', options.mediaKind);
    }
    return apiRequest<unknown>(`/api/v1/chat/conversations/${id}/attachments/`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },
  deleteMessage: (conversationId: string, messageId: string, deleteForEveryone = false) =>
    apiRequest<unknown>(`/api/v1/chat/conversations/${conversationId}/messages/delete/`, {
      method: 'POST',
      body: JSON.stringify({
        message_id: messageId,
        delete_for_everyone: deleteForEveryone,
      }),
    }),
  deleteConversation: (conversationId: string) =>
    apiRequest<unknown>(`/api/v1/chat/conversations/${conversationId}/delete/`, {
      method: 'POST',
    }),
  markRead: (id: string) =>
    apiRequest<unknown>(`/api/v1/conversations/${id}/read/`, { method: 'POST' }),
};

export const templatesApi = {
  getAll: () => apiRequest<unknown>('/api/v1/templates/'),
  getById: (id: string) => apiRequest<unknown>(`/api/v1/templates/${id}/`),
  create: (data: unknown) =>
    apiRequest<unknown>('/api/v1/templates/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    apiRequest<unknown>(`/api/v1/templates/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest<unknown>(`/api/v1/templates/${id}/`, { method: 'DELETE' }),
};

// ─── Offboarding ──────────────────────────────────────────────────────────────

export const offboardingApi = {
  listAdminRequests: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/admin/hospital-offboarding-requests/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/admin/hospital-offboarding-requests/${id}/`),
  approve: (id: string, admin_notes?: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-offboarding-requests/${id}/approve/`, {
      method: 'POST',
      body: JSON.stringify(admin_notes ? { admin_notes } : {}),
    }),
  reject: (id: string, admin_notes?: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-offboarding-requests/${id}/reject/`, {
      method: 'POST',
      body: JSON.stringify(admin_notes ? { admin_notes } : {}),
    }),
};

export const hospitalUpdateRequestsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<unknown>(`/api/v1/admin/hospital-update-requests/${qs}`);
  },
  getById: (id: string) => apiRequest<unknown>(`/api/v1/admin/hospital-update-requests/${id}/`),
  approve: (id: string, admin_notes?: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-update-requests/${id}/approve/`, {
      method: 'POST',
      body: JSON.stringify(admin_notes ? { admin_notes } : {}),
    }),
  reject: (id: string, rejection_reason?: string) =>
    apiRequest<unknown>(`/api/v1/admin/hospital-update-requests/${id}/reject/`, {
      method: 'POST',
      body: JSON.stringify(rejection_reason ? { rejection_reason } : {}),
    }),
};

// ─── Credits ──────────────────────────────────────────────────────────────────

export const creditsApi = {
  get: () => apiRequest<unknown>('/api/v1/credits/'),
  getBalance: async () => {
    try {
      return await apiRequest<unknown>('/api/v1/analytics/balance/');
    } catch {
      // Backward compatibility for older backends.
      return apiRequest<unknown>('/api/v1/credits/balance/');
    }
  },
};

// ─── Public ───────────────────────────────────────────────────────────────────

export const publicApi = {
  health: () => apiRequest<unknown>('/api/health/'),
  info: () => apiRequest<unknown>('/api/v1/public/'),
};

export default {
  hospitals: hospitalsApi,
  hospitalRegistration: hospitalRegistrationApi,
  catalog: catalogApi,
  inventory: inventoryApi,
  resourceShares: resourceSharesApi,
  requests: requestsApi,
  shipments: shipmentsApi,
  staff: staffApi,
  roles: rolesApi,
  invitations: invitationsApi,
  notifications: notificationsApi,
  broadcasts: broadcastsApi,
  analytics: analyticsApi,
  credits: creditsApi,
  conversations: conversationsApi,
  templates: templatesApi,
  offboarding: offboardingApi,
  hospitalUpdateRequests: hospitalUpdateRequestsApi,
  integrations: integrationsApi,
  audit: auditApi,
  public: publicApi,
};
