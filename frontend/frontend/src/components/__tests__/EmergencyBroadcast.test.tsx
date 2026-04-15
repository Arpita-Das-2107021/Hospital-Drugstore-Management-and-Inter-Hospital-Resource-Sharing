import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmergencyBroadcast, { type BroadcastHospitalOption, type BroadcastTemplate } from '@/components/EmergencyBroadcast';

vi.mock('@/components/maps/BroadcastLocationPicker', () => ({
  default: ({
    onChange,
    onValidationErrorChange,
  }: {
    onChange: (value: { lat?: number; lng?: number; address?: string } | null) => void;
    onValidationErrorChange?: (error: string | null) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onValidationErrorChange?.(null);
        onChange({ lat: 23.810331, lng: 90.412521, address: 'Dhaka, Bangladesh' });
      }}
    >
      Set Mock Location
    </button>
  ),
}));

const templates: BroadcastTemplate[] = [
  {
    id: 'oxygen',
    name: 'Oxygen Shortage',
    message: 'Need immediate oxygen support.',
    priority: 'urgent',
  },
];

const hospitals: BroadcastHospitalOption[] = [
  { id: 'h-1', name: 'Hospital 1' },
  { id: 'h-2', name: 'Hospital 2' },
];

describe('EmergencyBroadcast', () => {
  it('submits allow_response=true by default', async () => {
    const onBroadcast = vi.fn().mockResolvedValue(undefined);

    render(
      <EmergencyBroadcast
        isOpen
        onClose={vi.fn()}
        onBroadcast={onBroadcast}
        templates={templates}
        hospitals={hospitals}
      />
    );

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Urgent oxygen support' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Please share available cylinders.' } });
    await userEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Urgent oxygen support',
        allow_response: true,
      })
    );
  });

  it('submits allow_response=false when unchecked', async () => {
    const onBroadcast = vi.fn().mockResolvedValue(undefined);

    render(
      <EmergencyBroadcast
        isOpen
        onClose={vi.fn()}
        onBroadcast={onBroadcast}
        templates={templates}
        hospitals={hospitals}
      />
    );

    await userEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'FYI message' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'No response needed.' } });
    await userEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        allow_response: false,
      })
    );
  });

  it('submits location payload when location is selected', async () => {
    const onBroadcast = vi.fn().mockResolvedValue(undefined);

    render(
      <EmergencyBroadcast
        isOpen
        onClose={vi.fn()}
        onBroadcast={onBroadcast}
        templates={templates}
        hospitals={hospitals}
      />
    );

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Location aware alert' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Please coordinate near central hub.' } });
    await userEvent.click(screen.getByRole('button', { name: /set mock location/i }));
    await userEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        location: {
          lat: 23.810331,
          lng: 90.412521,
          address: 'Dhaka, Bangladesh',
        },
      })
    );
  });
});
