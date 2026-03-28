/**
 * Hospital Service - API calls for hospital-specific data
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
  user_profile: any;
  statistics: HospitalStatistics;
  recent_alerts: Alert[];
  critical_inventory: InventoryItem[];
}

export class HospitalService {
  private getAuthHeader(): HeadersInit {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  async getDashboardData(): Promise<DashboardData> {
    const response = await fetch(`${API_BASE_URL}/users/my_hospital_dashboard/`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      throw new Error('Failed to fetch dashboard data');
    }

    return response.json();
  }

  async getHospitals(): Promise<Hospital[]> {
    const response = await fetch(`${API_BASE_URL}/hospitals/`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch hospitals');
    }

    const data = await response.json();
    return data.results || data;
  }

  async getHospitalById(id: string): Promise<Hospital> {
    const response = await fetch(`${API_BASE_URL}/hospitals/${id}/`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch hospital');
    }

    return response.json();
  }

  async getHospitalResources(hospitalId: string): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/hospitals/${hospitalId}/resources/`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch hospital resources');
    }

    return response.json();
  }

  async getHospitalStaff(hospitalId: string): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/hospitals/${hospitalId}/staff/`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch hospital staff');
    }

    return response.json();
  }

  async getAlerts(hospitalId?: string): Promise<Alert[]> {
    let url = `${API_BASE_URL}/alerts/`;
    if (hospitalId) {
      url += `?hospital=${hospitalId}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch alerts');
    }

    const data = await response.json();
    return data.results || data;
  }

  async markAlertRead(alertId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/alerts/${alertId}/mark_read/`, {
      method: 'POST',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to mark alert as read');
    }
  }

  async getInventoryItems(hospitalId?: string): Promise<InventoryItem[]> {
    let url = `${API_BASE_URL}/inventory/`;
    if (hospitalId) {
      url += `?hospital=${hospitalId}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch inventory items');
    }

    const data = await response.json();
    return data.results || data;
  }

  async getCriticalInventory(hospitalId?: string): Promise<InventoryItem[]> {
    let url = `${API_BASE_URL}/inventory/?critical=true`;
    if (hospitalId) {
      url += `&hospital=${hospitalId}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch critical inventory');
    }

    const data = await response.json();
    return data.results || data;
  }
}

export const hospitalService = new HospitalService();