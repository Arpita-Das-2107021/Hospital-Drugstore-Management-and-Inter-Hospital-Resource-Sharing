import type { User } from '@/services/authService';
import { hasAllPermissions, hasAnyPermission, hasAnyPlatformRole } from '@/lib/rbac';

export type AccessContext = 'PLATFORM' | 'HEALTHCARE';
export type AccessMode = 'UI' | 'API';
export type NavScope = 'platform' | 'hospital' | 'shared';

export type AccessDenialReason =
  | 'unauthenticated'
  | 'missing_context'
  | 'forbidden_context'
  | 'forbidden_permission'
  | null;

export interface AccessRequirement {
  requiredContext?: AccessContext | AccessContext[];
  requiredPermissions?: string[];
  requireAllPermissions?: boolean;
}

export interface AccessResolution {
  allowed: boolean;
  context: AccessContext | null;
  accessMode: AccessMode | null;
  healthcareId: string | null;
  requiredContexts: AccessContext[];
  hasContextAccess: boolean;
  hasPermissionAccess: boolean;
  denialReason: AccessDenialReason;
}

const KNOWN_CONTEXTS = new Set<AccessContext>(['PLATFORM', 'HEALTHCARE']);
const KNOWN_ACCESS_MODES = new Set<AccessMode>(['UI', 'API']);

const PLATFORM_ENTRY_PERMISSION_CODES = [
  'platform:hospital.review',
  'platform:hospital.view',
  'platform:hospital.manage',
  'platform:user.view',
  'platform:role.view',
];

export const ML_DASHBOARD_ALLOWED_PLATFORM_ROLES = ['ML_ENGINEER', 'ML_ADMIN'];

export const ML_ENTRY_PERMISSION_CODES = [
  'ml:job.view',
  'ml:job.manage',
  'ml:forecast.view',
  'ml:outbreak.view',
  'ml:suggestion.view',
  'ml:dataset.review',
  'ml:training.manage',
  'ml:model_version.manage',
  'ml:model_version.activate',
];

const ML_OPERATIONS_ENTRY_PERMISSION_CODES = [
  'ml:job.view',
  'ml:job.manage',
  'ml:dataset.review',
  'ml:training.manage',
  'ml:model_version.manage',
  'ml:model_version.activate',
];

const ML_INSIGHTS_ENTRY_PERMISSION_CODES = [
  'ml:forecast.view',
  'ml:outbreak.view',
  'ml:suggestion.view',
  'ml:dataset.review',
  'ml:training.manage',
  'ml:model_version.manage',
  'ml:model_version.activate',
];

export const DASHBOARD_ENTRY_PERMISSION_CODES = [
  'dashboard:view',
  'hospital:inventory.view',
  'hospital:request.view',
  'hospital:hospital.view',
  'communication:chat.view',
  'reports:view',
];

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
};

export const normalizeAccessContext = (value: unknown): AccessContext | null => {
  const normalized = toNullableString(value)?.toUpperCase();
  if (!normalized) return null;
  if (!KNOWN_CONTEXTS.has(normalized as AccessContext)) return null;
  return normalized as AccessContext;
};

export const normalizeAccessMode = (value: unknown): AccessMode | null => {
  const normalized = toNullableString(value)?.toUpperCase();
  if (!normalized) return null;
  if (!KNOWN_ACCESS_MODES.has(normalized as AccessMode)) return null;
  return normalized as AccessMode;
};

export const getCanonicalHealthcareId = (user: User | null | undefined): string | null => {
  if (!user) return null;
  const healthcareId = toNullableString(user.healthcare_id);
  const hospitalId = toNullableString(user.hospital_id);
  return healthcareId || hospitalId || null;
};

export const hasHealthcareContext = (user: User | null | undefined): boolean => {
  return Boolean(getCanonicalHealthcareId(user));
};

export const resolveUserContext = (user: User | null | undefined): AccessContext | null => {
  if (!user) return null;

  const explicitContext = normalizeAccessContext(user.context);
  if (explicitContext) return explicitContext;

  if (hasHealthcareContext(user)) return 'HEALTHCARE';

  return null;
};

export const isPlatformContext = (user: User | null | undefined): boolean => {
  return resolveUserContext(user) === 'PLATFORM';
};

export const isHealthcareContext = (user: User | null | undefined): boolean => {
  return resolveUserContext(user) === 'HEALTHCARE';
};

export const resolveRequiredContexts = (
  requiredContext?: AccessContext | AccessContext[],
): AccessContext[] => {
  if (!requiredContext) return [];
  const contexts = Array.isArray(requiredContext) ? requiredContext : [requiredContext];
  return Array.from(new Set(contexts));
};

export const evaluateAccess = (
  user: User | null | undefined,
  requirement: AccessRequirement = {},
): AccessResolution => {
  const requiredContexts = resolveRequiredContexts(requirement.requiredContext);
  const context = resolveUserContext(user);
  const accessMode = normalizeAccessMode(user?.access_mode);
  const healthcareId = getCanonicalHealthcareId(user);

  const hasContextAccess =
    requiredContexts.length === 0 ? true : Boolean(context && requiredContexts.includes(context));

  const hasPermissionAccess = requirement.requiredPermissions?.length
    ? requirement.requireAllPermissions
      ? hasAllPermissions(user, requirement.requiredPermissions)
      : hasAnyPermission(user, requirement.requiredPermissions)
    : true;

  const isAuthenticated = Boolean(user);
  const allowed = Boolean(isAuthenticated && hasContextAccess && hasPermissionAccess);

  let denialReason: AccessDenialReason = null;
  if (!isAuthenticated) {
    denialReason = 'unauthenticated';
  } else if (!hasContextAccess) {
    denialReason = context ? 'forbidden_context' : 'missing_context';
  } else if (!hasPermissionAccess) {
    denialReason = 'forbidden_permission';
  }

  return {
    allowed,
    context,
    accessMode,
    healthcareId,
    requiredContexts,
    hasContextAccess,
    hasPermissionAccess,
    denialReason,
  };
};

export const scopeToRequiredContext = (scope: NavScope): AccessContext[] => {
  if (scope === 'platform') return ['PLATFORM'];
  if (scope === 'hospital') return ['HEALTHCARE'];
  return [];
};

export const canAccessNavItem = (
  user: User | null | undefined,
  scope: NavScope = 'shared',
  requiredPermissions?: string[],
): boolean => {
  const decision = evaluateAccess(user, {
    requiredContext: scopeToRequiredContext(scope),
    requiredPermissions,
  });
  return decision.allowed;
};

export const canAccessMlPlatformDashboards = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (resolveUserContext(user) !== 'PLATFORM') return false;
  return hasAnyPlatformRole(user, ML_DASHBOARD_ALLOWED_PLATFORM_ROLES);
};

export const resolveDefaultAuthenticatedPath = (user: User | null | undefined): string => {
  const context = resolveUserContext(user);

  if (
    context === 'PLATFORM' &&
    evaluateAccess(user, {
      requiredContext: 'PLATFORM',
      requiredPermissions: PLATFORM_ENTRY_PERMISSION_CODES,
    }).allowed
  ) {
    return '/admin/hospital-registrations';
  }

  if (
    context === 'HEALTHCARE' &&
    evaluateAccess(user, {
      requiredContext: 'HEALTHCARE',
      requiredPermissions: DASHBOARD_ENTRY_PERMISSION_CODES,
    }).allowed
  ) {
    return '/dashboard';
  }

  if (
    canAccessMlPlatformDashboards(user) &&
    context === 'PLATFORM' &&
    evaluateAccess(user, {
      requiredContext: 'PLATFORM',
      requiredPermissions: ML_OPERATIONS_ENTRY_PERMISSION_CODES,
    }).allowed
  ) {
    return '/ml/operations';
  }

  if (
    canAccessMlPlatformDashboards(user) &&
    context === 'PLATFORM' &&
    evaluateAccess(user, {
      requiredContext: 'PLATFORM',
      requiredPermissions: ML_INSIGHTS_ENTRY_PERMISSION_CODES,
    }).allowed
  ) {
    return '/ml/insights';
  }

  if (
    context === 'HEALTHCARE' &&
    evaluateAccess(user, {
      requiredContext: 'HEALTHCARE',
      requiredPermissions: ['hospital:inventory.view'],
    }).allowed
  ) {
    return '/inventory';
  }

  return '/profile';
};

export const getApiErrorStatus = (error: unknown): number | null => {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
};

export const getAccessErrorMessage = (
  error: unknown,
  options?: {
    unauthorizedMessage?: string;
    forbiddenMessage?: string;
    fallbackMessage?: string;
  },
): string => {
  const status = getApiErrorStatus(error);

  if (status === 401) {
    return options?.unauthorizedMessage || 'Your session expired. Please sign in again.';
  }

  if (status === 403) {
    return options?.forbiddenMessage || 'You are not authorized to perform this action.';
  }

  const defaultMessage = options?.fallbackMessage || 'The request could not be completed.';
  return error instanceof Error && error.message ? error.message : defaultMessage;
};
