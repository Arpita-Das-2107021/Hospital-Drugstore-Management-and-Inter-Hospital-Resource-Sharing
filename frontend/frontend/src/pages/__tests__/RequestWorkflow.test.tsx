import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestWorkflow from '@/pages/RequestWorkflow';

const getAll = vi.fn();
const approve = vi.fn();
const dispatch = vi.fn();
const confirmDelivery = vi.fn();
const update = vi.fn();
const getShipments = vi.fn();
const addTracking = vi.fn();
const confirmHandover = vi.fn();
const getStaff = vi.fn();
const mockToast = vi.fn();

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      hospital_id: 'hospital-owner-1',
    },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/api', () => ({
  requestsApi: {
    getAll: (...args: unknown[]) => getAll(...args),
    approve: (...args: unknown[]) => approve(...args),
    dispatch: (...args: unknown[]) => dispatch(...args),
    confirmDelivery: (...args: unknown[]) => confirmDelivery(...args),
    update: (...args: unknown[]) => update(...args),
  },
  shipmentsApi: {
    getAll: (...args: unknown[]) => getShipments(...args),
    addTracking: (...args: unknown[]) => addTracking(...args),
    confirmHandover: (...args: unknown[]) => confirmHandover(...args),
  },
  staffApi: {
    getAll: (...args: unknown[]) => getStaff(...args),
  },
}));

describe('RequestWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockResolvedValue({
      data: [
        {
          id: 'req-1',
          catalog_item_name: 'Ventilator',
          catalog_item: 'cat-1',
          requesting_hospital: 'hospital-requester-1',
          requesting_hospital_name: 'City Hospital',
          supplying_hospital: 'hospital-owner-1',
          supplying_hospital_name: 'Owner Hospital',
          quantity_requested: 3,
          priority: 'urgent',
          status: 'pending',
          created_at: '2026-03-10T10:00:00Z',
        },
        {
          id: 'req-2',
          catalog_item_name: 'Ventilator',
          catalog_item: 'cat-1',
          requesting_hospital: 'hospital-requester-2',
          requesting_hospital_name: 'General Hospital',
          supplying_hospital: 'hospital-owner-1',
          supplying_hospital_name: 'Owner Hospital',
          quantity_requested: 2,
          priority: 'normal',
          status: 'pending',
          created_at: '2026-03-10T11:00:00Z',
        },
        {
          id: 'req-3',
          catalog_item_name: 'Blood Bag',
          catalog_item: 'cat-2',
          requesting_hospital: 'hospital-owner-1',
          requesting_hospital_name: 'Owner Hospital',
          supplying_hospital: 'hospital-supplier-2',
          supplying_hospital_name: 'Supplier Hospital',
          quantity_requested: 1,
          priority: 'normal',
          status: 'approved',
          created_at: '2026-03-10T12:00:00Z',
        },
      ],
    });
    getShipments.mockResolvedValue({ data: [] });
    getStaff.mockResolvedValue({ data: [] });
    approve.mockResolvedValue({ success: true });
    dispatch.mockResolvedValue({ success: true });
    confirmDelivery.mockResolvedValue({ success: true });
    update.mockResolvedValue({ success: true });
    addTracking.mockResolvedValue({ success: true });
    confirmHandover.mockResolvedValue({ success: true });
  });

  it('shows classic request workflow layout and request list', async () => {
    render(<RequestWorkflow />);

    expect(await screen.findByText('Incoming Requests by Shared Resource')).toBeInTheDocument();
    expect(screen.getByText('Sorting and Filters')).toBeInTheDocument();
    expect(screen.getAllByText('Ventilator').length).toBeGreaterThan(0);
  });

  it('approves a requested sender-side request', async () => {
    render(<RequestWorkflow />);

    const approveButtons = await screen.findAllByRole('button', { name: /approve request/i });
    await userEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ decision: 'approved', quantity_approved: 3 })
      );
    });
  });
});
