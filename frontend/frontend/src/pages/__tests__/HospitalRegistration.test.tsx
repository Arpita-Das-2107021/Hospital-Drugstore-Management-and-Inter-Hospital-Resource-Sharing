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

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Marker: () => <div />,
  TileLayer: () => <div />,
  useMapEvents: () => null,
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

  it('submits manual latitude/longitude fields', async () => {
    render(
      <MemoryRouter>
        <HospitalRegistration />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/hospital name/i), { target: { value: 'City Hospital' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText(/contact email \*/i), { target: { value: 'contact@city.test' } });
    fireEvent.change(screen.getByLabelText(/contact phone \*/i), { target: { value: '+1 555 123 1234' } });
    fireEvent.change(screen.getByLabelText(/admin name \*/i), { target: { value: 'Admin One' } });
    fireEvent.change(screen.getByLabelText(/admin email \*/i), { target: { value: 'admin@city.test' } });

    fireEvent.change(screen.getByLabelText(/^latitude$/i), { target: { value: '23.810331' } });
    fireEvent.change(screen.getByLabelText(/^longitude$/i), { target: { value: '90.412521' } });
    fireEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => {
      expect(registerHospital).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: '23.810331',
          longitude: '90.412521',
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

    fireEvent.change(screen.getByLabelText(/hospital name/i), { target: { value: 'City Hospital' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText(/contact email \*/i), { target: { value: 'contact@city.test' } });
    fireEvent.change(screen.getByLabelText(/contact phone \*/i), { target: { value: '+1 555 123 1234' } });
    fireEvent.change(screen.getByLabelText(/admin name \*/i), { target: { value: 'Admin One' } });
    fireEvent.change(screen.getByLabelText(/admin email \*/i), { target: { value: 'admin@city.test' } });

    const logo = new File(['logo-content'], 'hospital-logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/hospital logo/i), { target: { files: [logo] } });

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

    fireEvent.change(screen.getByLabelText(/hospital name/i), { target: { value: 'City Hospital' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'REG-1' } });
    fireEvent.change(screen.getByLabelText(/contact email \*/i), { target: { value: 'contact@city.test' } });
    fireEvent.change(screen.getByLabelText(/contact phone \*/i), { target: { value: '+1 555 123 1234' } });
    fireEvent.change(screen.getByLabelText(/admin name \*/i), { target: { value: 'Admin One' } });
    fireEvent.change(screen.getByLabelText(/admin email \*/i), { target: { value: 'admin@city.test' } });

    const invalidFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/hospital logo/i), { target: { files: [invalidFile] } });

    fireEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => {
      expect(registerHospital).not.toHaveBeenCalled();
      expect(screen.getByText(/logo must be a png, jpg, webp, or gif image/i)).toBeInTheDocument();
    });
  });
});
