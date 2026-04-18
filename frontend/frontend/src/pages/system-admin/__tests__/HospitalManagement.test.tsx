import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HospitalManagement from '@/pages/system-admin/HospitalManagement';

const getAll = vi.fn();
const verify = vi.fn();
const suspend = vi.fn();
const adminOffboard = vi.fn();
const sendOffboardingReviewEmail = vi.fn();
const getById = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'platform-user-1',
      email: 'admin@platform.test',
      full_name: 'Platform Reviewer',
    },
  }),
}));

vi.mock('@/services/api', () => ({
  hospitalsApi: {
    getAll: (...args: unknown[]) => getAll(...args),
    verify: (...args: unknown[]) => verify(...args),
    suspend: (...args: unknown[]) => suspend(...args),
    adminOffboard: (...args: unknown[]) => adminOffboard(...args),
    sendOffboardingReviewEmail: (...args: unknown[]) => sendOffboardingReviewEmail(...args),
    getById: (...args: unknown[]) => getById(...args),
  },
}));

describe('system-admin/HospitalManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAll.mockResolvedValue({
      data: [
        {
          id: 'hospital-1',
          name: 'City Hospital',
          registration_number: 'REG-1',
          email: 'ops@city.test',
          phone: '123456',
          city: 'Dhaka',
          state: 'Dhaka',
          country: 'Bangladesh',
          hospital_type: 'general',
          verified_status: 'verified',
          is_active: true,
          bed_capacity: 250,
          created_at: '2026-01-01T10:00:00Z',
        },
      ],
    });

    verify.mockResolvedValue({ success: true });
    suspend.mockResolvedValue({ success: true });
    adminOffboard.mockResolvedValue({ success: true });
    sendOffboardingReviewEmail.mockResolvedValue({ success: true });
    getById.mockResolvedValue({
      data: {
        id: 'hospital-1',
        email: 'ops@city.test',
      },
    });
  });

  it('opens review email modal and sends custom reason message', async () => {
    render(<HospitalManagement />);

    expect(await screen.findByText('City Hospital')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^review email$/i }));

    expect(await screen.findByText('Send a review email for this healthcare profile.')).toBeInTheDocument();

    const messageField = screen.getByLabelText('Message');
    await userEvent.clear(messageField);
    await userEvent.type(
      messageField,
      'Reason: policy non-compliance documented by system admin.'
    );

    await userEvent.click(screen.getByRole('button', { name: /send review email/i }));

    expect(sendOffboardingReviewEmail).toHaveBeenCalledWith(
      'hospital-1',
      expect.objectContaining({
        recipient_email: 'ops@city.test',
        message: expect.stringContaining('policy non-compliance'),
      })
    );
  });
});
