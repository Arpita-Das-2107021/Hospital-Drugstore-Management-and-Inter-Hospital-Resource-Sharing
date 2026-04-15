import { render, screen } from '@testing-library/react';
import HospitalUpdateRequests from '@/pages/hospital-admin/HospitalUpdateRequests';

const getMyHospital = vi.fn();
const getAll = vi.fn();
const acknowledgeHealthcareBadges = vi.fn();
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
      hospital_id: 'hospital-1',
      full_name: 'Hospital Admin',
      email: 'admin@hospital.test',
    },
  }),
}));

vi.mock('@/services/api', () => ({
  hospitalsApi: {
    getMyHospital: (...args: unknown[]) => getMyHospital(...args),
    updateMyHospital: vi.fn(),
  },
  hospitalUpdateRequestsApi: {
    getAll: (...args: unknown[]) => getAll(...args),
  },
  badgesApi: {
    acknowledgeHealthcareBadges: (...args: unknown[]) => acknowledgeHealthcareBadges(...args),
  },
}));

describe('hospital-admin/HospitalUpdateRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getMyHospital.mockResolvedValue({
      data: {
        id: 'hospital-1',
        name: 'City Hospital',
        hospital_type: 'general',
        city: 'Dhaka',
      },
    });

    getAll.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        limit: 50,
        total: 0,
        total_pages: 1,
      },
    });
    acknowledgeHealthcareBadges.mockResolvedValue({ success: true });
  });

  it('does not show a pending request when backend history and pending payload are empty', async () => {
    render(<HospitalUpdateRequests />);

    expect(await screen.findByText('No pending healthcare update request is active.')).toBeInTheDocument();
    expect(acknowledgeHealthcareBadges).toHaveBeenCalled();
    expect(screen.queryByText('A request is already pending approval')).not.toBeInTheDocument();
  });
});
