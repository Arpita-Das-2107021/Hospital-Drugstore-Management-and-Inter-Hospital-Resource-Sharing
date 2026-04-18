import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute permission guards', () => {
  const renderPermissionGuard = (
    requiredPermissions: string[],
    options?: {
      requireAllPermissions?: boolean;
      requiredContext?: 'PLATFORM' | 'HEALTHCARE';
      fallbackPath?: string;
    },
  ) => {
    render(
      <MemoryRouter initialEntries={['/secure']}>
        <Routes>
          <Route
            path="/secure"
            element={
              <ProtectedRoute
                requiredPermissions={requiredPermissions}
                requireAllPermissions={options?.requireAllPermissions}
                requiredContext={options?.requiredContext}
                fallbackPath={options?.fallbackPath}
              >
                <div>Secure Area</div>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard Home</div>} />
          <Route path="/profile" element={<div>Profile Home</div>} />
          <Route path="/admin/hospital-registrations" element={<div>Platform Admin Home</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows access when user has a required permission', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'STAFF',
        roles: ['STAFF'],
        platform_roles: [],
        hospital_role: 'STAFF',
        context: 'HEALTHCARE',
        healthcare_id: 'hospital-1',
        hospital_id: 'hospital-1',
        effective_permissions: ['hospital:inventory.view'],
      },
    });

    renderPermissionGuard(['hospital:inventory.view']);

    expect(screen.getByText('Secure Area')).toBeInTheDocument();
  });

  it('allows super admin via compatibility permissions when payload is partial', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        platform_roles: ['SUPER_ADMIN'],
        context: 'PLATFORM',
        hospital_role: null,
        hospital_id: null,
        // Real backend payload can be partial for this account.
        effective_permissions: ['platform:user.view'],
      },
    });

    renderPermissionGuard(['platform:hospital.review']);

    expect(screen.getByText('Secure Area')).toBeInTheDocument();
  });

  it('redirects to login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
    });

    renderPermissionGuard(['hospital:inventory.view']);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders explicit 403 when required permission is missing', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'STAFF',
        roles: ['STAFF'],
        platform_roles: [],
        hospital_role: 'STAFF',
        context: 'HEALTHCARE',
        healthcare_id: 'hospital-1',
        hospital_id: 'hospital-1',
        effective_permissions: ['hospital:inventory.view'],
      },
    });

    renderPermissionGuard(['platform:hospital.review']);

    expect(screen.getByText('Access denied (403)')).toBeInTheDocument();
  });

  it('enforces requireAllPermissions when enabled', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'PLATFORM_ADMIN',
        roles: ['PLATFORM_ADMIN'],
        platform_roles: [],
        context: 'PLATFORM',
        hospital_role: null,
        hospital_id: null,
        effective_permissions: ['platform:hospital.review', 'platform:hospital.manage'],
      },
    });

    renderPermissionGuard(['platform:hospital.review', 'platform:hospital.manage'], { requireAllPermissions: true });

    expect(screen.getByText('Secure Area')).toBeInTheDocument();
  });

  it('denies platform-only users when hospital context is required', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        platform_roles: ['SUPER_ADMIN'],
        context: 'PLATFORM',
        hospital_role: null,
        hospital_id: null,
        effective_permissions: ['platform:user.view'],
      },
    });

    renderPermissionGuard(['hospital:inventory.view'], { requiredContext: 'HEALTHCARE' });

    expect(screen.getByText('Access denied (403)')).toBeInTheDocument();
    expect(screen.getByText('This page requires HEALTHCARE workspace context.')).toBeInTheDocument();
  });

  it('renders 403 even when custom fallback path is supplied', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'STAFF',
        roles: ['STAFF'],
        platform_roles: [],
        hospital_role: 'STAFF',
        context: 'HEALTHCARE',
        healthcare_id: 'hospital-1',
        hospital_id: 'hospital-1',
        effective_permissions: ['hospital:inventory.view'],
      },
    });

    renderPermissionGuard(['platform:hospital.review'], { fallbackPath: '/profile' });

    expect(screen.getByText('Access denied (403)')).toBeInTheDocument();
  });

  it('shows explicit 403 when denied on admin home route', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        role: 'STAFF',
        roles: ['STAFF'],
        platform_roles: [],
        hospital_role: 'STAFF',
        context: 'HEALTHCARE',
        healthcare_id: 'hospital-1',
        hospital_id: 'hospital-1',
        effective_permissions: ['hospital:inventory.view', 'dashboard:view'],
      },
    });

    render(
      <MemoryRouter initialEntries={['/admin/hospital-registrations']}>
        <Routes>
          <Route
            path="/admin/hospital-registrations"
            element={
              <ProtectedRoute requiredPermissions={['platform:hospital.review']}>
                <div>Platform Admin Home</div>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard Home</div>} />
          <Route path="/profile" element={<div>Profile Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Access denied (403)')).toBeInTheDocument();
  });
});
