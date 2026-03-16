/**
 * Role and Permission Service - Role-based access control
 */

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:8000';

export interface Permission {
  read: boolean;
  write: boolean;
  admin: boolean;
}

export interface RolePermissions {
  id: string;
  role: string;
  permissions: {
    inventory?: Permission;
    sharing?: Permission;
    communication?: Permission;
    reports?: Permission;
    admin?: Permission;
    user_management?: Permission;
  };
  description: string;
}

export class RoleService {
  private getAuthHeader(): HeadersInit {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async getRolePermissions(): Promise<RolePermissions[]> {
    // Use /api/v1/roles/ for listing roles
    const response = await fetch(`${API_BASE_URL}/api/v1/roles/`, {
      headers: this.getAuthHeader(),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const roles = data.data || data.results || data;
    // Map role names to RolePermissions shape
    return (Array.isArray(roles) ? roles : []).map((r: any) => ({
      id: r.id || r.name,
      role: r.name,
      permissions: {},
      description: r.description || '',
    }));
  }

  async getRolePermissionsByRole(role: string): Promise<RolePermissions | null> {
    const permissions = await this.getRolePermissions();
    return permissions.find(p => p.role === role) || null;
  }

  async getAuditLogs(_hospitalId?: string): Promise<any[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/audit-logs/`, {
        headers: this.getAuthHeader(),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data || data.results || [];
    } catch {
      return [];
    }
  }

  // Helper functions to check specific permissions
  canRead(permissions: RolePermissions, resource: string): boolean {
    const perm = permissions.permissions[resource as keyof typeof permissions.permissions];
    return perm?.read || false;
  }

  canWrite(permissions: RolePermissions, resource: string): boolean {
    const perm = permissions.permissions[resource as keyof typeof permissions.permissions];
    return perm?.write || false;
  }

  canAdmin(permissions: RolePermissions, resource: string): boolean {
    const perm = permissions.permissions[resource as keyof typeof permissions.permissions];
    return perm?.admin || false;
  }

  // Check if user has admin role
  isAdmin(role: string): boolean {
    return role === 'admin';
  }

  // Check if user can manage users
  canManageUsers(permissions: RolePermissions): boolean {
    return this.canAdmin(permissions, 'user_management') || this.isAdmin(permissions.role);
  }

  // Check if user can access reports
  canAccessReports(permissions: RolePermissions): boolean {
    return this.canRead(permissions, 'reports');
  }

  // Check if user can manage inventory
  canManageInventory(permissions: RolePermissions): boolean {
    return this.canWrite(permissions, 'inventory');
  }

  // Check if user can approve resource requests
  canApproveRequests(permissions: RolePermissions): boolean {
    return this.canWrite(permissions, 'sharing') || this.isAdmin(permissions.role);
  }
}

export const roleService = new RoleService();