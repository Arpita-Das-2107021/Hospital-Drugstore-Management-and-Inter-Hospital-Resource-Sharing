import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmergencyBroadcastPage from '@/pages/EmergencyBroadcastPage';
import { BROADCASTS_UPDATED_EVENT } from '@/constants/events';

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
  role: 'STAFF',
  hospital_id: 'hospital-1',
};

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
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

describe('EmergencyBroadcastPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.role = 'STAFF';
    mockUser.hospital_id = 'hospital-1';
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
    expect(screen.getByText('Unread: 2')).toBeInTheDocument();
    expect(screen.getByText('Total: 3')).toBeInTheDocument();
  });

  it('decreases unread count when marking one broadcast as read', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Unread: 2');
    await userEvent.click(screen.getAllByRole('button', { name: /mark read/i })[0]);

    expect(markRead).toHaveBeenCalledWith('b-1');
    await waitFor(() => expect(screen.getByText('Unread: 1')).toBeInTheDocument());
  });

  it('marks broadcasts as read in bulk', async () => {
    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Unread: 2');
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(markRead).toHaveBeenCalledWith('b-1');
    expect(markRead).toHaveBeenCalledWith('b-2');
    expect(screen.getByText('Unread: 0')).toBeInTheDocument();
  });

  it('submits a response and marks the broadcast as read', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <MemoryRouter>
        <EmergencyBroadcastPage />
      </MemoryRouter>
    );

    await screen.findByText('Urgent oxygen support');
    await userEvent.click(screen.getAllByRole('button', { name: /respond/i })[0]);
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
    expect(screen.queryByRole('button', { name: /view responses/i })).not.toBeInTheDocument();
  });

  it('hydrates response count for authorized users', async () => {
    mockUser.role = 'SUPER_ADMIN';
    mockUser.hospital_id = null as any;
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
    expect(screen.getByRole('button', { name: /view responses/i })).toBeInTheDocument();
  });
});
