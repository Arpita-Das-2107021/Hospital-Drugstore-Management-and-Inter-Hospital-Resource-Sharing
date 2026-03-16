/**
 * Secure Authentication Service with JWT support
 * Handles access tokens, refresh tokens, and automatic token refresh
 */

// Base URL without /api suffix — all paths include the full /api prefix
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:8000';
const AUTH_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  full_name: string;
  password: string;
  password_confirm: string;
  role: string;
  hospital_id: string;
  department?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  hospital_id: string;
  hospital_name?: string;
  department?: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  message: string;
  tokens: AuthTokens;
  user: User;
}

export interface ValidationError {
  [key: string]: string | string[];
}

export class AuthError extends Error {
  errors?: ValidationError;
  
  constructor(message: string, errors?: ValidationError) {
    super(message);
    this.name = 'AuthError';
    this.errors = errors;
  }
}

class AuthService {
  private accessTokenKey = 'access_token';
  private refreshTokenKey = 'refresh_token';
  private userKey = 'auth_user';
  private rememberMeKey = 'auth_remember_me';
  private refreshTimeoutId: number | null = null;
  private isPersistent = true; // Default to persistent storage

  private normalizeValidationErrors(raw: any): ValidationError | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }

    const result: ValidationError = {};
    Object.entries(raw).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        result[key] = value.map((item) => String(item));
        return;
      }
      if (typeof value === 'string') {
        result[key] = value;
      }
    });

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private parseAuthApiError(payload: any, fallbackMessage: string): { message: string; errors?: ValidationError } {
    const nestedDetails = payload?.error?.details;
    const directDetails = payload?.details;
    const directErrors = payload?.errors;
    const normalizedErrors =
      this.normalizeValidationErrors(nestedDetails) ||
      this.normalizeValidationErrors(directDetails) ||
      this.normalizeValidationErrors(directErrors);

    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.detail ||
      fallbackMessage;

    return {
      message,
      errors: normalizedErrors,
    };
  }

  /**
   * Initialize the auth service and setup auto-refresh
   */
  async init(): Promise<User | null> {
    // Check if we should use persistent storage
    this.isPersistent = this.getRememberMe();
    
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    const storedUser = this.getUser();

    console.log('Auth init - tokens found:', !!accessToken, !!refreshToken, !!storedUser);

    if (!accessToken || !refreshToken) {
      this.clearAuth();
      return null;
    }

    // If we have stored user data, return it immediately for faster UI
    if (storedUser) {
      // Validate tokens in background and setup refresh
      this.validateAndSetupAuth().catch(error => {
        console.error('Background auth validation failed:', error);
        this.clearAuth();
        // Optionally redirect to login
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      });
      return storedUser;
    }

    // No stored user, validate tokens
    return this.validateAndSetupAuth();
  }

  /**
   * Validate tokens and setup auth
   */
  private async validateAndSetupAuth(): Promise<User | null> {
    try {
      const user = await this.getCurrentUser();
      this.setupTokenRefresh();
      return user;
    } catch (error) {
      console.log('Access token expired, trying refresh...');
      // If access token is expired, try to refresh
      try {
        await this.refreshAccessToken();
        const user = await this.getCurrentUser();
        this.setupTokenRefresh();
        return user;
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        this.clearAuth();
        return null;
      }
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new AuthError(
          responseData.error || 'Registration failed',
          responseData.errors
        );
      }

      const authResponse: AuthResponse = responseData;
      
      // Store tokens and user data
      this.setTokens(authResponse.tokens);
      this.setUser(authResponse.user);
      this.setupTokenRefresh();

      return authResponse;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error during registration');
    }
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // Set storage preference
      this.isPersistent = credentials.rememberMe ?? true;
      this.setRememberMe(this.isPersistent);
      
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new AuthError(
          responseData?.error?.message || responseData.error || 'Login failed',
          responseData.errors
        );
      }

      // API returns { success: true, data: { access, refresh, user } }
      const apiData = responseData.data || responseData;
      const user: User = {
        id: apiData.user?.id || '',
        email: apiData.user?.email || credentials.email,
        full_name: apiData.user?.full_name || apiData.user?.name || '',
        role: Array.isArray(apiData.user?.roles) ? apiData.user.roles[0] : (apiData.user?.role || 'STAFF'),
        hospital_id: apiData.user?.hospital_id || '',
        hospital_name: apiData.user?.hospital_name,
        department: apiData.user?.department,
      };
      const authResponse: AuthResponse = {
        message: 'Login successful',
        tokens: { access: apiData.access, refresh: apiData.refresh },
        user,
      };
      
      console.log('Login successful, storing tokens with persistence:', this.isPersistent);
      
      // Store tokens and user data
      this.setTokens(authResponse.tokens);
      this.setUser(authResponse.user);
      this.setupTokenRefresh();

      return authResponse;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error during login');
    }
  }

  /**
   * Logout and clear all auth data
   */
  async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    
    if (refreshToken) {
      try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAccessToken()}`,
          },
          body: JSON.stringify({ refresh: refreshToken }),
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    this.clearAuth();
  }

  /**
   * Get current user from the server
   */
  async getCurrentUser(): Promise<User> {
    const accessToken = this.getAccessToken();
    
    if (!accessToken) {
      throw new AuthError('No access token found');
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Unauthorized');
        }
        throw new AuthError('Failed to fetch user');
      }

      const responseData = await response.json();
      // API returns { success: true, data: { id, email, full_name, ... } }
      const apiUser = responseData.data || responseData;
      const user: User = {
        id: apiUser.id || '',
        email: apiUser.email || '',
        full_name: apiUser.full_name || '',
        role: Array.isArray(apiUser.roles) ? apiUser.roles[0] : (apiUser.role || 'STAFF'),
        hospital_id: apiUser.hospital_id || '',
        hospital_name: apiUser.hospital_name,
        department: apiUser.department,
      };
      this.setUser(user);
      return user;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error');
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      throw new AuthError('No refresh token found');
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new AuthError('Token refresh failed');
      }

      // API returns { success: true, data: { access } }
      const data = responseData.data || responseData;
      // Update access token
      this.setAccessToken(data.access);
      
      // If we got a new refresh token, update it too
      if (data.refresh) {
        this.setRefreshToken(data.refresh);
      }

      return data.access;
    } catch (error) {
      this.clearAuth();
      throw new AuthError('Failed to refresh token');
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string
  ): Promise<void> {
    const accessToken = this.getAccessToken();
    
    if (!accessToken) {
      throw new AuthError('Not authenticated');
    }

    try {
      if (newPassword !== newPasswordConfirm) {
        throw new AuthError('New password and confirmation do not match');
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data?.error?.message || data.error || 'Password change failed', data.errors);
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error during password change');
    }
  }

  /**
   * Request password reset email.
   */
  async requestPasswordReset(email: string): Promise<string> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/password-reset/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new AuthError(data?.error?.message || data?.message || 'Failed to request password reset');
      }

      return data?.data?.detail || 'If that email is registered, a reset link has been sent.';
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error during password reset request');
    }
  }

  /**
   * Complete password setup / reset using a token from email link.
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/password-reset/confirm/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          new_password: newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const parsed = this.parseAuthApiError(data, 'Password setup failed');
        throw new AuthError(parsed.message, parsed.errors);
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error during password setup');
    }
  }

  /**
   * Set password from onboarding email link that carries uid + token.
   */
  async setPassword(_uid: string, token: string, password: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/invitations/accept/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const parsed = this.parseAuthApiError(data, 'Password setup failed');
        throw new AuthError(parsed.message, parsed.errors);
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error during password setup');
    }
  }

  /**
   * Setup automatic token refresh
   * Refresh the token 5 minutes before it expires (token lifetime is 60 minutes)
   */
  private setupTokenRefresh(): void {
    // Clear any existing timeout
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
    }

    // Refresh token after 55 minutes (5 minutes before expiry)
    this.refreshTimeoutId = window.setTimeout(() => {
      this.refreshAccessToken().catch((error) => {
        console.error('Auto-refresh failed:', error);
        // If auto-refresh fails, clear auth and redirect to login
        this.clearAuth();
        window.location.href = '/login';
      });
    }, 55 * 60 * 1000); // 55 minutes in milliseconds
  }

  /**
   * Make an authenticated API request with automatic token refresh
   */
  async authenticatedRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    let accessToken = this.getAccessToken();
    
    if (!accessToken) {
      throw new AuthError('Not authenticated');
    }

    const makeRequest = async (token: string) => {
      const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        // Token might be expired, try to refresh
        const newToken = await this.refreshAccessToken();
        
        // Retry the request with new token
        const retryResponse = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!retryResponse.ok) {
          throw new AuthError('Request failed after token refresh');
        }

        return await retryResponse.json();
      }

      if (!response.ok) {
        const error = await response.json();
        throw new AuthError(error.error || 'Request failed');
      }

      return await response.json();
    };

    return makeRequest(accessToken);
  }

  // Storage methods with session/persistent support
  private getStorage(): Storage {
    return this.isPersistent ? localStorage : sessionStorage;
  }

  // Token management
  getAccessToken(): string | null {
    return this.getStorage().getItem(this.accessTokenKey) || 
           localStorage.getItem(this.accessTokenKey) || 
           sessionStorage.getItem(this.accessTokenKey);
  }

  setAccessToken(token: string): void {
    this.getStorage().setItem(this.accessTokenKey, token);
    // Clear from other storage to avoid conflicts
    const otherStorage = this.isPersistent ? sessionStorage : localStorage;
    otherStorage.removeItem(this.accessTokenKey);
  }

  getRefreshToken(): string | null {
    return this.getStorage().getItem(this.refreshTokenKey) || 
           localStorage.getItem(this.refreshTokenKey) || 
           sessionStorage.getItem(this.refreshTokenKey);
  }

  setRefreshToken(token: string): void {
    this.getStorage().setItem(this.refreshTokenKey, token);
    // Clear from other storage to avoid conflicts
    const otherStorage = this.isPersistent ? sessionStorage : localStorage;
    otherStorage.removeItem(this.refreshTokenKey);
  }

  setTokens(tokens: AuthTokens): void {
    this.setAccessToken(tokens.access);
    this.setRefreshToken(tokens.refresh);
  }

  // User data management
  getUser(): User | null {
    const userStr = this.getStorage().getItem(this.userKey) || 
                   localStorage.getItem(this.userKey) || 
                   sessionStorage.getItem(this.userKey);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  setUser(user: User): void {
    this.getStorage().setItem(this.userKey, JSON.stringify(user));
    // Clear from other storage to avoid conflicts
    const otherStorage = this.isPersistent ? sessionStorage : localStorage;
    otherStorage.removeItem(this.userKey);
  }

  // Remember Me preference
  getRememberMe(): boolean {
    return localStorage.getItem(this.rememberMeKey) === 'true';
  }

  setRememberMe(remember: boolean): void {
    localStorage.setItem(this.rememberMeKey, remember.toString());
  }

  // Clean up all auth data
  clearAuth(): void {
    // Clear from both storage types
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    
    sessionStorage.removeItem(this.accessTokenKey);
    sessionStorage.removeItem(this.refreshTokenKey);
    sessionStorage.removeItem(this.userKey);
    
    // Keep remember me preference but reset to default
    this.isPersistent = true;
    
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getAccessToken() && !!this.getRefreshToken();
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
