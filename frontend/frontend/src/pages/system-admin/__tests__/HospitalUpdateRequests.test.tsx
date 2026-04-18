import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HospitalUpdateRequests from '@/pages/system-admin/HospitalUpdateRequests';

const getAll = vi.fn();
const approve = vi.fn();
const reject = vi.fn();
const sendReviewEmail = vi.fn();
const getHospitalById = vi.fn();
const mockToast = vi.fn();

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'platform-admin-1',
      email: 'admin@example.com',
      full_name: 'Platform Admin',
      context: 'PLATFORM',
      access_mode: 'UI',
      healthcare_id: null,
      role: 'SUPER_ADMIN',
      roles: ['SUPER_ADMIN'],
      platform_roles: ['SUPER_ADMIN'],
      hospital_role: null,
      hospital_id: null,
      effective_permissions: ['platform:hospital.review'],
      permissions_by_scope: {
        platform_roles: ['platform:hospital.review'],
        hospital_role: [],
      },
    },
  }),
}));

vi.mock('@/services/api', () => ({
  hospitalUpdateRequestsApi: {
    getAll: (...args: unknown[]) => getAll(...args),
    approve: (...args: unknown[]) => approve(...args),
    reject: (...args: unknown[]) => reject(...args),
    sendReviewEmail: (...args: unknown[]) => sendReviewEmail(...args),
  },
  hospitalsApi: {
    getById: (...args: unknown[]) => getHospitalById(...args),
  },
}));

describe('HospitalUpdateRequests', () => {
  const pendingRequest = {
    id: 'req-1',
    hospital: 'hospital-1',
    hospital_name: 'City Hospital',
    requested_by_name: 'Admin One',
    hospital_email: 'ops@city.test',
    status: 'pending',
    requested_changes: { email: 'new@city.test' },
    current_values: { email: 'old@city.test' },
  };

  const approvedRequest = {
    id: 'req-2',
    hospital: 'hospital-2',
    hospital_name: 'Regional Clinic',
    requested_by_name: 'Admin Two',
    hospital_email: 'ops@regional.test',
    status: 'approved',
    requested_changes: { api_version: 'v2' },
    current_values: { api_version: 'v1' },
  };

  const rejectedRequest = {
    id: 'req-3',
    hospital: 'hospital-3',
    hospital_name: 'Metro Health',
    requested_by_name: 'Admin Three',
    hospital_email: 'ops@metro.test',
    status: 'rejected',
    requested_changes: { registration_number: 'REG-9' },
    current_values: { registration_number: 'REG-1' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockImplementation((params?: Record<string, string>) => {
      if (params?.pending_only === 'false') {
        return Promise.resolve({ data: [pendingRequest] });
      }

      if (params?.status === 'pending') {
        return Promise.resolve({ data: [pendingRequest] });
      }

      if (params?.status === 'approved' || params?.status === 'rejected') {
        return Promise.resolve({ data: [] });
      }

      return Promise.resolve({ data: [pendingRequest] });
    });

    approve.mockResolvedValue({ success: true });
    reject.mockResolvedValue({ success: true });
    sendReviewEmail.mockResolvedValue({ success: true });
    getHospitalById.mockResolvedValue({
      data: {
        id: 'hospital-1',
        email: 'ops@city.test',
      },
    });
  });

  it('loads processed history when backend default response is pending-only', async () => {
    getAll.mockImplementation((params?: Record<string, string>) => {
      if (params?.pending_only === 'false') {
        return Promise.resolve({ data: [pendingRequest] });
      }

      if (params?.status === 'pending') {
        return Promise.resolve({ data: [pendingRequest] });
      }

      if (params?.status === 'approved') {
        return Promise.resolve({ data: [approvedRequest] });
      }

      if (params?.status === 'rejected') {
        return Promise.resolve({ data: [rejectedRequest] });
      }

      return Promise.resolve({ data: [] });
    });

    render(<HospitalUpdateRequests />);

    expect(await screen.findByText('Regional Clinic')).toBeInTheDocument();
    expect(await screen.findByText('Metro Health')).toBeInTheDocument();
    expect(getAll).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(getAll).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });

  it('loads requests and approves pending update', async () => {
    render(<HospitalUpdateRequests />);

    expect(await screen.findByText('City Hospital')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(approve).toHaveBeenCalledWith('req-1', undefined);
  });

  it('opens review email modal and sends review email', async () => {
    render(<HospitalUpdateRequests />);

    expect(await screen.findByText('City Hospital')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^review email$/i }));

    expect(await screen.findByText('Review and send an email about this healthcare update request.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ops@city.test')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /send review email/i }));

    expect(sendReviewEmail).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({
        recipient_email: 'ops@city.test',
        subject: expect.stringContaining('City Hospital'),
      })
    );
  });
});
