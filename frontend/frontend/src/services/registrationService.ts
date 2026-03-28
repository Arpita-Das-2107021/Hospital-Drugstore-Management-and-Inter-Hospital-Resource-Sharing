/**
 * Registration Service for Hospital Self-Registration
 * Uses POST /api/v1/hospital-registration/ (public endpoint)
 * and admin endpoints for listing/approving/rejecting registrations.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:8000';

function getStoredAccessToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

/** Payload for public hospital registration submission */
export interface HospitalRegistrationData {
  name: string;
  registration_number: string;
  email: string;
  admin_name: string;
  admin_email: string;
  logo?: File;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  hospital_type?: 'general' | 'teaching' | 'specialty' | 'clinic';
  // Optional API integration config
  api_base_url?: string;
  api_auth_type?: 'bearer' | 'basic' | 'api_key' | 'none';
  api_key?: string;
  api_username?: string;
  api_password?: string;
}

export interface RegistrationResponse {
  success: boolean;
  message: string;
  data?: {
    id: string;
    name: string;
    registration_number: string;
    email: string;
    admin_email?: string;
    logo?: string | null;
    status: string;
    submitted_at: string;
  };
  errors?: Record<string, string[]>;
  error?: string;
}

const registrationService = {
  /**
   * Submit a new hospital registration request (public — no auth required).
   * POST /api/v1/hospital-registration/
   */
  registerHospital: async (data: HospitalRegistrationData): Promise<RegistrationResponse> => {
    const url = `${API_BASE_URL}/api/v1/hospital-registration/`;

    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }
        if (key === 'logo' && value instanceof File) {
          formData.append('logo', value);
          return;
        }
        formData.append(key, String(value));
      });

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result?.error?.message || result?.error?.details?.non_field_errors?.[0] || result.message || 'Registration failed',
          errors: result?.error?.details || result.errors,
          error: result.error,
        };
      }

      // API returns { success: true, data: { id, name, ... } }
      return {
        success: true,
        message: 'Registration submitted successfully',
        data: result.data || result,
      };
    } catch (error) {
      console.error('Registration request failed:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection and try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  /**
   * List hospital registration requests (SUPER_ADMIN only).
   * GET /api/v1/admin/hospital-registrations/
   */
  listHospitals: async (status?: string, search?: string): Promise<unknown> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${qs}`;

    const token = getStoredAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Failed to fetch hospitals');
    }

    const result = await response.json();
    // Returns { success, data: [...], meta: {...} }
    return result.data || result;
  },

  /**
   * Get a single registration request by ID (SUPER_ADMIN only).
   * GET /api/v1/admin/hospital-registrations/{id}/
   */
  getHospital: async (id: string): Promise<unknown> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) throw new Error('Failed to fetch registration');
    const result = await response.json();
    return result.data || result;
  },

  /**
   * Approve a hospital registration request (SUPER_ADMIN only).
   * POST /api/v1/admin/hospital-registrations/{id}/approve/
   */
  approveHospital: async (id: string, notes?: string): Promise<unknown> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/approve/`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(notes ? { notes } : {}),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err?.error?.message || 'Failed to approve hospital' };
    }
    const result = await response.json();
    return { success: true, message: 'Hospital approved', data: result.data || result };
  },

  /**
   * Reject a hospital registration request (SUPER_ADMIN only).
   * POST /api/v1/admin/hospital-registrations/{id}/reject/
   */
  rejectHospital: async (id: string, rejection_reason: string): Promise<unknown> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/reject/`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rejection_reason }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err?.error?.message || 'Failed to reject hospital' };
    }
    const result = await response.json();
    return { success: true, message: 'Hospital rejected', data: result.data || result };
  },
};

export default registrationService;
