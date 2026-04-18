// frontend/src/services/invitationService.ts
/**
 * Service for managing staff invitations.
 * Uses /api/v1/invitations/ endpoints.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:8000';

function getStoredAccessToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

interface SendInvitationData {
  email: string;
  role_id?: string;  // UUID of the role
  hospital?: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  position?: string;
}

interface AcceptInvitationData {
  token: string;
  password: string;
}

export const invitationService = {
  /**
   * Send a staff invitation
   * POST /api/v1/invitations/
   */
  async inviteStaff(data: SendInvitationData) {
    const token = getStoredAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/invitations/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || err.error || 'Failed to send invitation');
    }
    const result = await response.json();
    return result.data || result;
  },

  /**
   * List invitations for the hospital
   * GET /api/v1/invitations/
   */
  async listInvitations(status?: string, search?: string) {
    const token = getStoredAccessToken();
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const response = await fetch(`${API_BASE_URL}/api/v1/invitations/${qs}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Failed to fetch invitations');
    }
    const result = await response.json();
    const raw = result.data || result;
    // Backend paginates: { data: { results: [], count, next, previous } }
    const items = Array.isArray(raw) ? raw : (raw.results || []);
    return { invitations: items };
  },

  /**
   * Get invitation by ID
   * GET /api/v1/invitations/{id}/
   */
  async getInvitation(id: string) {
    const token = getStoredAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/invitations/${id}/`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Failed to fetch invitation');
    }
    const result = await response.json();
    return result.data || result;
  },

  /**
   * Revoke an invitation
   * DELETE /api/v1/invitations/{id}/
   */
  async cancelInvitation(id: string) {
    const token = getStoredAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/invitations/${id}/`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Failed to revoke invitation');
    }

    if (response.status === 204) {
      return { detail: 'Revoked' };
    }

    const result = await response.json().catch(() => ({ data: { detail: 'Revoked' } }));
    return result.data || result;
  },

  /**
   * Accept an invitation (public — no auth required)
   * POST /api/v1/invitations/accept/
   */
  async acceptInvitation(data: AcceptInvitationData) {
    const response = await fetch(`${API_BASE_URL}/api/v1/invitations/accept/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Failed to accept invitation');
    }
    const result = await response.json();
    return result.data || result;
  },

  /**
   * Get available roles
   * GET /api/v1/roles/
   */
  async getRoles() {
    const token = getStoredAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/roles/`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Failed to fetch roles');
    }
    const result = await response.json();
    // Return in a { roles: [...] } shape for backward compat with StaffInvitations page
    const data = result.data || result;
    return { roles: Array.isArray(data) ? data : data.results || [] };
  },

  // getDepartments — no backend endpoint; return empty array gracefully
  async getDepartments() {
    return { departments: [] };
  },

  // getInvitationByToken — use accept flow; this is called only for display
  async getInvitationByToken(token: string) {
    // The new API doesn't have a separate token-lookup endpoint.
    // Return a placeholder so the AcceptInvitation page can still render.
    return { token, status: 'pending', can_be_accepted: true };
  },
};
