/**
 * API data loader - replaces mock data with dynamic API calls
 * 
 * This file provides hooks that can be used as drop-in replacements for static mock data.
 * It maintains the same interface but fetches data from the backend API instead.
 */

import { useState, useEffect } from 'react';
import api from '@/services/api';

// Enable/disable API mode via environment variable
const USE_API = import.meta.env.VITE_USE_API === 'true';

/**
 * Hook to get hospitals data
 */
export function useHospitals() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      // Fallback to mock data
      import('@/data/mock/hospitals').then(module => {
        setData(module.mockHospitals);
        setLoading(false);
      });
      return;
    }

    // Fetch from API
    api.hospitals.getAll()
      .then(response => {
        // Transform API response to match frontend interface
        const transformed = response.results?.map((h: any) => ({
          id: h.id,
          name: h.name,
          city: h.city,
          region: h.region,
          coordinates: { lat: parseFloat(h.coordinates_lat), lng: parseFloat(h.coordinates_lng) },
          beds: h.total_beds,
          specialties: h.specialties || [],
          image: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=400&h=300&fit=crop',
          address: `${h.city}`,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load hospitals:', err);
        setError(err);
        setLoading(false);
        // Fallback to mock data on error
        import('@/data/mock/hospitals').then(module => {
          setData(module.mockHospitals);
        });
      });
  }, []);

  return { data, loading, error };
}

/**
 * Hook to get inventory data
 */
export function useInventory(hospitalId?: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/inventory').then(module => {
        setData(module.mockInventory);
        setLoading(false);
      });
      return;
    }

    const params = hospitalId ? { hospital: hospitalId } : {};
    api.inventory.getAll(params)
      .then(response => {
        const transformed = response.results?.map((item: any) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          abcClassification: item.abc_classification,
          vedClassification: item.ved_classification,
          currentStock: item.current_stock,
          reorderLevel: item.reorder_level,
          maxStock: item.max_stock,
          unitPrice: parseFloat(item.unit_price),
          expiryDate: item.expiry_date,
          supplier: item.supplier,
          lastUpdated: item.last_updated,
          hospital: item.hospital_name,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load inventory:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/inventory').then(module => {
          setData(module.mockInventory);
        });
      });
  }, [hospitalId]);

  return { data, loading, error };
}

/**
 * Hook to get shared resources data
 */
export function useSharedResources(filters?: Record<string, string>) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/resources').then(module => {
        setData(module.mockSharedResources);
        setLoading(false);
      });
      return;
    }

    api.sharedResources.getAll(filters)
      .then(response => {
        const transformed = response.results?.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.category_type,
          hospital: r.hospital_name,
          quantity: r.available_quantity,
          availability: r.available_quantity > 10 ? 'available' : r.available_quantity > 0 ? 'limited' : 'unavailable',
          isEmergency: r.is_emergency_stock,
          lastUpdated: r.last_updated,
          description: r.description,
          isVisibleToOthers: r.visibility_level === 'public',
          expiryDate: r.expiry_date,
          image: 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=300&h=200&fit=crop',
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load shared resources:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/resources').then(module => {
          setData(module.mockSharedResources);
        });
      });
  }, [filters]);

  return { data, loading, error };
}

/**
 * Hook to get resource requests data
 */
export function useResourceRequests(filters?: Record<string, string>) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/requests').then(module => {
        setData(module.mockRequests);
        setLoading(false);
      });
      return;
    }

    api.requests.getAll(filters)
      .then(response => {
        const transformed = response.results?.map((r: any) => ({
          id: r.id,
          resourceName: r.resource_name,
          resourceType: r.resource_type,
          requestingHospital: r.requesting_hospital_name,
          providingHospital: r.providing_hospital_name,
          quantity: r.quantity,
          urgency: r.urgency,
          status: r.status,
          justification: r.justification,
          requestedAt: r.requested_at,
          updatedAt: r.updated_at,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load requests:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/requests').then(module => {
          setData(module.mockRequests);
        });
      });
  }, [filters]);

  return { data, loading, error };
}

/**
 * Hook to get alerts data
 */
export function useAlerts(filters?: Record<string, string>) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/requests').then(module => {
        setData(module.mockAlerts);
        setLoading(false);
      });
      return;
    }

    setLoading(true);
    api.alerts.getAll(filters)
      .then(response => {
        const transformed = response.results?.map((a: any) => ({
          id: a.id,
          type: a.alert_type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          hospital: a.hospital_name,
          resourceId: a.resource,
          isRead: a.is_read,
          createdAt: a.created_at,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load alerts:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/requests').then(module => {
          setData(module.mockAlerts);
        });
      });
  }, [filters, refreshKey]);

  const refetch = () => setRefreshKey(prev => prev + 1);

  return { data, loading, error, refetch };
}

/**
 * Hook to get users data
 */
export function useUsers(filters?: Record<string, string>) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/users').then(module => {
        setData(module.mockEmployees);
        setLoading(false);
      });
      return;
    }

    api.users.getAll(filters)
      .then(response => {
        const transformed = response.results?.map((u: any) => ({
          id: u.id,
          name: u.full_name,
          email: u.email,
          role: u.role,
          hospital: u.hospital_name || 'Unknown',
          department: u.department,
          isOnline: u.is_online,
          specialization: u.specialization,
          phoneNumber: u.phone_number,
          lastSeen: u.last_seen,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load users:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/users').then(module => {
          setData(module.mockEmployees);
        });
      });
  }, [filters]);

  return { data, loading, error };
}

/**
 * Hook to get audit logs
 */
export function useAuditLogs(filters?: Record<string, string>) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/admin').then(module => {
        setData(module.mockAuditLogs);
        setLoading(false);
      });
      return;
    }

    api.auditLogs.getAll(filters)
      .then(response => {
        const transformed = response.results?.map((log: any) => ({
          id: log.id,
          action: log.action,
          user: log.user_name,
          resource: log.resource_name,
          details: log.details,
          timestamp: log.timestamp,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load audit logs:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/admin').then(module => {
          setData(module.mockAuditLogs);
        });
      });
  }, [filters]);

  return { data, loading, error };
}

/**
 * Hook to get role permissions
 */
export function useRolePermissions() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!USE_API) {
      import('@/data/mock/admin').then(module => {
        setData(module.mockRolePermissions);
        setLoading(false);
      });
      return;
    }

    api.permissions.getAll()
      .then(response => {
        const transformed = response.results?.map((p: any) => ({
          role: p.role,
          permissions: p.permissions,
        })) || [];
        setData(transformed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load permissions:', err);
        setError(err);
        setLoading(false);
        import('@/data/mock/admin').then(module => {
          setData(module.mockRolePermissions);
        });
      });
  }, []);

  return { data, loading, error };
}
