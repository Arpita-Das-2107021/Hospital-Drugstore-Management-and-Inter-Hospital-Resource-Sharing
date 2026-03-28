/**
 * Role and Permission Service - Role-based access control
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  async getRolePermissions(): Promise<RolePermissions[]> {
    const response = await fetch(`${API_BASE_URL}/permissions/`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch role permissions');
    }

    const data = await response.json();
    return data.results || data;
  }

  async getRolePermissionsByRole(role: string): Promise<RolePermissions | null> {
    const permissions = await this.getRolePermissions();
    return permissions.find(p => p.role === role) || null;
  }

  async getAuditLogs(hospitalId?: string): Promise<any[]> {
    let url = `${API_BASE_URL}/audit-logs/`;
    if (hospitalId) {
      url += `?hospital=${hospitalId}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch audit logs');
    }

    const data = await response.json();
    return data.results || data;
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