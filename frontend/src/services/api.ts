/**
 * API Service for Hospital Resource Sharing System
 * 
 * This service provides methods to interact with the backend REST API
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Generic API request function
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get JWT access token from localStorage
  const accessToken = localStorage.getItem('access_token');
  
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add Bearer authorization header if token exists
  if (accessToken) {
    defaultHeaders['Authorization'] = `Bearer ${accessToken}`;
  }
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };
  
  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      // If unauthorized and we have a refresh token, try to refresh
      if (response.status === 401 && localStorage.getItem('refresh_token')) {
        const authService = (await import('./authService')).default;
        try {
          await authService.refreshAccessToken();
          // Retry the request with new token
          const newToken = localStorage.getItem('access_token');
          if (newToken) {
            defaultHeaders['Authorization'] = `Bearer ${newToken}`;
            const retryResponse = await fetch(url, {
              ...config,
              headers: {
                ...defaultHeaders,
                ...options.headers,
              },
            });
            if (retryResponse.ok) {
              return await retryResponse.json();
            }
          }
        } catch (refreshError) {
          // Refresh failed, redirect to login
          window.location.href = '/login';
          throw new Error('Session expired. Please login again.');
        }
      }
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Request failed:', error);
    throw error;
  }
}

// Hospitals API
export const hospitalsApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/hospitals/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/hospitals/${id}/`),
  create: (data: any) => apiRequest<any>('/hospitals/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiRequest<any>(`/hospitals/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => apiRequest<any>(`/hospitals/${id}/`, {
    method: 'DELETE',
  }),
};

// Shared Resources API
export const sharedResourcesApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/shared-resources/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/shared-resources/${id}/`),
  create: (data: any) => apiRequest<any>('/shared-resources/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiRequest<any>(`/shared-resources/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => apiRequest<any>(`/shared-resources/${id}/`, {
    method: 'DELETE',
  }),
};

// Inventory API
export const inventoryApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/inventory/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/inventory/${id}/`),
  create: (data: any) => apiRequest<any>('/inventory/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiRequest<any>(`/inventory/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => apiRequest<any>(`/inventory/${id}/`, {
    method: 'DELETE',
  }),
  getAnalytics: (hospitalId?: string) => {
    const query = hospitalId ? `?hospital=${hospitalId}` : '';
    return apiRequest<any>(`/inventory/analytics/${query}`);
  },
};

// Resource Requests API
export const requestsApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/requests/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/requests/${id}/`),
  create: (data: any) => apiRequest<any>('/requests/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiRequest<any>(`/requests/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  approve: (id: string, data: any) => apiRequest<any>(`/requests/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  reject: (id: string, data: any) => apiRequest<any>(`/requests/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Alerts API
export const alertsApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/alerts/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/alerts/${id}/`),
  markRead: (id: string) => apiRequest<any>(`/alerts/${id}/mark_read/`, {
    method: 'POST',
  }),
  resolve: (id: string) => apiRequest<any>(`/alerts/${id}/resolve/`, {
    method: 'POST',
  }),
};

// Users API
export const usersApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/users/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/users/${id}/`),
  create: (data: any) => apiRequest<any>('/users/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiRequest<any>(`/users/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

// Messages API
export const messagesApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/messages/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/messages/${id}/`),
  create: (data: any) => apiRequest<any>('/messages/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  markRead: (id: string) => apiRequest<any>(`/messages/${id}/mark_read/`, {
    method: 'POST',
  }),
};

// Audit Logs API
export const auditLogsApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/audit-logs/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/audit-logs/${id}/`),
};

// Permissions API
export const permissionsApi = {
  getAll: () => apiRequest<any>('/permissions/'),
  getById: (id: string) => apiRequest<any>(`/permissions/${id}/`),
  update: (id: string, data: any) => apiRequest<any>(`/permissions/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

// Bed Occupancy API
export const bedOccupancyApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/bed-occupancy/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/bed-occupancy/${id}/`),
  update: (id: string, data: any) => apiRequest<any>(`/bed-occupancy/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

// Categories API
export const categoriesApi = {
  getAll: (params?: Record<string, string>) => {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any>(`/categories/${queryString}`);
  },
  getById: (id: string) => apiRequest<any>(`/categories/${id}/`),
};

export default {
  hospitals: hospitalsApi,
  sharedResources: sharedResourcesApi,
  inventory: inventoryApi,
  requests: requestsApi,
  alerts: alertsApi,
  users: usersApi,
  messages: messagesApi,
  auditLogs: auditLogsApi,
  permissions: permissionsApi,
  bedOccupancy: bedOccupancyApi,
  categories: categoriesApi,
};
