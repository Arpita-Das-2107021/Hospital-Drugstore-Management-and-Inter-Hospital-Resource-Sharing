/**
 * Registration Service for Hospital Self-Registration
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface HospitalRegistrationData {
  // Hospital Information
  hospital_name: string;
  license_number: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  contact_email: string;
  contact_phone: string;
  
  // API Configuration
  api_config: {
    api_base_url: string;
    auth_type: 'API_KEY' | 'OAUTH2' | 'BASIC_AUTH';
    api_key?: string;
    api_secret?: string;
    inventory_endpoint?: string;
    staff_endpoint?: string;
    transfer_request_endpoint?: string;
  };
  
  // Admin User
  admin_user: {
    username: string;
    password: string;
    confirm_password: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    designation?: string;
  };
}

export interface RegistrationResponse {
  success: boolean;
  message: string;
  data?: {
    hospital: {
      id: number;
      code: string;
      name: string;
      license_number: string;
      email: string;
      phone: string;
      status: string;
      status_display: string;
      created_at: string;
    };
    admin_user: {
      id: number;
      username: string;
      full_name: string;
      email: string;
      role_name: string;
      status: string;
    };
  };
  errors?: Record<string, string[]>;
  error?: string;
}

const registrationService = {
  /**
   * Register a new hospital on the platform
   */
  registerHospital: async (data: HospitalRegistrationData): Promise<RegistrationResponse> => {
    const url = `${API_BASE_URL}/hospitals/register/`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        // Return error response with validation errors
        return {
          success: false,
          message: result.message || 'Registration failed',
          errors: result.errors,
          error: result.error,
        };
      }
      
      return result;
    } catch (error) {
      console.error('Registration request failed:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection and try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
  
  /**
   * Check if a license number is already registered
   */
  checkLicenseNumber: async (licenseNumber: string): Promise<boolean> => {
    // This would be a dedicated endpoint in a real application
    // For now, we'll let the backend handle validation during registration
    return false;
  },
  
  /**
   * Check if username is available
   */
  checkUsername: async (username: string): Promise<boolean> => {
    // This would be a dedicated endpoint in a real application
    // For now, we'll let the backend handle validation during registration
    return false;
  },
  
  /**
   * Check if email is available
   */
  checkEmail: async (email: string): Promise<boolean> => {
    // This would be a dedicated endpoint in a real application
    // For now, we'll let the backend handle validation during registration
    return false;
  },
  
  /**
   * List hospitals with optional status filter
   */
  listHospitals: async (status?: string): Promise<any> => {
    const queryString = status ? `?status=${status}` : '';
    const url = `${API_BASE_URL}/hospitals/list/${queryString}`;
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch hospitals');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch hospitals:', error);
      throw error;
    }
  },
  
  /**
   * Verify hospital API connection
   */
  verifyHospitalAPI: async (hospitalId: number): Promise<any> => {
    const url = `${API_BASE_URL}/hospitals/verify/?hospital_id=${hospitalId}`;
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to verify hospital API:', error);
      throw error;
    }
  },
  
  /**
   * Approve a pending hospital registration
   */
  approveHospital: async (hospitalId: number): Promise<any> => {
    const url = `${API_BASE_URL}/hospitals/approve/`;
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ hospital_id: hospitalId }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to approve hospital:', error);
      throw error;
    }
  },
  
  /**
   * Reject a pending hospital registration
   */
  rejectHospital: async (hospitalId: number, reason: string = ''): Promise<any> => {
    const url = `${API_BASE_URL}/hospitals/reject/`;
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          hospital_id: hospitalId,
          reason: reason,
        }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to reject hospital:', error);
      throw error;
    }
  },
};

export default registrationService;
