import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OffboardingRequest from '@/pages/OffboardingRequest';

const submitOffboardingRequest = vi.fn();
const mockToast = vi.fn();

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      role: 'HOSPITAL_ADMIN',
      hospital_id: 'hospital-1',
    },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/api', () => ({
  hospitalsApi: {
    submitOffboardingRequest: (...args: unknown[]) => submitOffboardingRequest(...args),
  },
}));

describe('OffboardingRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitOffboardingRequest.mockResolvedValue({ success: true, data: { detail: 'submitted' } });
  });

  it('submits reason to hospital scoped offboarding endpoint', async () => {
    render(<OffboardingRequest />);

    await userEvent.type(screen.getByLabelText(/reason/i), 'Hospital merger');
    await userEvent.click(screen.getByRole('button', { name: /submit offboarding request/i }));

    expect(submitOffboardingRequest).toHaveBeenCalledWith('hospital-1', 'Hospital merger');
  });
});
