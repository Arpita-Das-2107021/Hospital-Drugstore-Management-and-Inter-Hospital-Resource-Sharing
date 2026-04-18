/**
 * Secure Authentication Service with JWT support
 * Handles access tokens, refresh tokens, and automatic token refresh
 */

import { extractEffectivePermissionPayload } from '@/lib/rbac';

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
  context: 'PLATFORM' | 'HEALTHCARE' | null;
  access_mode: 'UI' | 'API' | null;
  healthcare_id: string | null;
  role: string;
  roles: string[];
  platform_roles: string[];
  hospital_role: string | null;
  hospital_id: string | null;
  hospital_name?: string;
  profile_picture?: string | null;
  profile_picture_url?: string | null;
  department?: string;
  effective_permissions?: string[];
  permissions_by_scope?: {
    platform_roles: string[];
    hospital_role: string[];
  };
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

  private normalizeValidationErrors(raw: unknown): ValidationError | undefined {
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

  private toStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          const itemObj = item as Record<string, unknown>;
          if (typeof itemObj.code === 'string') {
            return itemObj.code;
          }
          if (typeof itemObj.name === 'string') {
            return itemObj.name;
          }
        }

        return '';
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private parsePermissionsByScope(value: unknown): { platform_roles: string[]; hospital_role: string[] } | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const scope = value as Record<string, unknown>;
    const platformSet = new Set<string>();
    const hospitalSet = new Set<string>();

    const pushMany = (target: Set<string>, rawCodes: unknown) => {
      this.toStringArray(rawCodes).forEach((code) => target.add(code));
    };

    // Canonical keys.
    pushMany(platformSet, scope.platform_roles);
    pushMany(hospitalSet, scope.hospital_role);

    // Compatibility keys seen in backend payload variants.
    pushMany(platformSet, scope.platform_role);
    pushMany(platformSet, scope.platform);
    pushMany(platformSet, scope.platform_permissions);

    pushMany(hospitalSet, scope.hospital_roles);
    pushMany(hospitalSet, scope.hospital);
    pushMany(hospitalSet, scope.hospital_permissions);
    pushMany(hospitalSet, scope.healthcare);
    pushMany(hospitalSet, scope.healthcare_role);
    pushMany(hospitalSet, scope.healthcare_roles);

    // Generic fallback for unexpected scope bucket names.
    Object.entries(scope).forEach(([key, bucket]) => {
      const parsed = this.toStringArray(bucket);
      if (parsed.length === 0) return;

      const keyLower = key.toLowerCase();
      if (keyLower.includes('platform')) {
        parsed.forEach((code) => platformSet.add(code));
      }
      if (keyLower.includes('hospital') || keyLower.includes('healthcare')) {
        parsed.forEach((code) => hospitalSet.add(code));
      }
    });

    if (platformSet.size === 0 && hospitalSet.size === 0) {
      return undefined;
    }

    return {
      platform_roles: Array.from(platformSet),
      hospital_role: Array.from(hospitalSet),
    };
  }

  private mapUserFromApi(rawUser: unknown, fallbackEmail = ''): User {
    const userObj = rawUser && typeof rawUser === 'object' ? rawUser as Record<string, unknown> : {};

    const roleList = this.toStringArray(userObj.roles);
    const platformRoles = this.toStringArray(userObj.platform_roles);
    const hospitalRole = this.toNullableString(userObj.hospital_role);
    const legacyRole = this.toNullableString(userObj.role);

    const mergedRoleSet = new Set<string>();
    roleList.forEach((role) => mergedRoleSet.add(role));
    platformRoles.forEach((role) => mergedRoleSet.add(role));
    if (hospitalRole) mergedRoleSet.add(hospitalRole);
    if (legacyRole) mergedRoleSet.add(legacyRole);

    const mergedRoles = Array.from(mergedRoleSet);
    const primaryRole = legacyRole || hospitalRole || mergedRoles[0] || 'STAFF';

    const rawContext = this.toNullableString(userObj.context)?.toUpperCase() || null;
    const context = rawContext === 'PLATFORM' || rawContext === 'HEALTHCARE'
      ? rawContext
      : null;

    const rawAccessMode = this.toNullableString(userObj.access_mode)?.toUpperCase() || null;
    const accessMode = rawAccessMode === 'UI' || rawAccessMode === 'API'
      ? rawAccessMode
      : null;

    const effectivePermissions = Array.from(new Set([
      ...this.toStringArray(userObj.effective_permissions),
      ...this.toStringArray(userObj.permissions),
      ...this.toStringArray(userObj.permission_codes),
    ]));
    const permissionsByScope = this.parsePermissionsByScope(
      userObj.permissions_by_scope ?? userObj.scoped_permissions ?? userObj.permissions_scope,
    );

    const healthcareId = this.toNullableString(userObj.healthcare_id) || this.toNullableString(userObj.hospital_id);
    const hospitalId = this.toNullableString(userObj.hospital_id) || healthcareId;
    const profilePicture =
      this.toNullableString(userObj.profile_picture) ||
      this.toNullableString(userObj.avatar);
    const profilePictureUrl =
      this.toNullableString(userObj.profile_picture_url) ||
      this.toNullableString(userObj.avatar_url);

    return {
      id: this.toNullableString(userObj.id) || '',
      email: this.toNullableString(userObj.email) || fallbackEmail,
      full_name:
        this.toNullableString(userObj.full_name) ||
        this.toNullableString(userObj.name) ||
        '',
      context,
      access_mode: accessMode,
      healthcare_id: healthcareId,
      role: primaryRole,
      roles: mergedRoles.length > 0 ? mergedRoles : [primaryRole],
      platform_roles: platformRoles,
      hospital_role: hospitalRole,
      hospital_id: hospitalId,
      hospital_name: this.toNullableString(userObj.hospital_name) || undefined,
      profile_picture: profilePicture,
      profile_picture_url: profilePictureUrl,
      department: this.toNullableString(userObj.department) || undefined,
      effective_permissions: effectivePermissions,
      permissions_by_scope: permissionsByScope,
    };
  }

  private async fetchEffectivePermissions(userId: string, token: string): Promise<{
    platform_roles: string[];
    hospital_role: string | null;
    effective_permissions: string[];
    permissions_by_scope: { platform_roles: string[]; hospital_role: string[] };
  } | null> {
    if (!userId || !token) return null;

    const candidates = [
      `/api/v1/rbac/users/${userId}/permissions/effective/`,
      `/api/v1/users/${userId}/permissions/effective/`,
    ];

    for (const path of candidates) {
      try {
        const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) continue;
        const payload = await response.json().catch(() => ({}));
        return extractEffectivePermissionPayload(payload);
      } catch {
        // Continue to fallback endpoint.
      }
    }

    return null;
  }

  private parseAuthApiError(payload: unknown, fallbackMessage: string): { message: string; errors?: ValidationError } {
    const payloadRecord =
      payload && typeof payload === 'object'
        ? payload as Record<string, unknown>
        : {};
    const payloadErrorRecord =
      payloadRecord.error && typeof payloadRecord.error === 'object'
        ? payloadRecord.error as Record<string, unknown>
        : {};

    const nestedDetails = payloadErrorRecord.details;
    const directDetails = payloadRecord.details;
    const directErrors = payloadRecord.errors;
    const normalizedErrors =
      this.normalizeValidationErrors(nestedDetails) ||
      this.normalizeValidationErrors(directDetails) ||
      this.normalizeValidationErrors(directErrors);

    const message =
      this.toNullableString(payloadErrorRecord.message) ||
      this.toNullableString(payloadRecord.message) ||
      this.toNullableString(payloadRecord.detail) ||
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

    // If we have stored user data, validate and refresh permissions before returning.
    if (storedUser) {
      return this.validateAndSetupAuth();
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
  async register(_data: RegisterData): Promise<AuthResponse> {
    throw new AuthError('Self-registration is not supported by the current API contract. Use invitation acceptance or hospital registration flows.');
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

      const rawBody = await response.text();
      let responseData: Record<string, unknown> = {};
      if (rawBody) {
        try {
          responseData = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          responseData = {};
        }
      }

      if (!response.ok) {
        const fallbackMessage =
          response.status === 401
            ? 'Invalid email or password'
            : `Login failed (${response.status})`;
        const parsed = this.parseAuthApiError(responseData, fallbackMessage);
        throw new AuthError(parsed.message, parsed.errors);
      }

      // API returns { success: true, data: { access, refresh, user } }
      const apiData =
        responseData.data && typeof responseData.data === 'object'
          ? responseData.data as Record<string, unknown>
          : responseData;
      const user = this.mapUserFromApi(apiData.user, credentials.email);

      const accessToken = this.toNullableString(apiData.access) || '';
      const refreshToken = this.toNullableString(apiData.refresh) || '';

      const effective = await this.fetchEffectivePermissions(user.id, accessToken);
      if (effective) {
        user.effective_permissions = effective.effective_permissions;
        user.permissions_by_scope = effective.permissions_by_scope;
        if (effective.platform_roles.length > 0) {
          user.platform_roles = effective.platform_roles;
        }
        if (effective.hospital_role && !user.hospital_role) {
          user.hospital_role = effective.hospital_role;
        }

        const mergedRoleSet = new Set<string>(user.roles || []);
        user.platform_roles.forEach((role) => mergedRoleSet.add(role));
        if (user.hospital_role) mergedRoleSet.add(user.hospital_role);
        if (user.role) mergedRoleSet.add(user.role);
        user.roles = Array.from(mergedRoleSet);
      }

      const authResponse: AuthResponse = {
        message: 'Login successful',
        tokens: { access: accessToken, refresh: refreshToken },
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
      const user = this.mapUserFromApi(apiUser);

      const effective = await this.fetchEffectivePermissions(user.id, accessToken);
      if (effective) {
        user.effective_permissions = effective.effective_permissions;
        user.permissions_by_scope = effective.permissions_by_scope;
        if (effective.platform_roles.length > 0) {
          user.platform_roles = effective.platform_roles;
        }
        if (effective.hospital_role && !user.hospital_role) {
          user.hospital_role = effective.hospital_role;
        }

        const mergedRoleSet = new Set<string>(user.roles || []);
        user.platform_roles.forEach((role) => mergedRoleSet.add(role));
        if (user.hospital_role) mergedRoleSet.add(user.hospital_role);
        if (user.role) mergedRoleSet.add(user.role);
        user.roles = Array.from(mergedRoleSet);
      }

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
    const accessToken = this.getAccessToken();
    
    if (!accessToken) {
      throw new AuthError('Not authenticated');
    }

    const buildHeaders = (token: string): Headers => {
      const headers = new Headers(options.headers || {});
      const isMultipartBody = typeof FormData !== 'undefined' && options.body instanceof FormData;

      headers.set('Authorization', `Bearer ${token}`);
      if (!headers.has('Content-Type') && !isMultipartBody) {
        headers.set('Content-Type', 'application/json');
      }

      return headers;
    };

    const makeRequest = async (token: string) => {
      const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: buildHeaders(token),
      });

      if (response.status === 401) {
        // Token might be expired, try to refresh
        const newToken = await this.refreshAccessToken();
        
        // Retry the request with new token
        const retryResponse = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: buildHeaders(newToken),
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
      const parsed = JSON.parse(userStr);
      return this.mapUserFromApi(parsed);
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
