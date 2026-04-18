import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { BROADCASTS_UPDATED_EVENT, CHAT_UPDATED_EVENT } from '@/constants/events';
import { useBroadcastStore } from '@/store/broadcastStore';

const mockNavigate = vi.fn();
const getUnreadCount = vi.fn();
const getBroadcasts = vi.fn();
const markRead = vi.fn();
const getGlobalChatUnreadCount = vi.fn();
const getConversations = vi.fn();
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockGetAccessToken = vi.hoisted(() => vi.fn());

type WebSocketConstructorMock = ReturnType<typeof vi.fn> & {
  OPEN: number;
  CONNECTING: number;
  CLOSING: number;
  CLOSED: number;
};

const createWebSocketConstructorMock = (): WebSocketConstructorMock => {
  const constructor = vi.fn((url: string) => ({
    url,
    readyState: 1,
    onmessage: null,
    onclose: null,
    onopen: null,
    onerror: null,
    send: vi.fn(),
    close: vi.fn(),
  })) as unknown as WebSocketConstructorMock;

  constructor.OPEN = 1;
  constructor.CONNECTING = 0;
  constructor.CLOSING = 2;
  constructor.CLOSED = 3;

  return constructor;
};

const defaultAuthState = {
  isAuthenticated: true,
  user: {
    id: 'u-1',
    email: 'staff@example.com',
    full_name: 'Staff User',
    role: 'STAFF',
    roles: ['STAFF'],
    platform_roles: [],
    context: 'HEALTHCARE',
    healthcare_id: 'hospital-1',
    hospital_role: 'STAFF',
    hospital_id: 'hospital-1',
    effective_permissions: [
      'communication:chat.view',
      'communication:conversation.view',
      'communication:broadcast.read',
      'communication:broadcast.respond',
      'communication:broadcast.view',
    ],
  },
};

let mockAuthState = { ...defaultAuthState };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<unknown>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/services/authService', () => ({
  default: {
    getAccessToken: mockGetAccessToken,
  },
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
    getGlobalUnreadCount: (...args: unknown[]) => getGlobalChatUnreadCount(...args),
    getAll: (...args: unknown[]) => getConversations(...args),
  },
}));

describe('AppLayout broadcast bell alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBroadcastStore.getState().resetBroadcastStore();
    mockAuthState = { ...defaultAuthState, user: { ...defaultAuthState.user } };
    mockUseAuth.mockImplementation(() => mockAuthState);
    mockGetAccessToken.mockReturnValue(null);

    getUnreadCount.mockResolvedValue({ data: { unread_count: 2 } });
    getGlobalChatUnreadCount.mockResolvedValue({ data: { total_unread: 0 } });
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('uses cached unread badge value without unread endpoint refetch on quick navigation remount', async () => {
    useBroadcastStore.setState({ unreadCount: 5, lastFetchedAt: Date.now() });

    const { unmount } = render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    await waitFor(() => expect(getUnreadCount).not.toHaveBeenCalled());

    unmount();

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    await waitFor(() => expect(getUnreadCount).not.toHaveBeenCalled());
  });

  it('calls broadcast unread-count API and uses it for alert badge when user has broadcast center permission', async () => {
    mockAuthState = {
      isAuthenticated: true,
      user: {
        id: 'ops-1',
        email: 'ops.user@example.com',
        full_name: 'Ops User',
        role: 'HEALTHCARE_ADMIN',
        roles: ['HEALTHCARE_ADMIN'],
        platform_roles: [],
        context: 'HEALTHCARE',
        healthcare_id: 'hospital-ops-1',
        hospital_role: 'HEALTHCARE_ADMIN',
        hospital_id: 'hospital-ops-1',
        effective_permissions: ['communication:broadcast.view'],
      },
    };
    mockUseAuth.mockImplementation(() => mockAuthState);

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('applies local unread delta updates from broadcast event without forcing unread refetch', async () => {
    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(BROADCASTS_UPDATED_EVENT, {
          detail: {
            decrementUnread: 1,
          },
        }),
      );
    });

    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('updates broadcast unread badge from websocket unread_count.updated event', async () => {
    const webSocketMock = createWebSocketConstructorMock();
    vi.stubGlobal('WebSocket', webSocketMock as unknown as typeof WebSocket);
    mockGetAccessToken.mockReturnValue('token-broadcast');

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await waitFor(() => expect(webSocketMock).toHaveBeenCalled());
    const wsUrl = String(webSocketMock.mock.calls[0]?.[0] || '');
    expect(wsUrl).toContain('/ws/broadcasts/');

    const socketInstance = webSocketMock.mock.results[0]?.value as {
      onmessage: ((event: { data: string }) => void) | null;
    };

    await act(async () => {
      socketInstance.onmessage?.({
        data: JSON.stringify({
          event: 'unread_count.updated',
          data: {
            total_unread: 5,
            unread_count: 5,
          },
        }),
      });
    });

    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  it('re-fetches unread count on broadcast.created when websocket payload omits unread totals', async () => {
    const webSocketMock = createWebSocketConstructorMock();
    vi.stubGlobal('WebSocket', webSocketMock as unknown as typeof WebSocket);
    mockGetAccessToken.mockReturnValue('token-broadcast');
    getUnreadCount
      .mockResolvedValueOnce({ data: { unread_count: 0 } })
      .mockResolvedValueOnce({ data: { unread_count: 0 } });

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(1));

    const socketInstance = webSocketMock.mock.results[0]?.value as {
      onmessage: ((event: { data: string }) => void) | null;
    };

    await act(async () => {
      socketInstance.onmessage?.({
        data: JSON.stringify({
          event: 'broadcast.created',
          data: {
            id: 'b-new',
            title: 'Created elsewhere',
          },
        }),
      });
    });

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(2));
    expect(useBroadcastStore.getState().unreadCount).toBe(0);
  });

  it('does not reconnect broadcast websocket after non-retryable close codes', async () => {
    const webSocketMock = createWebSocketConstructorMock();
    vi.stubGlobal('WebSocket', webSocketMock as unknown as typeof WebSocket);
    mockGetAccessToken.mockReturnValue('token-broadcast');

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await waitFor(() => expect(webSocketMock).toHaveBeenCalledTimes(1));

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const socketInstance = webSocketMock.mock.results[0]?.value as {
      onclose: ((event: CloseEvent) => void) | null;
    };

    await act(async () => {
      socketInstance.onclose?.({ code: 1000 } as CloseEvent);
    });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('increases reconnect backoff when websocket repeatedly opens then closes quickly', async () => {
    const webSocketMock = createWebSocketConstructorMock();
    vi.stubGlobal('WebSocket', webSocketMock as unknown as typeof WebSocket);
    mockGetAccessToken.mockReturnValue('token-broadcast');
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    await waitFor(() => expect(webSocketMock).toHaveBeenCalledTimes(1));

    const firstSocket = webSocketMock.mock.results[0]?.value as {
      onopen: (() => void) | null;
      onclose: ((event: CloseEvent) => void) | null;
    };

    await act(async () => {
      firstSocket.onopen?.();
    });

    await act(async () => {
      firstSocket.onclose?.({ code: 1006 } as CloseEvent);
    });

    const firstReconnectCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 2000);
    expect(firstReconnectCall).toBeDefined();

    const firstReconnectCallback = firstReconnectCall?.[0] as (() => void) | undefined;
    expect(firstReconnectCallback).toBeDefined();

    await act(async () => {
      firstReconnectCallback?.();
    });

    await waitFor(() => expect(webSocketMock).toHaveBeenCalledTimes(2));

    const secondSocket = webSocketMock.mock.results[1]?.value as {
      onopen: (() => void) | null;
      onclose: ((event: CloseEvent) => void) | null;
    };

    await act(async () => {
      secondSocket.onopen?.();
    });

    await act(async () => {
      secondSocket.onclose?.({ code: 1006 } as CloseEvent);
    });

    const hasBackoffToFourSeconds = setTimeoutSpy.mock.calls.some(([, delay]) => delay === 4000);
    expect(hasBackoffToFourSeconds).toBe(true);
  });

  it('renders chat badge from global unread endpoint total_unread', async () => {
    getUnreadCount.mockResolvedValue({ data: { unread_count: 0 } });
    getBroadcasts.mockResolvedValue({ data: [] });
    getGlobalChatUnreadCount.mockResolvedValue({ data: { total_unread: 7 } });

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>
    );

    await waitFor(() => expect(getGlobalChatUnreadCount).toHaveBeenCalled());
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('updates chat badge when chat update event is dispatched', async () => {
    getUnreadCount.mockResolvedValue({ data: { unread_count: 0 } });
    getBroadcasts.mockResolvedValue({ data: [] });
    getGlobalChatUnreadCount.mockResolvedValue({ data: { total_unread: 0 } });

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>
    );

    await waitFor(() => expect(getGlobalChatUnreadCount).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CHAT_UPDATED_EVENT, {
          detail: {
            unreadMessages: 4,
          },
        }),
      );
    });

    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('skips chat unread polling and hides chat link without healthcare context', async () => {
    mockAuthState = {
      isAuthenticated: true,
      user: {
        id: 'admin-1',
        email: 'super.admin@example.com',
        full_name: 'Super Admin',
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        platform_roles: ['SUPER_ADMIN'],
        context: 'PLATFORM',
        hospital_role: null,
        hospital_id: null,
        effective_permissions: ['platform:hospital.review', 'platform:hospital.manage'],
      },
    };
    mockUseAuth.mockImplementation(() => mockAuthState);

    render(
      <MemoryRouter>
        <AppLayout title="Dashboard">
          <div>Content</div>
        </AppLayout>
      </MemoryRouter>
    );

    await waitFor(() => expect(getGlobalChatUnreadCount).not.toHaveBeenCalled());
    expect(getUnreadCount).not.toHaveBeenCalled();
    expect(getGlobalChatUnreadCount).not.toHaveBeenCalled();
    expect(getConversations).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Open messages')).not.toBeInTheDocument();
  });
});
