import {
  broadcastsApi,
  hospitalsApi,
  offboardingApi,
  hospitalUpdateRequestsApi,
  requestsApi,
} from '@/services/api';

describe('API contract wrappers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    } as Response);
  });

  it('uses hospital-scoped offboarding submit endpoint', async () => {
    await hospitalsApi.submitOffboardingRequest('hospital-1', 'Need to offboard');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/hospitals/hospital-1/offboarding-request/',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('uses admin offboarding listing endpoint', async () => {
    await offboardingApi.listAdminRequests({ status: 'pending' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/admin/hospital-offboarding-requests/?status=pending',
      expect.any(Object)
    );
  });

  it('uses hospital update request reject payload', async () => {
    await hospitalUpdateRequestsApi.reject('req-1', 'Verification failed');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/admin/hospital-update-requests/req-1/reject/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ rejection_reason: 'Verification failed' }),
      })
    );
  });

  it('uses broadcast close endpoint', async () => {
    await broadcastsApi.close('broadcast-1');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/broadcasts/broadcast-1/close/',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses broadcast unread count endpoint', async () => {
    await broadcastsApi.getUnreadCount();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/broadcasts/unread-count/',
      expect.any(Object)
    );
  });

  it('uses broadcast read endpoint', async () => {
    await broadcastsApi.markRead('broadcast-2');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/broadcasts/broadcast-2/read/',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses broadcast response endpoint with payload', async () => {
    await broadcastsApi.respond('broadcast-3', { response: 'We can supply 10 units.' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/broadcasts/broadcast-3/respond/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ response: 'We can supply 10 units.' }),
      })
    );
  });

  it('uses resource request create endpoint with expected payload shape', async () => {
    await requestsApi.create({
      supplying_hospital: 'hospital-1',
      catalog_item: 'catalog-1',
      quantity_requested: 2,
      priority: 'normal',
      notes: 'Need urgent support',
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/requests/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          supplying_hospital: 'hospital-1',
          catalog_item: 'catalog-1',
          quantity_requested: 2,
          priority: 'normal',
          notes: 'Need urgent support',
        }),
      })
    );
  });

  it('uses request approve endpoint', async () => {
    await requestsApi.approve('request-1', {
      decision: 'approved',
      quantity_approved: 2,
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/requests/request-1/approve/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decision: 'approved',
          quantity_approved: 2,
        }),
      })
    );
  });
});
