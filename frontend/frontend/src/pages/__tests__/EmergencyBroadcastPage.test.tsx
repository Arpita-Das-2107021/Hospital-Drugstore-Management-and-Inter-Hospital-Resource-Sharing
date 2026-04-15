import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmergencyBroadcastPage from '@/pages/EmergencyBroadcastPage';
import { BROADCASTS_UPDATED_EVENT } from '@/constants/events';
import { useBroadcastStore } from '@/store/broadcastStore';

const getAll = vi.fn();
const create = vi.fn();
const respond = vi.fn();
const close = vi.fn();
const getResponses = vi.fn();
const markRead = vi.fn();
const getHospitals = vi.fn();
const mockToast = vi.fn();
const mockUser = {
  id: 'user-1',
  email: 'user1@hospital.test',
  role: 'STAFF',
  hospital_id: 'hospital-1',
  effective_permissions: ['communication:broadcast.read', 'communication:broadcast.respond'],
};

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: unknown }) => <div>{children}</div>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/api', () => ({
  broadcastsApi: {
    getAll: (...args: unknown[]) => getAll(...args),
    create: (...args: unknown[]) => create(...args),
    respond: (...args: unknown[]) => respond(...args),
    close: (...args: unknown[]) => close(...args),
    getResponses: (...args: unknown[]) => getResponses(...args),
    markRead: (...args: unknown[]) => markRead(...args),
  },
  hospitalsApi: {
    getAll: (...args: unknown[]) => getHospitals(...args),
  },
}));

const getStatCard = (label: string): HTMLElement => {
  const labelElement = screen.getByText(new RegExp(`^${label}$`, 'i'));
  const card = labelElement.closest('div');
  if (!card) {
    throw new Error(`Unable to resolve stat card for label: ${label}`);
  }
  return card;
};

const expectStatValue = (label: string, value: number): void => {
  expect(within(getStatCard(label)).getByText(String(value))).toBeInTheDocument();
};

describe('EmergencyBroadcastPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBroadcastStore.getState().resetBroadcastStore();
    mockUser.id = 'user-1';
    mockUser.email = 'user1@hospital.test';
    mockUser.role = 'STAFF';
    mockUser.hospital_id = 'hospital-1';
    mockUser.effective_permissions = ['communication:broadcast.read', 'communication:broadcast.respond'];
    getHospitals.mockResolvedValue({ data: [] });
    create.mockResolvedValue({ success: true, data: {} });
    close.mockResolvedValue({ success: true });
    getResponses.mockResolvedValue({ data: [] });
    respond.mockResolvedValue({ success: true });
    markRead.mockResolvedValue({ success: true });
    getAll.mockResolvedValue({
      data: [
        {
          id: 'b-1',
          title: 'Urgent oxygen support',
          message: 'Need cylinders',
          status: 'active',
          allow_response: true,
          is_read: false,
          created_at: '2026-03-15T10:00:00Z',
          responders_count: 0,
          created_by_id: 'other-user',
        },
        {
          id: 'b-2',
          title: 'Blood support',
          message: 'Need type O-',
          status: 'active',
          allow_response: true,
          is_read: false,
          created_at: '2026-03-15T10:01:00Z',
          responders_count: 1,
          created_by_id: 'other-user',
        },
        {
          id: 'b-3',
          title: 'General update',
          message: 'Status only',
          status: 'closed',
          allow_response: false,
          is_read: true,
          created_at: '2026-03-15T10:02:00Z',
          responders_count: 0,
          created_by_id: 'other-user',
          location: {
            lat: 23.810331,
            lng: 90.412521,
            address: 'Dhaka, Bangladesh',
          },
        },
      ],
    });
  });

  it('retrieves broadcasts and shows unread count only', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Urgent oxygen support')).toBeInTheDocument();
    expectStatValue('Unread', 2);
    expectStatValue('Total', 3);
  });

  it('shows clickable location metadata when a broadcast includes location', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('General update')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dhaka, bangladesh/i })).toBeInTheDocument();
  });

  it('decreases unread count when opening details for an unread broadcast', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    expectStatValue('Unread', 2);
    const urgentBroadcastButton = screen.getByRole('button', { name: /urgent oxygen support/i });
    const urgentBroadcastCard = urgentBroadcastButton.closest('div.rounded-xl');
    expect(urgentBroadcastCard).toBeTruthy();
    await userEvent.click(within(urgentBroadcastCard as HTMLElement).getByRole('button', { name: /details/i }));

    expect(markRead).toHaveBeenCalledWith('b-1');
    await waitFor(() => expectStatValue('Unread', 1));
  });

  it('marks broadcasts as read in bulk', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    expectStatValue('Unread', 2);
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(markRead).toHaveBeenCalledWith('b-1');
    expect(markRead).toHaveBeenCalledWith('b-2');
    expectStatValue('Unread', 0);
  });

  it('submits a response and marks the broadcast as read', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    const urgentBroadcastButton = screen.getByRole('button', { name: /urgent oxygen support/i });
    const urgentBroadcastCard = urgentBroadcastButton.closest('div.rounded-xl');
    expect(urgentBroadcastCard).toBeTruthy();
    await userEvent.click(within(urgentBroadcastCard as HTMLElement).getByRole('button', { name: /respond/i }));
    await userEvent.type(screen.getByLabelText(/response message/i), 'We can supply 10 cylinders');
    await userEvent.click(screen.getByRole('button', { name: /submit response/i }));

    await waitFor(() => {
      expect(respond).toHaveBeenCalledWith('b-1', {
        response: 'We can supply 10 cylinders',
      });
    });
    expect(markRead).toHaveBeenCalledWith('b-1');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: BROADCASTS_UPDATED_EVENT }));

    dispatchSpy.mockRestore();
  });

  it('hides view responses for unauthorized users', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    expect(screen.queryByRole('button', { name: /^responses$/i })).not.toBeInTheDocument();
  });

  it('shows view responses for sender without explicit permission', async () => {
    mockUser.id = 'other-user';

    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    expect(screen.getAllByRole('button', { name: /^responses$/i }).length).toBeGreaterThan(0);
  });

  it('shows close button only for broadcasts created by the current user', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

    mockUser.id = 'other-user';
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    expect(await screen.findAllByRole('button', { name: /close/i })).not.toHaveLength(0);
  });

  it('shows close button when sender ownership is resolved via sender email fields', async () => {
    mockUser.id = 'different-user';
    mockUser.email = 'owner@city-hospital.test';

    getAll.mockResolvedValue({
      data: [
        {
          id: 'b-email-owner',
          title: 'Email owned broadcast',
          message: 'Ownership should resolve by email',
          status: 'active',
          allow_response: true,
          is_read: false,
          created_at: '2026-03-15T12:00:00Z',
          responders_count: 0,
          sent_by: 'legacy-sender-id',
          sent_by_email: 'owner@city-hospital.test',
        },
      ],
    });

    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Email owned broadcast')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('blocks route-state response view access for unauthorized users', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/communication/emergency',
            state: { highlightBroadcastId: 'b-1', openResponses: true },
          },
        ]}
      >
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Access denied',
        }),
      );
    });
    expect(getResponses).not.toHaveBeenCalled();
  });

  it('does not grant response viewing from manage-only permission', async () => {
    mockUser.role = 'PLATFORM_ADMIN';
    mockUser.hospital_id = null as unknown;
    mockUser.effective_permissions = ['communication:broadcast.manage'];

    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    expect(screen.queryByRole('button', { name: /^responses$/i })).not.toBeInTheDocument();
  });

  it('hydrates response count for authorized users', async () => {
    mockUser.role = 'PLATFORM_ADMIN';
    mockUser.hospital_id = null as unknown;
    mockUser.effective_permissions = ['communication:broadcast.manage', 'broadcast:view_responses'];
    getAll.mockResolvedValue({
      data: [
        {
          id: 'b-1',
          title: 'Urgent oxygen support',
          message: 'Need cylinders',
          status: 'active',
          allow_response: true,
          is_read: false,
          created_at: '2026-03-15T10:00:00Z',
          responders_count: 0,
          created_by_id: 'other-user',
        },
      ],
    });
    getResponses.mockImplementation(async (id: string) => {
      if (id === 'b-1') {
        return { data: [{ id: 'r-1', response: 'We can help' }] };
      }
      return { data: [] };
    });

    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('1 responses')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^responses$/i })).toBeInTheDocument();
  });
});
