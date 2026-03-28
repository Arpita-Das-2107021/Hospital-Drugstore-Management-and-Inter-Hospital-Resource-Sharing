import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import ResourceVisibility from '@/pages/ResourceVisibility';

const mockGetShareVisibility = vi.fn();
const mockUpdateShareVisibility = vi.fn();
const mockToast = vi.fn();

vi.mock('@/components/layout/AppLayout', () => ({
  default: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
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
  inventoryApi: {
    getShareVisibility: (...args: unknown[]) => mockGetShareVisibility(...args),
    updateShareVisibility: (...args: unknown[]) => mockUpdateShareVisibility(...args),
  },
}));

describe('ResourceVisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inventory items including entries with shared quantity 0', async () => {
    mockGetShareVisibility.mockResolvedValue({
      data: [
        {
          id: 'inv-1',
          inventory_id: 'inv-1',
          catalog_item: 'cat-1',
          catalog_item_name: 'Ventilator',
          total_quantity: 5,
          shared_quantity: 2,
          share_record_id: 'share-1',
          resource_type: 'equipment',
        },
        {
          id: 'inv-2',
          inventory_id: 'inv-2',
          catalog_item: 'cat-2',
          catalog_item_name: 'Oxygen Cylinder',
          total_quantity: 40,
          shared_quantity: 0,
          share_record_id: null,
          resource_type: 'equipment',
        },
      ],
    });

    render(<ResourceVisibility />);

    expect(await screen.findByText('Ventilator')).toBeInTheDocument();
    expect(await screen.findByText('Oxygen Cylinder')).toBeInTheDocument();

    const oxygenRow = screen.getByText('Oxygen Cylinder').closest('tr');
    expect(oxygenRow).not.toBeNull();
    expect(within(oxygenRow as HTMLElement).getByDisplayValue('0')).toBeInTheDocument();
  });

  it('saves updated shared quantity through inventory share-visibility API', async () => {
    mockGetShareVisibility.mockResolvedValue({
      data: [
        {
          id: 'inv-1',
          inventory_id: 'inv-1',
          catalog_item: 'cat-1',
          catalog_item_name: 'Ventilator',
          total_quantity: 5,
          shared_quantity: 2,
          share_record_id: 'share-1',
          resource_type: 'equipment',
        },
      ],
    });

    mockUpdateShareVisibility.mockResolvedValue({
      data: {
        id: 'inv-1',
        inventory_id: 'inv-1',
        catalog_item: 'cat-1',
        catalog_item_name: 'Ventilator',
        total_quantity: 5,
        shared_quantity: 3,
        share_record_id: 'share-1',
        resource_type: 'equipment',
      },
    });

    render(<ResourceVisibility />);

    const row = await screen.findByText('Ventilator');
    const tr = row.closest('tr') as HTMLElement;

    const input = within(tr).getByDisplayValue('2');
    await userEvent.clear(input);
    await userEvent.type(input, '3');

    await userEvent.click(within(tr).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockUpdateShareVisibility).toHaveBeenCalledWith({
        inventory_id: 'inv-1',
        catalog_item: 'cat-1',
        shared_quantity: 3,
        share_record_id: 'share-1',
      });
    });
  });
});
