import { useEffect, useMemo } from 'react';
import type { User } from '@/services/authService';
import { attachBadgePolling, getBadgeCountByKeys, useBadgeStore } from '@/store/badgeStore';

const toScopePermissionSignature = (user: User | null | undefined): string => {
  if (!user) {
    return 'anonymous';
  }

  const context = typeof user.context === 'string' ? user.context : '';
  const effectivePermissions = Array.isArray(user.effective_permissions)
    ? [...user.effective_permissions].sort().join('|')
    : '';
  const scopedPlatformPermissions = Array.isArray(user.permissions_by_scope?.platform_roles)
    ? [...user.permissions_by_scope.platform_roles].sort().join('|')
    : '';
  const scopedHospitalPermissions = Array.isArray(user.permissions_by_scope?.hospital_role)
    ? [...user.permissions_by_scope.hospital_role].sort().join('|')
    : '';

  return [
    user.id || '',
    context,
    user.hospital_id || '',
    effectivePermissions,
    scopedPlatformPermissions,
    scopedHospitalPermissions,
  ].join('::');
};

export const useBadges = (user: User | null | undefined) => {
  const counters = useBadgeStore((state) => state.counters);
  const roleScope = useBadgeStore((state) => state.roleScope);
  const isFetching = useBadgeStore((state) => state.isFetching);
  const lastFetchedAt = useBadgeStore((state) => state.lastFetchedAt);

  const scopePermissionSignature = toScopePermissionSignature(user);
  const pollingUser = useMemo(() => user, [scopePermissionSignature]);

  useEffect(() => {
    const detach = attachBadgePolling(pollingUser);
    return detach;
  }, [pollingUser]);

  const incomingRequests = getBadgeCountByKeys(counters, ['incomingRequests', 'incoming_requests']);
  const outgoingRequests = getBadgeCountByKeys(counters, ['outgoingRequests', 'outgoing_requests']);
  const pendingDispatches = getBadgeCountByKeys(counters, ['pendingDispatches', 'pending_dispatches']);
  const hospitalRegistrations = getBadgeCountByKeys(counters, [
    'hospitalRegistrations',
    'hospital_registrations',
    'pendingRegistrations',
    'pending_registrations',
  ]);
  const updateRequests = getBadgeCountByKeys(counters, [
    'updateRequests',
    'update_requests',
    'updatePending',
    'update_pending',
    'updateApprovals',
    'update_approvals',
  ]);
  const updateApprovals = updateRequests;
  const offboardingRequests = getBadgeCountByKeys(counters, ['offboardingRequests', 'offboarding_requests']);

  return {
    counters,
    roleScope,
    isFetching,
    lastFetchedAt,
    incomingRequests,
    outgoingRequests,
    pendingDispatches,
    hospitalRegistrations,
    updateRequests,
    updateApprovals,
    offboardingRequests,
  };
};
