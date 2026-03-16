import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';

const mockNavigate = vi.fn();
const getUnreadCount = vi.fn();
const getBroadcasts = vi.fn();
const markRead = vi.fn();
const getConversations = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock('@/components/layout/LanguageToggle', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
  LanguageToggle: () => <div data-testid="language-toggle" />,
}));

vi.mock('@/hooks/use-scroll-restoration', () => ({
  useScrollRestoration: () => ({
    saveScrollPosition: vi.fn(),
  }),
}));

vi.mock('@/components/layout/AppSidebar', () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@/services/api', () => ({
  broadcastsApi: {
    getUnreadCount: (...args: unknown[]) => getUnreadCount(...args),
    getAll: (...args: unknown[]) => getBroadcasts(...args),
    markRead: (...args: unknown[]) => markRead(...args),
  },
  conversationsApi: {
    getAll: (...args: unknown[]) => getConversations(...args),
  },
}));

describe('AppLayout broadcast bell alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUnreadCount.mockResolvedValue({ data: { unread_count: 2 } });
    getBroadcasts.mockResolvedValue({
      data: [
        {
          id: 'b-1',
          title: 'Urgent oxygen support',
          message: 'Need immediate oxygen cylinders for emergency surgeries.',
          created_at: '2026-03-15T10:00:00Z',
          is_read: false,
        },
        {
          id: 'b-2',
          title: 'Blood support',
          message: 'Need O- blood units.',
          created_at: '2026-03-15T09:00:00Z',
          is_read: true,
        },
      ],
    });
    getConversations.mockResolvedValue({ data: [] });
    markRead.mockResolvedValue({ success: true });
  });

  it('shows unread badge, preview list, and navigates to emergency page on click', async () => {
    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>
    );

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    expect(screen.getByText('2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open emergency broadcast alerts/i }));

    expect(await screen.findByText('Emergency Alerts')).toBeInTheDocument();
    expect(screen.getByText('Urgent oxygen support')).toBeInTheDocument();
    expect(screen.getByText(/Need immediate oxygen cylinders/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Urgent oxygen support'));

    expect(markRead).toHaveBeenCalledWith('b-1');
    expect(mockNavigate).toHaveBeenCalledWith('/communication/emergency', {
      state: { highlightBroadcastId: 'b-1', openDetails: true },
    });
  });
});
