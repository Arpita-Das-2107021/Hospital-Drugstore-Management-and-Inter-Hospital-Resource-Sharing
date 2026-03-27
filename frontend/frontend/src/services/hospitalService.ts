/**
 * Hospital Service - API calls for hospital-specific data
 */

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:8000';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);

export interface HospitalStatistics {
  total_resources: number;
  available_resources: number;
  total_staff: number;
  outgoing_requests: number;
  incoming_requests: number;
  unread_alerts: number;
}

export interface Hospital {
  id: string;
  name: string;
  logo?: string | null;
  city: string;
  region: string;
  coordinates_lat: number;
  coordinates_lng: number;
  trust_level: string;
  specialties: string[];
  total_beds: number;
  contact_email: string;
  contact_phone: string;
  is_active: boolean;
}

export interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  current_stock: number;
  reorder_level: number;
  is_critical_stock: boolean;
  days_until_expiry?: number;
}

export interface DashboardData {
  hospital: Hospital;
  user_profile: unknown;
  statistics: HospitalStatistics;
  recent_alerts: Alert[];
  critical_inventory: InventoryItem[];
}

const EMPTY_HOSPITAL: Hospital = {
  id: '',
  name: 'Hospital',
  logo: null,
  city: 'Unknown City',
  region: 'Unknown Region',
  coordinates_lat: 0,
  coordinates_lng: 0,
  trust_level: 'medium',
  specialties: [],
  total_beds: 0,
  contact_email: '',
  contact_phone: '',
  is_active: true,
};

export class HospitalService {
  private async fetchWithTimeout(path: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private getStoredAccessToken(): string | null {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  }

  private extractList<T = unknown>(responseBody: unknown): T[] {
    if (Array.isArray(responseBody)) return responseBody;
    if (Array.isArray(responseBody?.data)) return responseBody.data;
    if (Array.isArray(responseBody?.results)) return responseBody.results;
    if (Array.isArray(responseBody?.data?.results)) return responseBody.data.results;
    return [];
  }

  private getAuthHeader(): HeadersInit {
    const token = this.getStoredAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private normalizeHospital(raw: unknown): Hospital {
    return {
      id: raw?.id || EMPTY_HOSPITAL.id,
      name: raw?.name || EMPTY_HOSPITAL.name,
      logo: raw?.logo ?? null,
      city: raw?.city || EMPTY_HOSPITAL.city,
      region: raw?.region || raw?.state || EMPTY_HOSPITAL.region,
      coordinates_lat: Number(raw?.coordinates_lat ?? raw?.latitude ?? 0),
      coordinates_lng: Number(raw?.coordinates_lng ?? raw?.longitude ?? 0),
      trust_level: (raw?.trust_level || EMPTY_HOSPITAL.trust_level).toString().toLowerCase(),
      specialties: Array.isArray(raw?.specialties) ? raw.specialties : [],
      total_beds: Number(raw?.total_beds ?? raw?.beds_total ?? 0),
      contact_email: raw?.contact_email || raw?.email || '',
      contact_phone: raw?.contact_phone || raw?.phone || '',
      is_active: typeof raw?.is_active === 'boolean' ? raw.is_active : true,
    };
  }

  async getDashboardData(): Promise<DashboardData> {
    // Dashboard hospital context is derived from the authenticated user profile.
    const [profileRes, hospitalsRes, inventoryRes, notificationsRes, requestsRes, staffRes] = await Promise.allSettled([
      this.fetchWithTimeout('/api/auth/me/', { headers: this.getAuthHeader() }),
      this.fetchWithTimeout('/api/v1/hospitals/', { headers: this.getAuthHeader() }),
      this.fetchWithTimeout('/api/v1/inventory/', { headers: this.getAuthHeader() }),
      this.fetchWithTimeout('/api/v1/notifications/', { headers: this.getAuthHeader() }),
      this.fetchWithTimeout('/api/v1/requests/', { headers: this.getAuthHeader() }),
      this.fetchWithTimeout('/api/v1/staff/', { headers: this.getAuthHeader() }),
    ]);

    const profilePayload = profileRes.status === 'fulfilled' && profileRes.value.ok
      ? await profileRes.value.json()
      : null;
    const profile = profilePayload?.data ?? profilePayload ?? null;
    const hospitalId = profile?.hospital_id ? String(profile.hospital_id) : '';

    const hospitals = hospitalsRes.status === 'fulfilled' && hospitalsRes.value.ok
      ? this.extractList(await hospitalsRes.value.json())
      : [];

    const scopedHospital = hospitalId
      ? hospitals.find((h: unknown) => String(h?.id ?? '') === hospitalId)
      : hospitals[0] ?? null;

    const inventory = inventoryRes.status === 'fulfilled' && inventoryRes.value.ok
      ? this.extractList(await inventoryRes.value.json())
      : [];

    const notifications = notificationsRes.status === 'fulfilled' && notificationsRes.value.ok
      ? this.extractList(await notificationsRes.value.json())
      : [];

    const requests = requestsRes.status === 'fulfilled' && requestsRes.value.ok
      ? this.extractList(await requestsRes.value.json())
      : [];

    const staff = staffRes.status === 'fulfilled' && staffRes.value.ok
      ? this.extractList(await staffRes.value.json())
      : [];

    const availableResources = inventory.filter((item: unknown) => {
      const qty = Number(item?.quantity_available ?? item?.current_stock ?? 0);
      return qty > 0;
    }).length;

    const criticalInventory = inventory
      .filter((item: unknown) => {
        const qty = Number(item?.quantity_available ?? item?.current_stock ?? 0);
        const reorderLevel = Number(item?.reorder_level ?? 0);
        return reorderLevel > 0 && qty <= reorderLevel;
      })
      .slice(0, 8)
      .map((item: unknown) => ({
        id: String(item?.id ?? ''),
        name: item?.catalog_item_name || item?.name || 'Unknown Item',
        category: item?.resource_type || item?.category || 'general',
        current_stock: Number(item?.quantity_available ?? item?.current_stock ?? 0),
        reorder_level: Number(item?.reorder_level ?? 0),
        is_critical_stock: true,
        days_until_expiry: item?.days_until_expiry,
      }));

    const recentAlerts = notifications
      .slice(0, 5)
      .map((item: unknown) => ({
        id: String(item?.id ?? ''),
        alert_type: item?.notification_type || item?.alert_type || 'system',
        severity: item?.severity || 'info',
        title: item?.title || item?.subject || 'Notification',
        message: item?.message || item?.body || '',
        is_read: Boolean(item?.is_read),
        is_resolved: Boolean(item?.is_resolved),
        created_at: item?.created_at || new Date().toISOString(),
      }));

    const pendingRequests = requests.filter((item: unknown) => {
      const status = String(item?.status || '').toLowerCase();
      return ['pending', 'requested', 'approved', 'reserved'].includes(status);
    }).length;

    const unreadAlerts = notifications.filter((item: unknown) => !item?.is_read).length;

    return {
      hospital: this.normalizeHospital(scopedHospital || EMPTY_HOSPITAL),
      user_profile: profile,
      statistics: {
        total_resources: inventory.length,
        available_resources: availableResources,
        total_staff: staff.length,
        outgoing_requests: 0,
        incoming_requests: pendingRequests,
        unread_alerts: unreadAlerts,
      },
      recent_alerts: recentAlerts,
      critical_inventory: criticalInventory,
    };
  }

  async getHospitals(): Promise<Hospital[]> {
    const response = await this.fetchWithTimeout('/api/v1/hospitals/', {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to fetch hospitals');
    const data = await response.json();
    return this.extractList(data);
  }

  async getHospitalById(id: string): Promise<Hospital> {
    const response = await this.fetchWithTimeout(`/api/v1/hospitals/${id}/`, {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to fetch hospital');
    const data = await response.json();
    return data.data || data;
  }

  async getHospitalResources(_hospitalId?: string): Promise<unknown[]> {
    // Hospital context is derived by backend from authenticated JWT user.
    const response = await this.fetchWithTimeout('/api/v1/inventory/', {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to fetch hospital resources');
    const data = await response.json();
    return this.extractList(data);
  }

  async getHospitalStaff(_hospitalId?: string): Promise<unknown[]> {
    const response = await this.fetchWithTimeout('/api/v1/staff/', {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to fetch hospital staff');
    const data = await response.json();
    return this.extractList(data);
  }

  async getAlerts(): Promise<Alert[]> {
    const response = await this.fetchWithTimeout('/api/v1/notifications/', {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to fetch notifications');
    const data = await response.json();
    return this.extractList(data);
  }

  async markAlertRead(alertId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`/api/v1/notifications/${alertId}/read/`, {
      method: 'POST',
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to mark notification as read');
  }

  async getInventoryItems(): Promise<InventoryItem[]> {
    const response = await this.fetchWithTimeout('/api/v1/inventory/', {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) throw new Error('Failed to fetch inventory items');
    const data = await response.json();
    return this.extractList(data);
  }

  async getCriticalInventory(): Promise<InventoryItem[]> {
    return this.getInventoryItems();
  }
}

export const hospitalService = new HospitalService();