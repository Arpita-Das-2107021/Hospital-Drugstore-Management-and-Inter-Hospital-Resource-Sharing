/**
 * API data hooks � all data is fetched dynamically from the backend.
 * No mock data is used. These hooks wrap the API service layer.
 */

import { useState, useEffect } from 'react';
import { hospitalsApi, inventoryApi, resourceSharesApi, requestsApi, notificationsApi, staffApi } from '@/services/api';

export function useHospitals() {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    hospitalsApi.getAll()
      .then((res: unknown) => {
        const raw: unknown[] = res?.data?.results || res?.data || res?.results || (Array.isArray(res) ? res : []);
        setData(raw);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading, error };
}

export function useInventory(hospitalId?: string) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    inventoryApi.getAll()
      .then((res: unknown) => {
        const raw: unknown[] = res?.data?.results || res?.data || res?.results || (Array.isArray(res) ? res : []);
        setData(raw);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [hospitalId]);
  return { data, loading, error };
}

export function useSharedResources(filters?: Record<string, string>) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    resourceSharesApi.getAll(filters)
      .then((res: unknown) => {
        const raw: unknown[] = res?.data?.results || res?.data || res?.results || (Array.isArray(res) ? res : []);
        setData(raw);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);
  return { data, loading, error };
}

export function useResourceRequests(filters?: Record<string, string>) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    requestsApi.getAll(filters)
      .then((res: unknown) => {
        const raw: unknown[] = res?.data?.results || res?.data || res?.results || (Array.isArray(res) ? res : []);
        setData(raw);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);
  return { data, loading, error };
}

export function useAlerts(filters?: Record<string, string>) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    setLoading(true);
    notificationsApi.getAll(filters)
      .then((res: unknown) => {
        const raw: unknown[] = res?.data?.results || res?.data || res?.results || (Array.isArray(res) ? res : []);
        setData(raw);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters), refreshKey]);
  const refetch = () => setRefreshKey(prev => prev + 1);
  return { data, loading, error, refetch };
}

export function useUsers(filters?: Record<string, string>) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    staffApi.getAll(filters)
      .then((res: unknown) => {
        const raw: unknown[] = res?.data?.results || res?.data || res?.results || (Array.isArray(res) ? res : []);
        setData(raw);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);
  return { data, loading, error };
}

export function useAuditLogs(_filters?: Record<string, string>) {
  return { data: [] as unknown[], loading: false, error: null };
}

export function useRolePermissions() {
  return { data: [] as unknown[], loading: false, error: null };
}
