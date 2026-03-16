import { useState, useEffect } from 'react';
import { roleService, RolePermissions } from '@/services/roleService';
import { hospitalService } from '@/services/hospitalService';

export const useRolePermissions = () => {
  const [permissions, setPermissions] = useState<RolePermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await roleService.getRolePermissions();
      setPermissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  return {
    permissions,
    loading,
    error,
    refetch: fetchPermissions,
  };
};

export const useAuditLogs = (hospitalId?: string) => {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await roleService.getAuditLogs(hospitalId);
      setAuditLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [hospitalId]);

  return {
    auditLogs,
    loading,
    error,
    refetch: fetchAuditLogs,
  };
};