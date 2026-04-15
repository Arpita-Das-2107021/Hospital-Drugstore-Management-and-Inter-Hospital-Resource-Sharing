import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OffboardingRequests from '@/pages/system-admin/OffboardingRequests';

const listAdminRequests = vi.fn();
const approve = vi.fn();
const reject = vi.fn();
const sendReviewEmail = vi.fn();
const getById = vi.fn();
const getHospitalById = vi.fn();
const mockToast = vi.fn();

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/api', () => ({
  offboardingApi: {
    listAdminRequests: (...args: unknown[]) => listAdminRequests(...args),
    approve: (...args: unknown[]) => approve(...args),
    reject: (...args: unknown[]) => reject(...args),
    sendReviewEmail: (...args: unknown[]) => sendReviewEmail(...args),
    getById: (...args: unknown[]) => getById(...args),
  },
  hospitalsApi: {
    getById: (...args: unknown[]) => getHospitalById(...args),
  },
}));

describe('system-admin/OffboardingRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listAdminRequests.mockResolvedValue({
      data: [
        {
          id: 'off-1',
          hospital: 'hospital-1',
          hospital_name: 'City Hospital',
          requested_by_name: 'Admin One',
          reason: 'Need to offboard due to system migration.',
          status: 'pending',
        },
      ],
    });

    approve.mockResolvedValue({ success: true });
    reject.mockResolvedValue({ success: true });
    sendReviewEmail.mockResolvedValue({ success: true });
    getById.mockResolvedValue({});

    getHospitalById.mockResolvedValue({
      data: {
        id: 'hospital-1',
        email: 'ops@city.test',
      },
    });
  });

  it('opens review email modal and sends review email', async () => {
    render(<OffboardingRequests />);

    expect(await screen.findByText('City Hospital')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^review email$/i }));

    expect(await screen.findByText('Review and send an email about this offboarding request.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ops@city.test')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /send review email/i }));

    expect(sendReviewEmail).toHaveBeenCalledWith(
      'off-1',
      expect.objectContaining({
        recipient_email: 'ops@city.test',
        subject: expect.stringContaining('City Hospital'),
      })
    );
  });
});
