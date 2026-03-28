import { useState, useEffect } from 'react';
import { hospitalService, DashboardData } from '@/services/hospitalService';
import { hospitalsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export const useDashboardData = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const dashboardData = await hospitalService.getDashboardData();
      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.id, user?.hospital_id]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
};

export const useHospitals = () => {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHospitals = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await hospitalsApi.getAll();
      const data: unknown[] = Array.isArray((res as unknown)?.data)
        ? (res as unknown).data
        : Array.isArray((res as unknown)?.results)
          ? (res as unknown).results
          : Array.isArray((res as unknown)?.data?.results)
            ? (res as unknown).data.results
            : Array.isArray(res)
              ? (res as unknown)
              : [];
      
      // Map backend fields to frontend expected format with defaults
      const mappedHospitals = data.map((hospital: unknown) => ({
        id: hospital.id,
        name: hospital.name,
        city: hospital.city,
        region: hospital.state || hospital.region || 'Unknown Region',
        coordinates_lat: hospital.latitude ?? hospital.coordinates_lat ?? null,
        coordinates_lng: hospital.longitude ?? hospital.coordinates_lng ?? null,
        trust_level: String(hospital.trust_level || 'medium').toLowerCase(),
        specialties: ['General Medicine'],
        total_beds: 100,
        contact_email: hospital.email,
        contact_phone: hospital.phone,
        is_active: hospital.status === 'active' || hospital.status === 'approved',
        address: hospital.address,
        hospital_type: hospital.hospital_type,
        status: hospital.status,
        logo: hospital.logo ?? null,
      }));
      
      setHospitals(mappedHospitals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hospitals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, [user?.id]);

  return {
    hospitals,
    loading,
    error,
    refetch: fetchHospitals,
  };
};