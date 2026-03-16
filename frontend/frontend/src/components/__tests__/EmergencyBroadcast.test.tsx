import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmergencyBroadcast, { type BroadcastHospitalOption, type BroadcastTemplate } from '@/components/EmergencyBroadcast';

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

    await userEvent.type(screen.getByLabelText(/title/i), 'Urgent oxygen support');
    await userEvent.type(screen.getByLabelText(/message/i), 'Please share available cylinders.');
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
    await userEvent.type(screen.getByLabelText(/title/i), 'FYI message');
    await userEvent.type(screen.getByLabelText(/message/i), 'No response needed.');
    await userEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        allow_response: false,
      })
    );
  });
});
