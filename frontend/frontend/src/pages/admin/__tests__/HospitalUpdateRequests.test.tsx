import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HospitalUpdateRequests from '@/pages/admin/HospitalUpdateRequests';

const getAll = vi.fn();
const approve = vi.fn();
const reject = vi.fn();
const mockToast = vi.fn();

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/api', () => ({
  hospitalUpdateRequestsApi: {
    getAll: (...args: unknown[]) => getAll(...args),
    approve: (...args: unknown[]) => approve(...args),
    reject: (...args: unknown[]) => reject(...args),
  },
}));

describe('HospitalUpdateRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockResolvedValue({
      data: [
        {
          id: 'req-1',
          hospital_name: 'City Hospital',
          requested_by_name: 'Admin One',
          status: 'pending',
          requested_changes: { email: 'new@city.test' },
          current_values: { email: 'old@city.test' },
        },
      ],
    });
    approve.mockResolvedValue({ success: true });
    reject.mockResolvedValue({ success: true });
  });

  it('loads requests and approves pending update', async () => {
    render(<HospitalUpdateRequests />);

    expect(await screen.findByText('City Hospital')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(approve).toHaveBeenCalledWith('req-1', undefined);
  });
});
