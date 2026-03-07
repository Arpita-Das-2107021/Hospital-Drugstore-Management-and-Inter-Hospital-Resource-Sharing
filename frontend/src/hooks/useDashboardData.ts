import { useState, useEffect } from 'react';
import { hospitalService, DashboardData } from '@/services/hospitalService';

export const useDashboardData = () => {
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
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
};

export const useHospitals = () => {
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHospitals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await hospitalService.getHospitals();
      
      // Map backend fields to frontend expected format with defaults
      const mappedHospitals = data.map((hospital: any) => ({
        id: hospital.id,
        name: hospital.name,
        city: hospital.city,
        region: hospital.state || 'Unknown Region', // Use state as region
        coordinates_lat: 0, // Default coordinates
        coordinates_lng: 0,
        trust_level: 'VERIFIED', // Default trust level
        specialties: ['General Medicine'], // Default specialties
        total_beds: 100, // Default bed count
        contact_email: hospital.email,
        contact_phone: hospital.phone,
        is_active: hospital.status === 'ACTIVE',
        address: hospital.address,
        code: hospital.code,
        license_number: hospital.license_number,
        postal_code: hospital.postal_code,
        status: hospital.status,
        verified_at: hospital.verified_at,
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
  }, []);

  return {
    hospitals,
    loading,
    error,
    refetch: fetchHospitals,
  };
};