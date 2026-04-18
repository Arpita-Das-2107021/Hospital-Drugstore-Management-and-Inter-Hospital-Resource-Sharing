import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getEffectivePermissionCodes, normalizePermissionCode } from '@/lib/rbac';
import type { User } from '@/services/authService';

const CANONICAL_SCOPE_PREFIXES = new Set(['hospital', 'platform']);

const buildPermissionAliases = (permission: string): string[] => {
  const raw = permission.trim();
  if (!raw) {
    return [];
  }

  const aliases = new Set<string>();
  aliases.add(raw);

  const normalized = normalizePermissionCode(raw);
  if (normalized) {
    aliases.add(normalized);

    const normalizedSegments = normalized.split('.').filter(Boolean);
    if (
      normalizedSegments.length >= 3 &&
      CANONICAL_SCOPE_PREFIXES.has(normalizedSegments[0])
    ) {
      aliases.add(normalizedSegments.slice(1).join('.'));
    }
  }

  if (raw.includes(':')) {
    const suffix = raw.split(':').slice(1).join(':').trim();
    if (suffix) {
      aliases.add(suffix);
      const normalizedSuffix = normalizePermissionCode(suffix);
      if (normalizedSuffix) {
        aliases.add(normalizedSuffix);
      }
    }
  } else {
    // Unscoped frontend checks should also match explicit scoped permission forms.
    const scopedCandidates = [`hospital:${raw}`, `platform:${raw}`];
    scopedCandidates.forEach((candidate) => {
      aliases.add(candidate);
      const normalizedCandidate = normalizePermissionCode(candidate);
      if (normalizedCandidate) {
        aliases.add(normalizedCandidate);
      }
    });
  }

  return Array.from(aliases);
};

const toPermissionSet = (user: User | null | undefined): Set<string> => {
  const set = new Set<string>();

  getEffectivePermissionCodes(user).forEach((permission) => {
    buildPermissionAliases(permission).forEach((alias) => {
      set.add(alias);
    });
  });

  return set;
};

export const hasEffectivePermission = (
  user: User | null | undefined,
  permission: string,
): boolean => {
  const requiredAliases = buildPermissionAliases(permission);
  if (requiredAliases.length === 0) {
    return false;
  }

  const permissionSet = toPermissionSet(user);
  return requiredAliases.some((alias) => permissionSet.has(alias));
};

export const hasAnyEffectivePermission = (
  user: User | null | undefined,
  permissions: string[],
): boolean => {
  if (permissions.length === 0) {
    return false;
  }

  const permissionSet = toPermissionSet(user);
  return permissions.some((permission) => {
    const requiredAliases = buildPermissionAliases(permission);
    return requiredAliases.some((alias) => permissionSet.has(alias));
  });
};

export const usePermission = () => {
  const { user } = useAuth();

  const permissionSet = useMemo(() => toPermissionSet(user), [user]);

  const can = useCallback(
    (permission: string): boolean => {
      const requiredAliases = buildPermissionAliases(permission);
      if (requiredAliases.length === 0) {
        return false;
      }

      return requiredAliases.some((alias) => permissionSet.has(alias));
    },
    [permissionSet],
  );

  const canAny = useCallback(
    (permissions: string[]): boolean => {
      if (permissions.length === 0) {
        return false;
      }

      return permissions.some((permission) => {
        const requiredAliases = buildPermissionAliases(permission);
        return requiredAliases.some((alias) => permissionSet.has(alias));
      });
    },
    [permissionSet],
  );

  const effectivePermissions = useMemo(() => {
    return getEffectivePermissionCodes(user)
      .map((permission) => (typeof permission === 'string' ? permission.trim() : ''))
      .filter(Boolean);
  }, [user]);

  return {
    can,
    canAny,
    effectivePermissions,
  };
};
