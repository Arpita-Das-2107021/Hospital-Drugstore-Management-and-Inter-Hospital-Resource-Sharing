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
  region_level_1?: string;
  region_level_2?: string;
  region_level_3?: string;
  hospital_type?: 'general' | 'teaching' | 'specialty' | 'clinic';
  facility_type?: 'hospital' | 'pharmacy' | 'clinic' | 'warehouse';
  facility_classification?: 'GOVT' | 'PRIVATE' | 'PHARMACY' | 'CLINIC';
  data_submission_type?: 'api' | 'csv_upload' | 'manual';
  needs_inventory_dashboard?: boolean;
  inventory_source_type?: 'API' | 'DASHBOARD' | 'CSV' | 'HYBRID';
  // Optional API integration config
  api_base_url?: string;
  api_auth_type?: 'bearer' | 'basic' | 'api_key' | 'none';
  api_key?: string;
  api_username?: string;
  api_password?: string;
  bearer_token?: string;
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

export type ReviewIssueType =
  | 'API_VALIDATION'
  | 'ENDPOINT_CONFIGURATION'
  | 'MISSING_REQUIRED_FIELDS'
  | 'CONTACT_INFORMATION'
  | 'GENERAL';

export interface SendReviewEmailPayload {
  subject: string;
  message: string;
  issue_type: ReviewIssueType;
  failed_apis?: string[];
  mark_changes_requested?: boolean;
}

export type SupportedRegistrationApiName =
  | 'healthcheck'
  | 'resources'
  | 'bed'
  | 'blood'
  | 'staff'
  | 'sales';

export interface RegistrationApiBulkCheckPayload {
  api_names?: SupportedRegistrationApiName[];
  timeout_seconds?: number;
}

export interface RegistrationApiSingleCheckPayload {
  timeout_seconds?: number;
}

export interface RegistrationApiColumnValidationContainer {
  required_groups?: string[][];
  missing_required_groups?: string[][];
  present_columns?: string[];
  additional_columns?: string[];
}

export interface RegistrationApiColumnValidationItem {
  checked?: boolean;
  status?: string;
  columns_ok?: boolean;
  required_groups?: string[][];
  missing_required_groups?: string[][];
  additional_columns?: string[];
}

export interface RegistrationApiColumnValidation {
  columns_ok?: boolean;
  additional_columns_allowed?: boolean;
  container?: RegistrationApiColumnValidationContainer;
  item?: RegistrationApiColumnValidationItem;
}

export interface RegistrationApiCheckResultItem {
  status?: string;
  status_code?: number;
  response_time_ms?: number;
  error?: string;
  attempted_urls?: string[];
  column_validation?: RegistrationApiColumnValidation;
}

export interface RegistrationApiCheckSummary {
  total?: number;
  success?: number;
  failed?: number;
  schema_failed?: number;
  connectivity_failed?: number;
}

export interface RegistrationApiCheckData {
  registration_id?: string;
  checked_at?: string;
  checked_apis?: string[];
  failed_apis?: string[];
  schema_failed_apis?: string[];
  connectivity_failed_apis?: string[];
  summary?: RegistrationApiCheckSummary;
  results?: Record<string, RegistrationApiCheckResultItem>;
}

interface RegistrationServiceActionResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: unknown;
  errors?: Record<string, string[]>;
  status_code?: number;
}

interface RegistrationApiCheckActionResult extends RegistrationServiceActionResult {
  data?: RegistrationApiCheckData;
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

  /**
   * Trigger backend API verification for all or selected APIs.
   * POST /api/v1/admin/hospital-registrations/{id}/check-api/
   */
  checkHospitalRegistrationApis: async (
    id: string,
    payload?: RegistrationApiBulkCheckPayload,
  ): Promise<RegistrationApiCheckActionResult> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/check-api/`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const requestBody: Record<string, unknown> = {};
    if (Array.isArray(payload?.api_names) && payload.api_names.length > 0) {
      requestBody.api_names = payload.api_names;
    }
    if (typeof payload?.timeout_seconds === 'number') {
      requestBody.timeout_seconds = payload.timeout_seconds;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: Object.keys(requestBody).length > 0 ? JSON.stringify(requestBody) : undefined,
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorDetails =
        result?.error?.details && typeof result.error.details === 'object'
          ? (result.error.details as Record<string, string[]>)
          : result?.errors && typeof result.errors === 'object'
            ? (result.errors as Record<string, string[]>)
            : undefined;

      return {
        success: false,
        message:
          result?.error?.message ||
          result?.error?.detail ||
          result?.message ||
          'Failed to verify registration APIs',
        error: result?.error,
        data: result?.data,
        errors: errorDetails,
        status_code: response.status,
      };
    }

    return {
      success: result?.success ?? true,
      message: result?.message || 'API verification completed',
      data: result?.data || result,
      status_code: response.status,
    };
  },

  /**
   * Trigger backend API verification for a single API.
    * POST /api/v1/admin/hospital-registrations/{id}/check-api/{api_name}
   */
  checkHospitalRegistrationApi: async (
    id: string,
    apiName: SupportedRegistrationApiName,
    payload?: RegistrationApiSingleCheckPayload,
  ): Promise<RegistrationApiCheckActionResult> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/check-api/${apiName}`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const requestBody: Record<string, unknown> = {};
    if (typeof payload?.timeout_seconds === 'number') {
      requestBody.timeout_seconds = payload.timeout_seconds;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: Object.keys(requestBody).length > 0 ? JSON.stringify(requestBody) : undefined,
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorDetails =
        result?.error?.details && typeof result.error.details === 'object'
          ? (result.error.details as Record<string, string[]>)
          : result?.errors && typeof result.errors === 'object'
            ? (result.errors as Record<string, string[]>)
            : undefined;

      return {
        success: false,
        message:
          result?.error?.message ||
          result?.error?.detail ||
          result?.message ||
          `Failed to verify ${apiName} API`,
        error: result?.error,
        data: result?.data,
        errors: errorDetails,
        status_code: response.status,
      };
    }

    return {
      success: result?.success ?? true,
      message: result?.message || `${apiName} API verification completed`,
      data: result?.data || result,
      status_code: response.status,
    };
  },

  /**
   * Load latest persisted backend API-check snapshot for registration.
   * GET /api/v1/admin/hospital-registrations/{id}/api-check-results/
   */
  getHospitalRegistrationApiCheckResults: async (id: string): Promise<RegistrationApiCheckActionResult> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/api-check-results/`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        message:
          result?.error?.message ||
          result?.error?.detail ||
          result?.message ||
          'Failed to load API verification results',
        error: result?.error,
        data: result?.data,
        errors:
          result?.error?.details && typeof result.error.details === 'object'
            ? (result.error.details as Record<string, string[]>)
            : result?.errors && typeof result.errors === 'object'
              ? (result.errors as Record<string, string[]>)
              : undefined,
        status_code: response.status,
      };
    }

    return {
      success: result?.success ?? true,
      message: result?.message || 'API verification results loaded',
      data: result?.data || result,
      status_code: response.status,
    };
  },

  /**
   * Send a registration review email to the hospital contact (SUPER_ADMIN only).
   * POST /api/v1/admin/hospital-registrations/{id}/send-review-email/
   */
  sendReviewEmail: async (id: string, payload: SendReviewEmailPayload): Promise<RegistrationServiceActionResult> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/send-review-email/`;
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
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorDetails =
        result?.error?.details && typeof result.error.details === 'object'
          ? (result.error.details as Record<string, string[]>)
          : result?.errors && typeof result.errors === 'object'
            ? (result.errors as Record<string, string[]>)
            : undefined;

      return {
        success: false,
        message:
          result?.error?.message ||
          result?.error?.detail ||
          result?.message ||
          'Failed to send review email',
        error: result?.error,
        data: result?.data,
        errors: errorDetails,
      };
    }

    return {
      success: true,
      message: result?.message || 'Review email sent successfully',
      data: result?.data || result,
    };
  },

  /**
   * Fetch review-email audit history for a registration (SUPER_ADMIN only).
   * GET /api/v1/admin/hospital-registrations/{id}/review-email-history/
   */
  getReviewEmailHistory: async (id: string): Promise<unknown> => {
    const url = `${API_BASE_URL}/api/v1/admin/hospital-registrations/${id}/review-email-history/`;
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.message || 'Failed to load review email history');
    }

    const result = await response.json();
    return result?.data || result;
  },
};

export default registrationService;
