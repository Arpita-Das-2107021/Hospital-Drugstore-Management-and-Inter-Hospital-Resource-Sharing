import type { User } from '@/services/authService';

type ScopePermissionBreakdown = {
  platform_roles?: string[];
  hospital_role?: string[];
  [scope: string]: unknown;
};

type EffectivePermissionApiShape = {
  platform_roles?: string[];
  hospital_role?: string | null;
  effective_permissions?: unknown;
  permissions_by_scope?: ScopePermissionBreakdown;
};

const PLATFORM_ADMIN_ROLE_NAMES = ['SUPER_ADMIN', 'PLATFORM_ADMIN'];
const HOSPITAL_ADMIN_ROLE_NAMES = ['HOSPITAL_ADMIN', 'HEALTHCARE_ADMIN'];
const ROLE_ALIAS_MAP: Record<string, string> = {
  HEALTHCARE_ADMIN: 'HOSPITAL_ADMIN',
  HEALTH_CARE_ADMIN: 'HOSPITAL_ADMIN',
};

const PLATFORM_ROLE_MANAGE_PERMISSION_CODES = [
  'platform:role.manage',
  'platform:role.assign',
  'platform:user_role.assign',
  'platform:user_role.view',
  'platform:role.view',
  'RBAC_PLATFORM_ROLES_MANAGE',
  'PLATFORM_ROLE_ADMIN',
  'ROLE_MANAGE_PLATFORM',
  'rbac.platform_roles.manage',
  'rbac.roles.platform.manage',
  'platform_roles.manage',
  'platform.roles.manage',
];

const HOSPITAL_ROLE_MANAGE_PERMISSION_CODES = [
  'hospital:role.manage',
  'hospital:role.assign',
  'hospital:user_role.assign',
  'hospital:user_role.view',
  'hospital:role.view',
  'RBAC_HOSPITAL_ROLES_MANAGE',
  'HOSPITAL_ROLE_ADMIN',
  'ROLE_MANAGE_HOSPITAL',
  'rbac.hospital_roles.manage',
  'rbac.roles.hospital.manage',
  'hospital_roles.manage',
  'hospital.roles.manage',
];

const PLATFORM_ADMIN_PERMISSION_CODES = [
  ...PLATFORM_ROLE_MANAGE_PERMISSION_CODES,
  'platform:hospital.review',
  'platform:hospital.manage',
  'platform:hospital.view',
  'platform:user.view',
  'platform:role.view',
];

const HOSPITAL_ADMIN_PERMISSION_CODES = [
  ...HOSPITAL_ROLE_MANAGE_PERMISSION_CODES,
  'hospital:staff.manage',
  'hospital:staff.supervise',
  'hospital:user_role.assign',
  'hospital:role.manage',
];

const SUPER_ADMIN_COMPAT_PERMISSION_CODES = [
  'platform:hospital.review',
  'platform:hospital.manage',
  'platform:hospital.view',
  'platform:user.view',
  'platform:user_role.assign',
  'platform:user_role.view',
  'platform:role.view',
  'platform:role.assign',
  'platform:role.manage',
  'platform:audit.view',
  'ml:job.view',
  'ml:job.manage',
  'ml:forecast.view',
  'ml:outbreak.view',
  'ml:suggestion.view',
  'ml:model_version.manage',
];

const resolveUserContext = (user: User | null | undefined): 'PLATFORM' | 'HEALTHCARE' | '' => {
  if (!user) return '';

  const explicitContext = typeof user.context === 'string' ? user.context.trim().toUpperCase() : '';
  if (explicitContext === 'PLATFORM' || explicitContext === 'HEALTHCARE') {
    return explicitContext;
  }

  const healthcareId =
    (typeof user.healthcare_id === 'string' ? user.healthcare_id.trim() : '') ||
    (typeof user.hospital_id === 'string' ? user.hospital_id.trim() : '');

  if (healthcareId) return 'HEALTHCARE';

  return '';
};

const hasHealthcareContext = (user: User | null | undefined): boolean => {
  return resolveUserContext(user) === 'HEALTHCARE';
};

const CANONICAL_SCOPE_PREFIXES = new Set(['hospital', 'platform']);

export const normalizeRoleName = (value: string | null | undefined): string => {
  if (!value) return '';
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  return ROLE_ALIAS_MAP[normalized] || normalized;
};

export const normalizePermissionCode = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_:]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).code === 'string') {
        return String((item as Record<string, unknown>).code);
      }
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string') {
        return String((item as Record<string, unknown>).name);
      }
      return '';
    })
    .map((item) => item.trim())
    .filter(Boolean);
};

const collectScopedPermissionCodes = (
  value: unknown,
): { platform_roles: string[]; hospital_role: string[] } => {
  const fallback = { platform_roles: [] as string[], hospital_role: [] as string[] };
  if (!value || typeof value !== 'object') return fallback;

  const scope = value as ScopePermissionBreakdown;
  const platformSet = new Set<string>();
  const hospitalSet = new Set<string>();

  const pushMany = (target: Set<string>, codes: string[]) => {
    codes.forEach((code) => target.add(code));
  };

  // Canonical keys.
  pushMany(platformSet, toStringArray(scope.platform_roles));
  pushMany(hospitalSet, toStringArray(scope.hospital_role));

  // Compatibility keys seen in backend variants.
  pushMany(platformSet, toStringArray(scope.platform_role));
  pushMany(platformSet, toStringArray(scope.platform));
  pushMany(platformSet, toStringArray(scope.platform_permissions));

  pushMany(hospitalSet, toStringArray(scope.hospital_roles));
  pushMany(hospitalSet, toStringArray(scope.hospital));
  pushMany(hospitalSet, toStringArray(scope.hospital_permissions));
  pushMany(hospitalSet, toStringArray(scope.healthcare));
  pushMany(hospitalSet, toStringArray(scope.healthcare_role));
  pushMany(hospitalSet, toStringArray(scope.healthcare_roles));

  // Generic fallback for unexpected scope bucket names.
  Object.entries(scope).forEach(([key, bucket]) => {
    const keyLower = key.toLowerCase();
    const codes = toStringArray(bucket);
    if (codes.length === 0) return;

    if (keyLower.includes('platform')) {
      pushMany(platformSet, codes);
    }
    if (keyLower.includes('hospital') || keyLower.includes('healthcare')) {
      pushMany(hospitalSet, codes);
    }
  });

  return {
    platform_roles: Array.from(platformSet),
    hospital_role: Array.from(hospitalSet),
  };
};

export const getCombinedRoleNames = (user: User | null | undefined): string[] => {
  if (!user) return [];

  const combined = new Set<string>();
  const push = (role: unknown) => {
    if (typeof role !== 'string') return;
    const normalized = normalizeRoleName(role);
    if (normalized) combined.add(normalized);
  };

  push(user.role);
  toStringArray(user.roles).forEach(push);
  toStringArray(user.platform_roles).forEach(push);
  push(user.hospital_role ?? '');

  return Array.from(combined);
};

export const getPlatformRoleNames = (user: User | null | undefined): string[] => {
  if (!user) return [];
  return toStringArray(user.platform_roles).map(normalizeRoleName).filter(Boolean);
};

export const getHospitalRoleName = (user: User | null | undefined): string => {
  if (!user) return '';
  if (!hasHealthcareContext(user)) return '';

  const fromHospitalRole = normalizeRoleName(user.hospital_role ?? '');
  if (fromHospitalRole) return fromHospitalRole;

  const roles = getCombinedRoleNames(user).filter((role) => !PLATFORM_ADMIN_ROLE_NAMES.includes(role));
  const hospitalAdminFallback = roles.find((role) => HOSPITAL_ADMIN_ROLE_NAMES.includes(role));
  if (hospitalAdminFallback) return hospitalAdminFallback;

  const normalizedLegacyRole = normalizeRoleName(user.role);
  if (normalizedLegacyRole && !PLATFORM_ADMIN_ROLE_NAMES.includes(normalizedLegacyRole)) {
    return normalizedLegacyRole;
  }

  return roles[0] || '';
};

const buildPermissionAliasSet = (permissions: string[]): Set<string> => {
  const aliasSet = new Set<string>();

  permissions.forEach((permission) => {
    if (!permission) return;

    const raw = permission.trim();
    if (!raw) return;

    aliasSet.add(raw);
    aliasSet.add(raw.toLowerCase());

    const normalized = normalizePermissionCode(raw);
    if (normalized) {
      aliasSet.add(normalized);

      const normalizedSegments = normalized.split('.').filter(Boolean);
      if (
        normalizedSegments.length >= 3 &&
        CANONICAL_SCOPE_PREFIXES.has(normalizedSegments[0])
      ) {
        aliasSet.add(normalizedSegments.slice(1).join('.'));
      }
    }

    if (raw.includes(':')) {
      const suffix = raw.split(':').slice(1).join(':').trim();
      if (suffix) {
        aliasSet.add(suffix);
        const normalizedSuffix = normalizePermissionCode(suffix);
        if (normalizedSuffix) {
          aliasSet.add(normalizedSuffix);
        }
      }
    } else {
      [`hospital:${raw}`, `platform:${raw}`].forEach((scopedCode) => {
        aliasSet.add(scopedCode);
        const normalizedScopedCode = normalizePermissionCode(scopedCode);
        if (normalizedScopedCode) {
          aliasSet.add(normalizedScopedCode);
        }
      });
    }
  });

  return aliasSet;
};

export const getEffectivePermissionCodes = (user: User | null | undefined): string[] => {
  if (!user) return [];

  const userRecord = user as unknown as Record<string, unknown>;
  const directCodes = Array.from(new Set([
    ...toStringArray(user.effective_permissions),
    ...toStringArray(userRecord.permissions),
    ...toStringArray(userRecord.permission_codes),
  ]));
  const scopedPermissions = collectScopedPermissionCodes(user.permissions_by_scope);
  const scopedPlatformCodes = scopedPermissions.platform_roles;
  const scopedHospitalCodes = scopedPermissions.hospital_role;
  const compatibilityCodes: string[] = [];

  const roleTokens = getCombinedRoleNames(user);
  if (resolveUserContext(user) === 'PLATFORM' && roleTokens.includes('SUPER_ADMIN')) {
    compatibilityCodes.push(...SUPER_ADMIN_COMPAT_PERMISSION_CODES);
  }

  return Array.from(new Set([
    ...directCodes,
    ...scopedPlatformCodes,
    ...scopedHospitalCodes,
    ...compatibilityCodes,
  ]));
};

export const hasAnyPermission = (user: User | null | undefined, requiredCodes: string[]): boolean => {
  if (!user || requiredCodes.length === 0) return false;

  const effectiveCodes = getEffectivePermissionCodes(user);
  if (effectiveCodes.length === 0) return false;

  const assignedAliases = buildPermissionAliasSet(effectiveCodes);
  return requiredCodes.some((requiredCode) => {
    const requiredAliases = buildPermissionAliasSet([requiredCode]);
    return Array.from(requiredAliases).some((alias) => assignedAliases.has(alias));
  });
};

export const hasAllPermissions = (user: User | null | undefined, requiredCodes: string[]): boolean => {
  if (!user || requiredCodes.length === 0) return false;

  const effectiveCodes = getEffectivePermissionCodes(user);
  if (effectiveCodes.length === 0) return false;

  const assignedAliases = buildPermissionAliasSet(effectiveCodes);
  return requiredCodes.every((requiredCode) => {
    const requiredAliases = buildPermissionAliasSet([requiredCode]);
    return Array.from(requiredAliases).some((alias) => assignedAliases.has(alias));
  });
};

export const hasAnyRole = (user: User | null | undefined, allowedRoles: string[]): boolean => {
  if (!user || allowedRoles.length === 0) return false;
  const combinedRoles = getCombinedRoleNames(user);
  const allowed = new Set(allowedRoles.map(normalizeRoleName));
  return combinedRoles.some((role) => allowed.has(role));
};

export const hasAnyPlatformRole = (user: User | null | undefined, allowedRoles: string[]): boolean => {
  if (!user || allowedRoles.length === 0) return false;
  const platformRoles = getPlatformRoleNames(user);
  const allowed = new Set(allowedRoles.map(normalizeRoleName));
  return platformRoles.some((role) => allowed.has(role));
};

export const hasHospitalRole = (user: User | null | undefined, allowedRoles: string[]): boolean => {
  if (!user || allowedRoles.length === 0) return false;
  if (!hasHealthcareContext(user)) return false;

  const hospitalRole = getHospitalRoleName(user);
  const allowed = new Set(allowedRoles.map(normalizeRoleName));
  return !!hospitalRole && allowed.has(hospitalRole);
};

export const isPlatformAdminUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (resolveUserContext(user) !== 'PLATFORM') return false;
  return hasAnyPermission(user, PLATFORM_ADMIN_PERMISSION_CODES);
};

export const isHospitalAdminUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (resolveUserContext(user) !== 'HEALTHCARE') return false;
  return hasAnyPermission(user, HOSPITAL_ADMIN_PERMISSION_CODES);
};

export const canManagePlatformRolesUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (resolveUserContext(user) !== 'PLATFORM') return false;
  return hasAnyPermission(user, PLATFORM_ROLE_MANAGE_PERMISSION_CODES);
};

export const canManageHospitalRolesUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  const context = resolveUserContext(user);
  if (context === 'HEALTHCARE') {
    return hasAnyPermission(user, HOSPITAL_ROLE_MANAGE_PERMISSION_CODES);
  }
  if (context === 'PLATFORM') {
    return hasAnyPermission(user, [...PLATFORM_ROLE_MANAGE_PERMISSION_CODES, ...HOSPITAL_ROLE_MANAGE_PERMISSION_CODES]);
  }
  return false;
};

export const extractList = <T = unknown>(response: unknown): T[] => {
  if (Array.isArray(response)) return response as T[];
  if (!response || typeof response !== 'object') return [];

  const root = response as Record<string, unknown>;
  const directCandidates = [root.data, root.results, root.items, root.permissions];
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) return candidate as T[];
  }

  const nested = root.data;
  if (nested && typeof nested === 'object') {
    const nestedRoot = nested as Record<string, unknown>;
    const nestedCandidates = [
      nestedRoot.data,
      nestedRoot.results,
      nestedRoot.items,
      nestedRoot.permissions,
    ];

    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate)) return candidate as T[];
    }

    if (nestedRoot.data && typeof nestedRoot.data === 'object') {
      const deepRoot = nestedRoot.data as Record<string, unknown>;
      const deepCandidates = [deepRoot.results, deepRoot.items];
      for (const candidate of deepCandidates) {
        if (Array.isArray(candidate)) return candidate as T[];
      }
    }
  }

  return [];
};

const parsePermissionsByScope = (value: unknown): { platform_roles: string[]; hospital_role: string[] } => {
  return collectScopedPermissionCodes(value);
};

export const extractEffectivePermissionPayload = (response: unknown): {
  platform_roles: string[];
  hospital_role: string | null;
  effective_permissions: string[];
  permissions_by_scope: { platform_roles: string[]; hospital_role: string[] };
} => {
  const root = (response && typeof response === 'object') ? response as Record<string, unknown> : {};
  const topLevelCandidate = (root.data && typeof root.data === 'object') ? root.data as Record<string, unknown> : root;
  const nestedDataCandidate =
    topLevelCandidate.data && typeof topLevelCandidate.data === 'object'
      ? topLevelCandidate.data as Record<string, unknown>
      : topLevelCandidate;
  const candidate =
    nestedDataCandidate.effective && typeof nestedDataCandidate.effective === 'object'
      ? nestedDataCandidate.effective as Record<string, unknown>
      : nestedDataCandidate;
  const shape = candidate as EffectivePermissionApiShape;
  const shapeRecord = candidate as Record<string, unknown>;
  const effectivePermissions = Array.from(new Set([
    ...toStringArray(shape.effective_permissions),
    ...toStringArray(shapeRecord.permissions),
    ...toStringArray(shapeRecord.permission_codes),
  ]));

  const hospitalRoleTokens = toStringArray(shapeRecord.hospital_roles);
  const hospitalRole =
    typeof shape.hospital_role === 'string'
      ? shape.hospital_role
      : hospitalRoleTokens[0] || null;

  return {
    platform_roles: Array.from(new Set([
      ...toStringArray(shape.platform_roles),
      ...toStringArray(shapeRecord.platform_role),
    ])),
    hospital_role: hospitalRole,
    effective_permissions: effectivePermissions,
    permissions_by_scope: parsePermissionsByScope(
      shape.permissions_by_scope ??
      shapeRecord.scoped_permissions ??
      shapeRecord.permissions_scope,
    ),
  };
};
