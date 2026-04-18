import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { useBroadcastStore } from '@/store/broadcastStore';

const mockUseAuth = vi.hoisted(() => vi.fn());
const getUnreadCount = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/components/layout/LanguageToggle', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/services/api', () => ({
  broadcastsApi: {
    getUnreadCount: (...args: unknown[]) => getUnreadCount(...args),
  },
}));

describe('AppSidebar ML role navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBroadcastStore.getState().resetBroadcastStore();

    mockUseAuth.mockImplementation(() => ({
      user: {
        id: 'ml-1',
        email: 'ml.admin@example.com',
        full_name: 'ML Admin',
        context: 'PLATFORM',
        role: 'ML_ADMIN',
        roles: ['ML_ADMIN'],
        platform_roles: ['ML_ADMIN'],
        hospital_role: null,
        hospital_id: null,
        effective_permissions: ['ml:job.view', 'ml:job.manage', 'ml:forecast.view', 'ml:outbreak.view'],
      },
      logout: vi.fn(),
    }));

    getUnreadCount.mockResolvedValue({ data: { unread_count: 0 } });
  });

  it('renders ML Insights navigation for ML_ADMIN without hospital context', async () => {
    render(
      <MemoryRouter initialEntries={['/ml/operations']}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('ML Operations')).toBeInTheDocument();
    expect(screen.getByText('Insights Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('ML Insights')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.dashboard')).not.toBeInTheDocument();
  });

  it('hides ML dashboard navigation for SYSTEM_ADMIN role', async () => {
    mockUseAuth.mockImplementation(() => ({
      user: {
        id: 'sys-1',
        email: 'system.admin@example.com',
        full_name: 'System Admin',
        context: 'PLATFORM',
        role: 'SYSTEM_ADMIN',
        roles: ['SYSTEM_ADMIN'],
        platform_roles: ['SYSTEM_ADMIN'],
        hospital_role: null,
        hospital_id: null,
        effective_permissions: ['ml:job.view', 'ml:forecast.view', 'platform:audit.view'],
      },
      logout: vi.fn(),
    }));

    render(
      <MemoryRouter initialEntries={['/admin/analytics']}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.queryByText('ML Operations')).not.toBeInTheDocument();
    expect(screen.queryByText('Insights Dashboard')).not.toBeInTheDocument();
  });

  it('shows inventory ML and CSV pages for hospital clients with inventory access', async () => {
    mockUseAuth.mockImplementation(() => ({
      user: {
        id: 'hospital-1',
        email: 'hospital.admin@example.com',
        full_name: 'Hospital Admin',
        context: 'HEALTHCARE',
        role: 'HEALTHCARE_ADMIN',
        roles: ['HEALTHCARE_ADMIN'],
        platform_roles: [],
        hospital_role: 'HEALTHCARE_ADMIN',
        hospital_id: 'fac-1',
        effective_permissions: ['hospital:inventory.view'],
      },
      logout: vi.fn(),
    }));

    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('Forecasting')).toBeInTheDocument();
    expect(screen.getByText('Outbreak Prediction')).toBeInTheDocument();
    expect(screen.getByText('CSV Import Center')).toBeInTheDocument();
  });

  it('shows administrator hospital workflows for healthcare admin scope', async () => {
    mockUseAuth.mockImplementation(() => ({
      user: {
        id: 'hospital-admin-1',
        email: 'healthcare.admin@example.com',
        full_name: 'Healthcare Admin',
        context: 'HEALTHCARE',
        role: 'HEALTHCARE_ADMIN',
        roles: ['HEALTHCARE_ADMIN'],
        platform_roles: [],
        hospital_role: 'HEALTHCARE_ADMIN',
        hospital_id: 'fac-1',
        effective_permissions: ['hospital:hospital.update'],
      },
      logout: vi.fn(),
    }));

    render(
      <MemoryRouter initialEntries={['/hospital-admin/offboarding-request']}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('Healthcare Update Requests')).toBeInTheDocument();
    expect(screen.getByText('Request Offboarding')).toBeInTheDocument();
  });
});
