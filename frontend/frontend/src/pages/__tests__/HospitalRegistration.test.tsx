import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HospitalRegistration from '@/pages/HospitalRegistration';

const registerHospital = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/registrationService', () => ({
  default: {
    registerHospital: (...args: unknown[]) => registerHospital(...args),
  },
}));

vi.mock('@/services/hospitalAdminDraftStore', () => ({
  saveHospitalAdminDraft: vi.fn(),
  attachDraftRegistrationId: vi.fn(),
}));

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

describe('HospitalRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerHospital.mockResolvedValue({
      success: true,
      data: {
        id: 'reg-1',
        name: 'City Hospital',
        registration_number: 'REG-1',
        email: 'contact@city.test',
        status: 'pending_approval',
      },
    });
  });

  it('submits mapped location fields from advanced picker', async () => {
    render(
      <MemoryRouter>
        <HospitalRegistration />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/facility name/i), { target: { value: 'City Hospital' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText(/contact email \*/i), { target: { value: 'contact@city.test' } });
    fireEvent.change(screen.getByLabelText(/contact phone/i), { target: { value: '+1 555 123 1234' } });
    fireEvent.change(screen.getByLabelText(/admin name \*/i), { target: { value: 'Admin One' } });
    fireEvent.change(screen.getByLabelText(/admin email \*/i), { target: { value: 'admin@city.test' } });

    fireEvent.click(screen.getByRole('button', { name: /set mock location/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => {
      expect(registerHospital).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: '23.810331',
          longitude: '90.412521',
          address: 'Dhaka, Bangladesh',
        })
      );
    });
  });

  it('includes logo file in registration payload', async () => {
    render(
      <MemoryRouter>
        <HospitalRegistration />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/facility name/i), { target: { value: 'City Hospital' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText(/contact email \*/i), { target: { value: 'contact@city.test' } });
    fireEvent.change(screen.getByLabelText(/contact phone/i), { target: { value: '+1 555 123 1234' } });
    fireEvent.change(screen.getByLabelText(/admin name \*/i), { target: { value: 'Admin One' } });
    fireEvent.change(screen.getByLabelText(/admin email \*/i), { target: { value: 'admin@city.test' } });

    const logo = new File(['logo-content'], 'hospital-logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/facility logo/i), { target: { files: [logo] } });

    fireEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => {
      expect(registerHospital).toHaveBeenCalledWith(
        expect.objectContaining({
          logo,
        })
      );
    });
  });

  it('blocks submission for invalid logo file type', async () => {
    render(
      <MemoryRouter>
        <HospitalRegistration />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/facility name/i), { target: { value: 'City Hospital' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText(/contact email \*/i), { target: { value: 'contact@city.test' } });
    fireEvent.change(screen.getByLabelText(/contact phone/i), { target: { value: '+1 555 123 1234' } });
    fireEvent.change(screen.getByLabelText(/admin name \*/i), { target: { value: 'Admin One' } });
    fireEvent.change(screen.getByLabelText(/admin email \*/i), { target: { value: 'admin@city.test' } });

    const invalidFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/facility logo/i), { target: { files: [invalidFile] } });

    fireEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => {
      expect(registerHospital).not.toHaveBeenCalled();
      expect(screen.getByText(/logo must be a png, jpg, webp, or gif image/i)).toBeInTheDocument();
    });
  });
});
