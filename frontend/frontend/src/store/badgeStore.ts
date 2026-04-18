import { create } from 'zustand';
import type { User } from '@/services/authService';
import { badgesApi } from '@/services/api';
import { canAccessNavItem, resolveUserContext } from '@/lib/accessResolver';

export type BadgeRoleScope = 'healthcare_admin' | 'system_admin' | null;
export type BadgeCounters = Record<string, number>;

type BadgeStoreState = {
  counters: BadgeCounters;
  roleScope: BadgeRoleScope;
  isFetching: boolean;
  lastFetchedAt: number | null;
};

const DEFAULT_BADGE_KEYS = [
  'incomingRequests',
  'outgoingRequests',
  'pendingDispatches',
  'hospitalRegistrations',
  'updateRequests',
  'updatePending',
  'updateApprovals',
  'offboardingRequests',
];

const BADGE_POLL_INTERVAL_MS = 12_000;

const HEALTHCARE_BADGE_PERMISSION_CODES = [
  'hospital:request.view',
  'hospital:resource_share.view',
  'hospital:hospital.update',
  'hospital:offboarding.request',
];

const PLATFORM_BADGE_PERMISSION_CODES = [
  'platform:hospital.review',
  'platform:hospital.manage',
  'platform:hospital.view',
];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toBadgeCount = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
};

const createDefaultCounters = (): BadgeCounters => {
  const defaults: BadgeCounters = {};
  DEFAULT_BADGE_KEYS.forEach((key) => {
    defaults[key] = 0;
  });
  return defaults;
};

const buildZeroCounters = (previous: BadgeCounters): BadgeCounters => {
  const keys = new Set<string>([...DEFAULT_BADGE_KEYS, ...Object.keys(previous)]);
  const zeroCounters: BadgeCounters = {};

  keys.forEach((key) => {
    zeroCounters[key] = 0;
  });

  return zeroCounters;
};

const extractBadgeSource = (payload: unknown): Record<string, unknown> => {
  const root = asRecord(payload);
  const nestedData = asRecord(root.data);

  if (Object.keys(nestedData).length > 0) {
    return nestedData;
  }

  return root;
};

const normalizeBadgeCounters = (payload: unknown): BadgeCounters => {
  const source = extractBadgeSource(payload);
  const counters: BadgeCounters = createDefaultCounters();

  Object.entries(source).forEach(([key, rawValue]) => {
    const normalized = toBadgeCount(rawValue);
    if (normalized !== null) {
      counters[key] = normalized;
    }
  });

  return counters;
};

const isAbortError = (error: unknown): boolean => {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return false;
};

export const resolveBadgeRoleScope = (user: User | null | undefined): BadgeRoleScope => {
  if (!user) {
    return null;
  }

  const context = resolveUserContext(user);
  const canAccessHealthcareBadges = canAccessNavItem(user, 'hospital', HEALTHCARE_BADGE_PERMISSION_CODES);
  const canAccessPlatformBadges = canAccessNavItem(user, 'platform', PLATFORM_BADGE_PERMISSION_CODES);

  if (context === 'HEALTHCARE') {
    return canAccessHealthcareBadges ? 'healthcare_admin' : null;
  }

  if (context === 'PLATFORM') {
    return canAccessPlatformBadges ? 'system_admin' : null;
  }

  if (canAccessHealthcareBadges && !canAccessPlatformBadges) {
    return 'healthcare_admin';
  }

  if (canAccessPlatformBadges) {
    return 'system_admin';
  }

  return null;
};

export const getBadgeCount = (counters: BadgeCounters, key: string): number => {
  const value = counters[key];
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
};

export const getBadgeCountByKeys = (counters: BadgeCounters, keys: string[]): number => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(counters, key)) {
      return getBadgeCount(counters, key);
    }
  }

  return 0;
};

const initialState: BadgeStoreState = {
  counters: createDefaultCounters(),
  roleScope: null,
  isFetching: false,
  lastFetchedAt: null,
};

export const useBadgeStore = create<BadgeStoreState>(() => ({
  ...initialState,
}));

let activeConsumers = 0;
let activeRoleScope: BadgeRoleScope = null;
let pollingTimerId: number | null = null;
let inFlightPromise: Promise<void> | null = null;
let inFlightAbortController: AbortController | null = null;
let inFlightRequestId = 0;

const clearPollingTimer = () => {
  if (pollingTimerId !== null) {
    window.clearInterval(pollingTimerId);
    pollingTimerId = null;
  }
};

const stopInFlightRequest = () => {
  if (inFlightAbortController) {
    inFlightAbortController.abort();
    inFlightAbortController = null;
  }

  inFlightPromise = null;
};

const applyZeroBadgeFallback = () => {
  useBadgeStore.setState((state) => ({
    counters: buildZeroCounters(state.counters),
    isFetching: false,
    lastFetchedAt: Date.now(),
  }));
};

const fetchRoleScopedBadges = (roleScope: Exclude<BadgeRoleScope, null>, signal: AbortSignal): Promise<unknown> => {
  if (roleScope === 'healthcare_admin') {
    return badgesApi?.getHealthcareBadges?.(signal) ?? Promise.resolve({});
  }

  return badgesApi?.getPlatformBadges?.(signal) ?? Promise.resolve({});
};

const refreshBadgeCountersInternal = async (roleScope: BadgeRoleScope): Promise<void> => {
  if (!roleScope) {
    applyZeroBadgeFallback();
    return;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  const requestScope = roleScope;
  const requestId = ++inFlightRequestId;
  const controller = new AbortController();
  inFlightAbortController = controller;
  useBadgeStore.setState({ isFetching: true });

  inFlightPromise = (async () => {
    try {
      const payload = await fetchRoleScopedBadges(requestScope, controller.signal);

      if (activeRoleScope !== requestScope) {
        return;
      }

      useBadgeStore.setState({
        counters: normalizeBadgeCounters(payload),
        roleScope: requestScope,
        isFetching: false,
        lastFetchedAt: Date.now(),
      });
    } catch (error) {
      if (isAbortError(error) || activeRoleScope !== requestScope) {
        return;
      }

      applyZeroBadgeFallback();
    } finally {
      if (inFlightRequestId === requestId) {
        inFlightPromise = null;
      }

      if (inFlightAbortController === controller) {
        inFlightAbortController = null;
        useBadgeStore.setState({ isFetching: false });
      }
    }
  })();

  return inFlightPromise;
};

const ensurePollingLoop = () => {
  if (pollingTimerId !== null || !activeRoleScope || activeConsumers <= 0) {
    return;
  }

  pollingTimerId = window.setInterval(() => {
    if (!activeRoleScope) {
      return;
    }

    void refreshBadgeCountersInternal(activeRoleScope);
  }, BADGE_POLL_INTERVAL_MS);
};

const applyRoleScope = (nextRoleScope: BadgeRoleScope) => {
  if (activeRoleScope === nextRoleScope) {
    useBadgeStore.setState((state) =>
      state.roleScope === nextRoleScope
        ? state
        : {
            roleScope: nextRoleScope,
          },
    );
    return;
  }

  activeRoleScope = nextRoleScope;
  clearPollingTimer();
  stopInFlightRequest();

  useBadgeStore.setState((state) => ({
    counters: buildZeroCounters(state.counters),
    roleScope: nextRoleScope,
    isFetching: false,
    lastFetchedAt: null,
  }));

  if (activeRoleScope && activeConsumers > 0) {
    void refreshBadgeCountersInternal(activeRoleScope);
    ensurePollingLoop();
  }
};

export const attachBadgePolling = (user: User | null | undefined): (() => void) => {
  activeConsumers += 1;

  const roleScope = resolveBadgeRoleScope(user);
  applyRoleScope(roleScope);

  if (activeRoleScope) {
    void refreshBadgeCountersInternal(activeRoleScope);
    ensurePollingLoop();
  }

  return () => {
    activeConsumers = Math.max(0, activeConsumers - 1);

    if (activeConsumers === 0) {
      clearPollingTimer();
      stopInFlightRequest();
      useBadgeStore.setState({ isFetching: false });
    }
  };
};

export const refreshBadgeCounters = async (): Promise<void> => {
  if (!activeRoleScope) {
    applyZeroBadgeFallback();
    return;
  }

  await refreshBadgeCountersInternal(activeRoleScope);
};
