import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { permissionsApi, rbacApi, staffApi } from '@/services/api';
import {
  extractEffectivePermissionPayload,
  extractList,
  hasAnyPermission,
  normalizePermissionCode,
} from '@/lib/rbac';
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type RoleScope = 'platform' | 'hospital';
type MatrixPermissionAction = 'view' | 'manage' | 'admin';
type PermissionDisplayGroup = MatrixPermissionAction | 'other';
type RoleManagementScopeMode = 'auto' | 'platform' | 'hospital';

interface RoleManagementProps {
  scopeMode?: RoleManagementScopeMode;
}

interface PermissionCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

interface RoleRecord {
  id: string;
  scope: RoleScope;
  name: string;
  description: string;
  is_active: boolean;
  hospital_id: string;
  hospital_name: string;
  permission_codes: string[];
}

interface StaffRecord {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  hospital_id: string;
  hospital_name: string;
  legacy_role_name: string;
}

interface PlatformAssignment {
  assignment_id: string;
  role_id: string;
  role_name: string;
}

interface HospitalAssignment {
  role_id: string;
  role_name: string;
  hospital_id: string;
  hospital_name: string;
  replaced_existing: boolean;
}

interface EffectivePermissionState {
  platform_roles: string[];
  hospital_role: string | null;
  effective_permissions: string[];
  permissions_by_scope: {
    platform_roles: string[];
    hospital_role: string[];
  };
}

const emptyEffectivePermissions = (): EffectivePermissionState => ({
  platform_roles: [],
  hospital_role: null,
  effective_permissions: [],
  permissions_by_scope: {
    platform_roles: [],
    hospital_role: [],
  },
});

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const normalizeRoleToken = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');
const PLATFORM_SCOPE_VIEW_PERMISSIONS = [
  'platform:role.view',
  'platform:role.manage',
  'platform:user_role.view',
  'platform:user_role.assign',
  'platform:permission.view',
];

const PERMISSION_MATRIX_MODULES = [
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock visibility, updates, and controls',
    tokens: ['inventory', 'stock', 'catalog'],
  },
  {
    key: 'sharing',
    label: 'Resource Sharing',
    description: 'Offer, approve, and manage shared resources',
    tokens: ['sharing', 'share', 'request', 'resource_share'],
  },
  {
    key: 'transport',
    label: 'Transport',
    description: 'Dispatch, tracking, and delivery operations',
    tokens: ['transport', 'shipment', 'tracking', 'delivery'],
  },
  {
    key: 'communication',
    label: 'Communication',
    description: 'Messaging and emergency communication',
    tokens: ['communication', 'message', 'broadcast', 'conversation', 'chat', 'notification'],
  },
  {
    key: 'administration',
    label: 'Administration',
    description: 'Staff, role, and access oversight',
    tokens: ['admin', 'administration', 'staff', 'role', 'permission', 'rbac'],
  },
] as const;

const MATRIX_ACTION_LABELS: Record<MatrixPermissionAction, string> = {
  view: 'View',
  manage: 'Manage',
  admin: 'Supervise',
};

const PERMISSION_GROUP_HEADINGS: Record<PermissionDisplayGroup, string> = {
  view: 'View Permissions',
  manage: 'Edit / Manage Permissions',
  admin: 'Admin / Supervise Permissions',
  other: 'Other Permissions',
};

const PERMISSION_GROUP_ORDER: PermissionDisplayGroup[] = ['view', 'manage', 'admin', 'other'];

const MATRIX_ACTION_ORDER: MatrixPermissionAction[] = ['view', 'manage', 'admin'];

const MATRIX_ACTION_TOKENS: Record<MatrixPermissionAction, string[]> = {
  view: ['view', 'read', 'list', 'retrieve'],
  manage: ['manage', 'write', 'create', 'update', 'edit'],
  admin: ['admin', 'supervise', 'delete', 'approve', 'assign', 'revoke', 'review'],
};

type MatrixCodeMap = Record<string, Record<MatrixPermissionAction, string[]>>;

interface PaginationMeta {
  page: number;
  total_pages: number;
}

const PERMISSION_CATALOG_PAGE_SIZE = 200;

const permissionHasToken = (normalizedCode: string, token: string): boolean => {
  const normalizedToken = normalizePermissionCode(token);
  if (!normalizedCode || !normalizedToken) return false;

  const codeSegments = new Set(normalizedCode.split('.').filter(Boolean));
  if (!normalizedToken.includes('.')) {
    return codeSegments.has(normalizedToken);
  }

  return `.${normalizedCode}.`.includes(`.${normalizedToken}.`);
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const direct = toText((error as Record<string, unknown>).message);
    if (direct) return direct;
  }
  return fallback;
};

const looksLikePermissionCode = (value: string): boolean => /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(value);

const uniquePermissionCodes = (codes: string[]): string[] => {
  const byNormalizedCode = new Map<string, string>();
  codes.forEach((code) => {
    const normalized = normalizePermissionCode(code || '');
    const value = toText(code);
    if (!normalized || !value) return;
    if (!byNormalizedCode.has(normalized)) {
      byNormalizedCode.set(normalized, value);
    }
  });
  return Array.from(byNormalizedCode.values());
};

const buildMatrixCodeMap = (permissions: PermissionCatalogItem[]): MatrixCodeMap => {
  const matrix: MatrixCodeMap = {};

  PERMISSION_MATRIX_MODULES.forEach((module) => {
    matrix[module.key] = { view: [], manage: [], admin: [] };
  });

  permissions.forEach((permission) => {
    const normalizedCode = normalizePermissionCode(permission.code);
    if (!normalizedCode) return;

    const matchedModule = PERMISSION_MATRIX_MODULES.find((module) => (
      module.tokens.some((token) => permissionHasToken(normalizedCode, token))
    ));
    if (!matchedModule) return;

    const matchedAction = (Object.keys(MATRIX_ACTION_TOKENS) as MatrixPermissionAction[]).find((action) => (
      MATRIX_ACTION_TOKENS[action].some((token) => permissionHasToken(normalizedCode, token))
    )) || 'manage';

    matrix[matchedModule.key][matchedAction].push(permission.code);
  });

  return matrix;
};

const resolvePermissionDisplayGroup = (code: string): PermissionDisplayGroup => {
  const normalizedCode = normalizePermissionCode(code);
  if (!normalizedCode) return 'other';

  const action = MATRIX_ACTION_ORDER.find((candidateAction) => (
    MATRIX_ACTION_TOKENS[candidateAction].some((token) => permissionHasToken(normalizedCode, token))
  ));

  return action || 'other';
};

const collectPermissionCodes = (source: unknown, output: Set<string>) => {
  if (!source) return;

  if (typeof source === 'string') {
    const candidate = source.trim();
    if (candidate && looksLikePermissionCode(candidate)) {
      output.add(candidate);
    }
    return;
  }

  if (Array.isArray(source)) {
    source.forEach((entry) => collectPermissionCodes(entry, output));
    return;
  }

  if (typeof source !== 'object') return;

  const obj = source as Record<string, unknown>;
  const code = toText(obj.code ?? obj.permission_code);
  if (code && looksLikePermissionCode(code)) {
    output.add(code);
  }

  collectPermissionCodes(obj.permission_codes, output);
  collectPermissionCodes(obj.permissions, output);
  collectPermissionCodes(obj.results, output);
  collectPermissionCodes(obj.items, output);

  const nestedData = obj.data;
  if (nestedData && typeof nestedData === 'object') {
    collectPermissionCodes(nestedData, output);
  }
};

const extractPermissionCodes = (payload: unknown): string[] => {
  const collected = new Set<string>();
  collectPermissionCodes(payload, collected);
  return uniquePermissionCodes(Array.from(collected));
};

const mapPermissionCatalogItem = (raw: unknown): PermissionCatalogItem => {
  if (typeof raw === 'string') {
    return {
      id: raw,
      code: raw,
      name: raw,
      description: '',
      is_active: true,
    };
  }

  const obj = asRecord(raw);
  const code = toText(obj.code) || toText(obj.permission_code) || toText(obj.slug) || toText(obj.key);
  return {
    id: toText(obj.id) || code,
    code,
    name: toText(obj.name) || toText(obj.permission_name) || code,
    description: toText(obj.description),
    is_active: obj.is_active !== false,
  };
};

const buildPermissionCatalog = (payload: unknown): PermissionCatalogItem[] => (
  extractList(payload)
    .map(mapPermissionCatalogItem)
    .filter((permission) => Boolean(permission.code))
    .reduce((accumulator, permission) => {
      const normalized = normalizePermissionCode(permission.code);
      if (!normalized || accumulator.seen.has(normalized)) return accumulator;
      accumulator.seen.add(normalized);
      accumulator.items.push(permission);
      return accumulator;
    }, { seen: new Set<string>(), items: [] as PermissionCatalogItem[] })
    .items
    .sort((a, b) => a.code.localeCompare(b.code))
);

const extractPaginationMeta = (payload: unknown): PaginationMeta | null => {
  const root = asRecord(payload);
  const rootMeta = asRecord(root.meta);

  let meta = rootMeta;
  if (Object.keys(meta).length === 0) {
    const nestedData = asRecord(root.data);
    meta = asRecord(nestedData.meta);
  }

  if (Object.keys(meta).length === 0) return null;

  const parsedPage = Number(meta.page);
  const parsedTotalPages = Number(meta.total_pages);
  if (!Number.isFinite(parsedTotalPages) || parsedTotalPages < 1) return null;

  return {
    page: Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1,
    total_pages: Math.floor(parsedTotalPages),
  };
};

const fetchAllPermissionCatalog = async (): Promise<PermissionCatalogItem[]> => {
  const baseParams = {
    page: '1',
    limit: String(PERMISSION_CATALOG_PAGE_SIZE),
  };

  const firstPage = await permissionsApi.getAll(baseParams);
  const allPermissionRows: unknown[] = [...extractList(firstPage)];

  const paginationMeta = extractPaginationMeta(firstPage);
  const totalPages = paginationMeta?.total_pages || 1;

  for (let page = 2; page <= totalPages; page += 1) {
    const pageResponse = await permissionsApi.getAll({
      page: String(page),
      limit: String(PERMISSION_CATALOG_PAGE_SIZE),
    });
    allPermissionRows.push(...extractList(pageResponse));
  }

  return buildPermissionCatalog(allPermissionRows);
};

const mapRoleRecord = (raw: unknown, scope: RoleScope): RoleRecord => {
  const obj = asRecord(raw);
  const hospitalValue = obj.hospital;
  const hospitalObj = asRecord(hospitalValue);

  return {
    id: toText(obj.id) || toText(obj.name),
    scope,
    name: toText(obj.name) || 'UNNAMED_ROLE',
    description: toText(obj.description),
    is_active: obj.is_active !== false,
    hospital_id:
      toText(obj.hospital_id) ||
      (typeof hospitalValue === 'string' ? toText(hospitalValue) : '') ||
      toText(hospitalObj.id),
    hospital_name: toText(obj.hospital_name) || toText(hospitalObj.name),
    permission_codes: [],
  };
};

const mapStaffRecord = (raw: unknown): StaffRecord => {
  const obj = asRecord(raw);
  const userValue = obj.user;
  const userObj = asRecord(userValue);
  const roleObj = asRecord(obj.role);
  const hospitalValue = obj.hospital;
  const hospitalObj = asRecord(hospitalValue);

  const fullName =
    toText(obj.full_name) ||
    `${toText(obj.first_name)} ${toText(obj.last_name)}`.trim() ||
    toText(obj.email) ||
    'Staff';

  const userId =
    toText(obj.user_id) ||
    toText(obj.user_pk) ||
    toText(obj.account_id) ||
    toText(obj.auth_user_id) ||
    (typeof userValue === 'string' ? toText(userValue) : '') ||
    toText(userObj.id) ||
    toText(userObj.pk);

  return {
    id: toText(obj.id) || userId,
    user_id: userId,
    full_name: fullName,
    email: toText(obj.email) || toText(userObj.email),
    hospital_id:
      toText(obj.hospital_id) ||
      (typeof hospitalValue === 'string' ? toText(hospitalValue) : '') ||
      toText(hospitalObj.id),
    hospital_name: toText(obj.hospital_name) || toText(hospitalObj.name),
    legacy_role_name: toText(obj.role_name) || toText(roleObj.name) || toText(obj.position),
  };
};

const parseUserPlatformAssignments = (
  payload: unknown,
  roleLookupById: Record<string, RoleRecord>,
  roleLookupByName: Record<string, RoleRecord>,
): PlatformAssignment[] => {
  const listCandidate = extractList(payload);
  const entries = listCandidate.length > 0 ? listCandidate : [payload];
  const assignments: PlatformAssignment[] = [];

  entries.forEach((entry) => {
    const obj = asRecord(entry);
    const roleObj = asRecord(obj.role ?? obj.platform_role);

    let roleId = toText(obj.role_id) || toText(obj.platform_role_id) || toText(roleObj.id);
    let roleName = toText(obj.role_name) || toText(obj.platform_role_name) || toText(roleObj.name);

    const roleToken = toText(obj.role) || toText(obj.platform_role);
    if (!roleId && roleToken) {
      const byId = roleLookupById[roleToken];
      const byName = roleLookupByName[normalizeRoleToken(roleToken)];
      if (byId) roleId = byId.id;
      if (!roleId && byName) roleId = byName.id;
      if (!roleName && byName) roleName = byName.name;
    }

    if (!roleName && roleId && roleLookupById[roleId]) {
      roleName = roleLookupById[roleId].name;
    }

    if (!roleId) return;

    assignments.push({
      assignment_id: toText(obj.id) || toText(obj.assignment_id) || toText(obj.user_role_id) || roleId,
      role_id: roleId,
      role_name: roleName || roleId,
    });
  });

  const deduped = new Map<string, PlatformAssignment>();
  assignments.forEach((assignment) => {
    const key = assignment.role_id || assignment.assignment_id;
    if (!deduped.has(key)) {
      deduped.set(key, assignment);
    }
  });

  return Array.from(deduped.values());
};

const parseUserHospitalAssignment = (
  payload: unknown,
  roleLookupById: Record<string, RoleRecord>,
  roleLookupByName: Record<string, RoleRecord>,
): HospitalAssignment | null => {
  const root = asRecord(payload);
  let candidate: unknown = payload;

  if (Array.isArray(root.data) && root.data.length > 0) {
    candidate = root.data[0];
  } else if (root.data && typeof root.data === 'object') {
    candidate = root.data;
  }

  const obj = asRecord(candidate);
  if (Object.keys(obj).length === 0) return null;

  const roleObj = asRecord(obj.role ?? obj.hospital_role);
  let roleId = toText(obj.role_id) || toText(obj.hospital_role_id) || toText(roleObj.id);
  let roleName = toText(obj.role_name) || toText(roleObj.name);

  const roleToken = toText(obj.role) || toText(obj.hospital_role);
  if (!roleId && roleToken) {
    const byId = roleLookupById[roleToken];
    const byName = roleLookupByName[normalizeRoleToken(roleToken)];
    if (byId) roleId = byId.id;
    if (!roleId && byName) roleId = byName.id;
    if (!roleName && byName) roleName = byName.name;
    if (!roleName && !byName) roleName = roleToken;
  }

  if (!roleName && roleId && roleLookupById[roleId]) {
    roleName = roleLookupById[roleId].name;
  }

  if (!roleId && !roleName) return null;

  return {
    role_id: roleId,
    role_name: roleName || roleId,
    hospital_id: toText(obj.hospital_id) || toText(obj.hospital) || toText(roleObj.hospital),
    hospital_name: toText(obj.hospital_name),
    replaced_existing: Boolean(obj.replaced_existing),
  };
};

const extractRoleIdFromResponse = (payload: unknown, fallback = ''): string => {
  const root = asRecord(payload);
  const nested = asRecord(root.data);
  return toText(nested.id) || toText(root.id) || fallback;
};

const RoleManagement = ({ scopeMode = 'auto' }: RoleManagementProps) => {
  const {
    user,
    canManagePlatformRoles,
    canManageHospitalRoles,
  } = useAuth();
  const { toast } = useToast();
  const showPlatformScopeUi = scopeMode === 'platform'
    ? true
    : scopeMode === 'hospital'
      ? false
      : Boolean(user && hasAnyPermission(user, PLATFORM_SCOPE_VIEW_PERMISSIONS));
  const showHospitalScopeUi = scopeMode !== 'platform';

  const [activeTab, setActiveTab] = useState<'definitions' | 'assignments'>('definitions');
  const [roleScopeTab, setRoleScopeTab] = useState<RoleScope>(showPlatformScopeUi ? 'platform' : 'hospital');
  const [roleSearch, setRoleSearch] = useState('');
  const [selectedRolePermissionSearch, setSelectedRolePermissionSearch] = useState('');

  const [platformRoles, setPlatformRoles] = useState<RoleRecord[]>([]);
  const [hospitalRoles, setHospitalRoles] = useState<RoleRecord[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionCatalogItem[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);

  const [loadingDefinitions, setLoadingDefinitions] = useState(true);

  const [selectedPlatformRoleId, setSelectedPlatformRoleId] = useState('');
  const [selectedHospitalRoleId, setSelectedHospitalRoleId] = useState('');

  const [showEditor, setShowEditor] = useState(false);
  const [editorScope, setEditorScope] = useState<RoleScope>('platform');
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorHospitalId, setEditorHospitalId] = useState('');
  const [editorIsActive, setEditorIsActive] = useState(true);
  const [editorPermissionCodes, setEditorPermissionCodes] = useState<string[]>([]);
  const [editorLockedPermissionCodes, setEditorLockedPermissionCodes] = useState<string[]>([]);
  const [savingEditor, setSavingEditor] = useState(false);
  const [loadingPermissionCatalog, setLoadingPermissionCatalog] = useState(false);

  const [pendingDeleteRole, setPendingDeleteRole] = useState<{ scope: RoleScope; role: RoleRecord } | null>(null);

  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedPlatformRoleToAssign, setSelectedPlatformRoleToAssign] = useState('');
  const [selectedHospitalRoleToAssign, setSelectedHospitalRoleToAssign] = useState('');
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assigningPlatformRole, setAssigningPlatformRole] = useState(false);
  const [settingHospitalRole, setSettingHospitalRole] = useState(false);
  const [removingPlatformAssignmentId, setRemovingPlatformAssignmentId] = useState('');
  const [removingHospitalRole, setRemovingHospitalRole] = useState(false);

  const [userPlatformAssignments, setUserPlatformAssignments] = useState<PlatformAssignment[]>([]);
  const [userHospitalAssignment, setUserHospitalAssignment] = useState<HospitalAssignment | null>(null);
  const [effectivePermissionState, setEffectivePermissionState] = useState<EffectivePermissionState>(emptyEffectivePermissions());

  const [pendingHospitalReplacementRoleId, setPendingHospitalReplacementRoleId] = useState('');
  const [showHospitalReplacementDialog, setShowHospitalReplacementDialog] = useState(false);

  const permissionCatalogByCode = useMemo(() => {
    const index: Record<string, PermissionCatalogItem> = {};
    permissionsCatalog.forEach((permission) => {
      const normalized = normalizePermissionCode(permission.code);
      if (normalized) index[normalized] = permission;
    });
    return index;
  }, [permissionsCatalog]);

  const roleLookupById = useMemo(() => {
    const index: Record<string, RoleRecord> = {};
    [...platformRoles, ...hospitalRoles].forEach((role) => {
      if (role.id) index[role.id] = role;
    });
    return index;
  }, [platformRoles, hospitalRoles]);

  const roleLookupByName = useMemo(() => {
    const index: Record<string, RoleRecord> = {};
    [...platformRoles, ...hospitalRoles].forEach((role) => {
      index[normalizeRoleToken(role.name)] = role;
    });
    return index;
  }, [platformRoles, hospitalRoles]);

  const visibleHospitalRoles = useMemo(() => {
    if (!showHospitalScopeUi) return [];
    const scopedRoles = hospitalRoles.filter((role) => Boolean(role.hospital_id));

    if (showPlatformScopeUi) return scopedRoles;
    if (!user?.hospital_id) return [];
    return scopedRoles.filter((role) => role.hospital_id === user.hospital_id);
  }, [hospitalRoles, user, showPlatformScopeUi, showHospitalScopeUi]);

  const filteredStaff = useMemo(() => {
    let pool = staff;
    if (showHospitalScopeUi && !showPlatformScopeUi && user?.hospital_id) {
      pool = pool.filter((member) => !member.hospital_id || member.hospital_id === user.hospital_id);
    }

    const query = staffSearch.trim().toLowerCase();
    if (!query) return pool;

    return pool.filter((member) => (
      member.full_name.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query) ||
      member.hospital_name.toLowerCase().includes(query)
    ));
  }, [staff, staffSearch, user, showPlatformScopeUi, showHospitalScopeUi]);

  const selectedStaff = useMemo(
    () => staff.find((member) => member.id === selectedStaffId) || null,
    [staff, selectedStaffId],
  );

  const selectedStaffUserId = selectedStaff?.user_id || '';

  const selectedRole = useMemo(() => {
    if (roleScopeTab === 'platform') {
      return platformRoles.find((role) => role.id === selectedPlatformRoleId) || null;
    }
    return visibleHospitalRoles.find((role) => role.id === selectedHospitalRoleId) || null;
  }, [platformRoles, visibleHospitalRoles, roleScopeTab, selectedPlatformRoleId, selectedHospitalRoleId]);

  const selectedRolePermissionCodes = useMemo(
    () => uniquePermissionCodes(selectedRole?.permission_codes || []),
    [selectedRole],
  );

  const selectedRolePermissionDetails = useMemo(
    () => selectedRolePermissionCodes.map((code) => {
      const permission = permissionCatalogByCode[normalizePermissionCode(code)];
      return {
        code,
        name: permission?.name || code,
      };
    }),
    [selectedRolePermissionCodes, permissionCatalogByCode],
  );

  const editorPermissionSet = useMemo(() => {
    const set = new Set<string>();
    editorPermissionCodes.forEach((code) => {
      const normalized = normalizePermissionCode(code);
      if (normalized) set.add(normalized);
    });
    return set;
  }, [editorPermissionCodes]);

  const permissionMatrixCodeMap = useMemo(
    () => buildMatrixCodeMap(permissionsCatalog),
    [permissionsCatalog],
  );

  const activeRoleScopeTab: RoleScope = showPlatformScopeUi ? roleScopeTab : 'hospital';
  const currentScopeRoles = activeRoleScopeTab === 'platform' ? platformRoles : visibleHospitalRoles;
  const filteredCurrentScopeRoles = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    if (!query) return currentScopeRoles;

    return currentScopeRoles.filter((role) => (
      role.name.toLowerCase().includes(query) ||
      role.description.toLowerCase().includes(query) ||
      role.hospital_name.toLowerCase().includes(query)
    ));
  }, [currentScopeRoles, roleSearch]);

  const canManageCurrentScope = activeRoleScopeTab === 'platform' ? canManagePlatformRoles : canManageHospitalRoles;

  const filteredSelectedRolePermissionDetails = useMemo(() => {
    const query = selectedRolePermissionSearch.trim().toLowerCase();
    if (!query) return selectedRolePermissionDetails;

    return selectedRolePermissionDetails.filter((permission) => (
      permission.name.toLowerCase().includes(query) ||
      permission.code.toLowerCase().includes(query)
    ));
  }, [selectedRolePermissionDetails, selectedRolePermissionSearch]);

  const groupedSelectedRolePermissionDetails = useMemo(() => {
    const groups: Record<PermissionDisplayGroup, typeof filteredSelectedRolePermissionDetails> = {
      view: [],
      manage: [],
      admin: [],
      other: [],
    };

    filteredSelectedRolePermissionDetails.forEach((permission) => {
      const group = resolvePermissionDisplayGroup(permission.code);
      groups[group].push(permission);
    });

    return groups;
  }, [filteredSelectedRolePermissionDetails]);

  const fetchRolePermissionCodes = async (scope: RoleScope, roleId: string): Promise<string[]> => {
    if (!roleId) return [];

    try {
      const response = scope === 'platform'
        ? await rbacApi.getPlatformRolePermissions(roleId)
        : await rbacApi.getHospitalRolePermissions(roleId);
      return extractPermissionCodes(response);
    } catch {
      return [];
    }
  };

  const refreshDefinitions = async () => {
    try {
      setLoadingDefinitions(true);

      const [platformRolesResult, hospitalRolesResult, permissionsResult, staffResult] = await Promise.allSettled([
        showPlatformScopeUi ? rbacApi.getPlatformRoles() : Promise.resolve(null),
        showHospitalScopeUi ? rbacApi.getHospitalRoles() : Promise.resolve(null),
        fetchAllPermissionCatalog(),
        staffApi.getAll(),
      ]);

      const platformResponse = platformRolesResult.status === 'fulfilled' ? platformRolesResult.value : null;
      const hospitalResponse = hospitalRolesResult.status === 'fulfilled' ? hospitalRolesResult.value : null;
      const staffResponse = staffResult.status === 'fulfilled' ? staffResult.value : null;

      if (permissionsResult.status === 'rejected') {
        console.error('Failed to load permission catalog', permissionsResult.reason);
      }

      const nextPermissionCatalog = permissionsResult.status === 'fulfilled'
        ? permissionsResult.value
        : [];

      const basePlatformRoles = extractList(platformResponse)
        .map((entry) => mapRoleRecord(entry, 'platform'))
        .filter((role) => Boolean(role.id));

      const baseHospitalRoles = extractList(hospitalResponse)
        .map((entry) => mapRoleRecord(entry, 'hospital'))
        .filter((role) => Boolean(role.id));

      const [platformPermissionEntries, hospitalPermissionEntries] = await Promise.all([
        Promise.all(basePlatformRoles.map(async (role) => [role.id, await fetchRolePermissionCodes('platform', role.id)] as const)),
        Promise.all(baseHospitalRoles.map(async (role) => [role.id, await fetchRolePermissionCodes('hospital', role.id)] as const)),
      ]);

      const platformPermissionsByRole = new Map(platformPermissionEntries);
      const hospitalPermissionsByRole = new Map(hospitalPermissionEntries);

      const nextPlatformRoles = basePlatformRoles.map((role) => ({
        ...role,
        permission_codes: uniquePermissionCodes(platformPermissionsByRole.get(role.id) || []),
      }));

      const nextHospitalRoles = baseHospitalRoles.map((role) => ({
        ...role,
        permission_codes: uniquePermissionCodes(hospitalPermissionsByRole.get(role.id) || []),
      }));

      const nextVisibleHospitalRoles = !showHospitalScopeUi
        ? []
        : showPlatformScopeUi
          ? nextHospitalRoles.filter((role) => Boolean(role.hospital_id))
          : user?.hospital_id
            ? nextHospitalRoles.filter((role) => role.hospital_id === user.hospital_id)
            : [];

      const nextStaff = extractList(staffResponse)
        .map(mapStaffRecord)
        .filter((member) => Boolean(member.id));

      setPermissionsCatalog(nextPermissionCatalog);
      setPlatformRoles(nextPlatformRoles);
      setHospitalRoles(showHospitalScopeUi ? nextHospitalRoles : []);
      setStaff(nextStaff);

      if (showPlatformScopeUi) {
        setSelectedPlatformRoleId((previous) => {
          if (previous && nextPlatformRoles.some((role) => role.id === previous)) {
            return previous;
          }
          return nextPlatformRoles[0]?.id || '';
        });
      } else {
        setSelectedPlatformRoleId('');
      }

      if (showHospitalScopeUi) {
        setSelectedHospitalRoleId((previous) => {
          if (previous && nextVisibleHospitalRoles.some((role) => role.id === previous)) {
            return previous;
          }
          return nextVisibleHospitalRoles[0]?.id || '';
        });
      } else {
        setSelectedHospitalRoleId('');
      }

      setSelectedStaffId((previous) => {
        if (previous && nextStaff.some((member) => member.id === previous)) {
          return previous;
        }
        return nextStaff.find((member) => member.user_id)?.id || nextStaff[0]?.id || '';
      });

      if (showPlatformScopeUi) {
        setSelectedPlatformRoleToAssign((previous) => {
          if (previous && nextPlatformRoles.some((role) => role.id === previous)) {
            return previous;
          }
          return nextPlatformRoles[0]?.id || '';
        });
      } else {
        setSelectedPlatformRoleToAssign('');
      }

      if (showHospitalScopeUi) {
        setSelectedHospitalRoleToAssign((previous) => {
          if (previous && nextVisibleHospitalRoles.some((role) => role.id === previous)) {
            return previous;
          }
          return nextVisibleHospitalRoles[0]?.id || '';
        });
      } else {
        setSelectedHospitalRoleToAssign('');
      }
    } catch {
      toast({
        title: 'Failed to load role data',
        description: 'Please refresh and try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingDefinitions(false);
    }
  };

  const refreshPermissionCatalog = async (silent = true): Promise<void> => {
    try {
      setLoadingPermissionCatalog(true);
      const catalog = await fetchAllPermissionCatalog();
      setPermissionsCatalog(catalog);
    } catch (error: unknown) {
      console.error('Failed to refresh permission catalog', error);
      if (!silent) {
        toast({
          title: 'Failed to load permission catalog',
          description: getErrorMessage(error, 'Please try again.'),
          variant: 'destructive',
        });
      }
    } finally {
      setLoadingPermissionCatalog(false);
    }
  };

  const hydrateSelectedStaffAssignments = async (member: StaffRecord | null) => {
    if (!member?.user_id) {
      setUserPlatformAssignments([]);
      setUserHospitalAssignment(null);
      setEffectivePermissionState(emptyEffectivePermissions());
      return;
    }

    setLoadingAssignments(true);

    const [platformResult, hospitalResult, effectiveResult] = await Promise.allSettled([
      showPlatformScopeUi ? rbacApi.getUserPlatformRoles(member.user_id) : Promise.resolve(null),
      rbacApi.getUserHospitalRole(member.user_id),
      rbacApi.getUserEffectivePermissions(member.user_id),
    ]);

    if (showPlatformScopeUi && platformResult.status === 'fulfilled' && platformResult.value) {
      setUserPlatformAssignments(
        parseUserPlatformAssignments(platformResult.value, roleLookupById, roleLookupByName),
      );
    } else {
      setUserPlatformAssignments([]);
    }

    if (hospitalResult.status === 'fulfilled') {
      setUserHospitalAssignment(
        parseUserHospitalAssignment(hospitalResult.value, roleLookupById, roleLookupByName),
      );
    } else {
      setUserHospitalAssignment(null);
    }

    if (effectiveResult.status === 'fulfilled') {
      setEffectivePermissionState(extractEffectivePermissionPayload(effectiveResult.value));
    } else {
      setEffectivePermissionState(emptyEffectivePermissions());
    }

    setLoadingAssignments(false);
  };

  useEffect(() => {
    void refreshDefinitions();
  }, []);

  useEffect(() => {
    if (activeTab !== 'assignments') return;
    void hydrateSelectedStaffAssignments(selectedStaff);
  }, [activeTab, selectedStaff?.user_id, selectedStaff?.id, platformRoles, hospitalRoles, showPlatformScopeUi]);

  const openCreateRoleEditor = (scope: RoleScope) => {
    void refreshPermissionCatalog();
    setEditorScope(scope);
    setEditingRole(null);
    setEditorName('');
    setEditorDescription('');
    setEditorIsActive(true);
    setEditorHospitalId(scope === 'hospital' ? (user?.hospital_id || '') : '');
    setEditorPermissionCodes([]);
    setEditorLockedPermissionCodes([]);
    setShowEditor(true);
  };

  const openEditRoleEditor = (scope: RoleScope, role: RoleRecord) => {
    void refreshPermissionCatalog();
    const catalogCodeSet = new Set(
      permissionsCatalog
        .map((permission) => normalizePermissionCode(permission.code))
        .filter(Boolean),
    );

    const roleCodes = uniquePermissionCodes(role.permission_codes);
    const editableCodes = roleCodes.filter((code) => catalogCodeSet.has(normalizePermissionCode(code)));
    const lockedCodes = roleCodes.filter((code) => !catalogCodeSet.has(normalizePermissionCode(code)));

    setEditorScope(scope);
    setEditingRole(role);
    setEditorName(role.name);
    setEditorDescription(role.description || '');
    setEditorIsActive(role.is_active !== false);
    setEditorHospitalId(role.hospital_id || user?.hospital_id || '');
    setEditorPermissionCodes(editableCodes);
    setEditorLockedPermissionCodes(lockedCodes);
    setShowEditor(true);
  };

  const setPermissionMatrixCell = (
    moduleKey: string,
    action: MatrixPermissionAction,
    checked: boolean,
  ) => {
    const cellCodes = permissionMatrixCodeMap[moduleKey]?.[action] || [];
    if (cellCodes.length === 0) return;

    setEditorPermissionCodes((previous) => {
      if (checked) {
        return uniquePermissionCodes([...previous, ...cellCodes]);
      }

      const removeSet = new Set(
        cellCodes
          .map((code) => normalizePermissionCode(code))
          .filter(Boolean),
      );

      return uniquePermissionCodes(
        previous.filter((code) => !removeSet.has(normalizePermissionCode(code))),
      );
    });
  };

  const saveRoleDefinition = async () => {
    const canManage = editorScope === 'platform' ? canManagePlatformRoles : canManageHospitalRoles;
    if (!canManage) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to manage this role scope.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedName = normalizeRoleToken(editorName);
    if (!normalizedName || !/^[A-Z][A-Z0-9_]*$/.test(normalizedName)) {
      toast({
        title: 'Invalid role name',
        description: 'Role names must be uppercase and use underscores only.',
        variant: 'destructive',
      });
      return;
    }

    const trimmedHospitalId = editorHospitalId.trim();
    if (editorScope === 'hospital' && !trimmedHospitalId) {
      toast({
        title: 'Hospital ID is required',
        description: 'Hospital-scoped roles must be tied to a hospital.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingEditor(true);

      const rolePayloadBase = {
        name: normalizedName,
        description: editorDescription.trim() || undefined,
        is_active: editorIsActive,
      };

      let roleId = editingRole?.id || '';

      if (editorScope === 'platform') {
        if (editingRole) {
          await rbacApi.updatePlatformRole(editingRole.id, rolePayloadBase);
        } else {
          const created = await rbacApi.createPlatformRole(rolePayloadBase);
          roleId = extractRoleIdFromResponse(created, roleId);
        }
      } else {
        const hospitalPayload = {
          ...rolePayloadBase,
          hospital: trimmedHospitalId,
        };

        if (editingRole) {
          await rbacApi.updateHospitalRole(editingRole.id, hospitalPayload);
        } else {
          const created = await rbacApi.createHospitalRole(hospitalPayload);
          roleId = extractRoleIdFromResponse(created, roleId);
        }
      }

      const finalPermissionCodes = uniquePermissionCodes([
        ...editorPermissionCodes,
        ...editorLockedPermissionCodes,
      ]);

      if (roleId) {
        if (editorScope === 'platform') {
          if (finalPermissionCodes.length > 0) {
            await rbacApi.assignPlatformRolePermissions(roleId, { permission_codes: finalPermissionCodes });
          } else {
            await rbacApi.clearPlatformRolePermissions(roleId);
          }
        } else {
          if (finalPermissionCodes.length > 0) {
            await rbacApi.assignHospitalRolePermissions(roleId, { permission_codes: finalPermissionCodes });
          } else {
            await rbacApi.clearHospitalRolePermissions(roleId);
          }
        }
      }

      toast({
        title: editingRole ? 'Role updated' : 'Role created',
        description: `${normalizedName} has been saved.`,
      });

      setShowEditor(false);
      await refreshDefinitions();
    } catch (error: unknown) {
      toast({
        title: 'Failed to save role',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSavingEditor(false);
    }
  };

  const deleteRoleDefinition = async () => {
    if (!pendingDeleteRole) return;

    const { scope, role } = pendingDeleteRole;
    const canManage = scope === 'platform' ? canManagePlatformRoles : canManageHospitalRoles;
    if (!canManage) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to delete this role.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (scope === 'platform') {
        await rbacApi.deletePlatformRole(role.id);
      } else {
        await rbacApi.deleteHospitalRole(role.id);
      }

      toast({
        title: 'Role deleted',
        description: `${role.name} has been removed.`,
      });

      setPendingDeleteRole(null);
      await refreshDefinitions();
    } catch (error: unknown) {
      toast({
        title: 'Failed to delete role',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const isCrossHospitalAssignment = useMemo(() => {
    if (showPlatformScopeUi) return false;
    if (!user?.hospital_id || !selectedStaff?.hospital_id) return false;
    return user.hospital_id !== selectedStaff.hospital_id;
  }, [user, selectedStaff, showPlatformScopeUi]);

  const refreshSelectedStaffAssignments = async () => {
    await hydrateSelectedStaffAssignments(selectedStaff);
  };

  const assignPlatformRole = async () => {
    if (!canManagePlatformRoles) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to assign platform roles.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedStaffUserId || !selectedPlatformRoleToAssign) {
      toast({
        title: 'Select staff and role',
        variant: 'destructive',
      });
      return;
    }

    if (userPlatformAssignments.some((assignment) => assignment.role_id === selectedPlatformRoleToAssign)) {
      toast({
        title: 'Role already assigned',
      });
      return;
    }

    try {
      setAssigningPlatformRole(true);
      await rbacApi.assignUserPlatformRole(selectedStaffUserId, { role_id: selectedPlatformRoleToAssign });
      toast({ title: 'Platform role assigned' });
      await hydrateSelectedStaffAssignments(selectedStaff);
    } catch (error: unknown) {
      toast({
        title: 'Failed to assign platform role',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setAssigningPlatformRole(false);
    }
  };

  const removePlatformRole = async (assignment: PlatformAssignment) => {
    if (!selectedStaffUserId) return;

    try {
      setRemovingPlatformAssignmentId(assignment.assignment_id || assignment.role_id);
      await rbacApi.removeUserPlatformRole(selectedStaffUserId, assignment.assignment_id || assignment.role_id);
      toast({ title: 'Platform role removed' });
      await hydrateSelectedStaffAssignments(selectedStaff);
    } catch (error: unknown) {
      toast({
        title: 'Failed to remove platform role',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setRemovingPlatformAssignmentId('');
    }
  };

  const performHospitalRoleAssignment = async (roleId: string, forceReplace: boolean) => {
    if (!selectedStaffUserId) return;

    if (isCrossHospitalAssignment) {
      toast({
        title: 'Cross-hospital assignment not allowed',
        description: 'Hospital role assignment can only target staff inside your hospital.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSettingHospitalRole(true);
      const response = await rbacApi.setUserHospitalRole(selectedStaffUserId, {
        role_id: roleId,
        force_replace: forceReplace,
      });

      const root = asRecord(response);
      const data = asRecord(root.data);
      const replacedExisting = Boolean(data.replaced_existing ?? root.replaced_existing);

      toast({
        title: replacedExisting ? 'Hospital role replaced' : 'Hospital role assigned',
        description: replacedExisting
          ? 'Previous hospital role assignment was replaced.'
          : 'Hospital role assignment updated successfully.',
      });

      setShowHospitalReplacementDialog(false);
      setPendingHospitalReplacementRoleId('');
      await hydrateSelectedStaffAssignments(selectedStaff);
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to assign hospital role');
      const replacementRequired = /force[_\s-]?replace|replace existing|already has .*hospital role|existing assignment/i.test(message);
      const hospitalScopeError = /cross|different hospital|hospital mismatch|outside hospital/i.test(message);

      if (!forceReplace && replacementRequired) {
        setPendingHospitalReplacementRoleId(roleId);
        setShowHospitalReplacementDialog(true);
        return;
      }

      toast({
        title: hospitalScopeError
          ? 'Cross-hospital assignment rejected'
          : 'Failed to assign hospital role',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSettingHospitalRole(false);
    }
  };

  const assignHospitalRole = async () => {
    if (!canManageHospitalRoles) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to assign hospital roles.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedStaffUserId || !selectedHospitalRoleToAssign) {
      toast({
        title: 'Select staff and role',
        variant: 'destructive',
      });
      return;
    }

    const selectedHospitalRoleRecord = hospitalRoles.find(
      (role) => role.id === selectedHospitalRoleToAssign,
    );

    if (!selectedHospitalRoleRecord?.hospital_id) {
      toast({
        title: 'Role is not hospital-scoped',
        description: 'Please use a role that is tied to a specific hospital.',
        variant: 'destructive',
      });
      return;
    }

    if (
      selectedStaff?.hospital_id &&
      selectedHospitalRoleRecord.hospital_id !== selectedStaff.hospital_id
    ) {
      toast({
        title: 'Role belongs to a different hospital',
        description: 'Choose a role scoped to the selected staff hospital.',
        variant: 'destructive',
      });
      return;
    }

    if (userHospitalAssignment?.role_id && userHospitalAssignment.role_id !== selectedHospitalRoleToAssign) {
      setPendingHospitalReplacementRoleId(selectedHospitalRoleToAssign);
      setShowHospitalReplacementDialog(true);
      return;
    }

    await performHospitalRoleAssignment(selectedHospitalRoleToAssign, false);
  };

  const confirmHospitalRoleReplacement = async () => {
    if (!pendingHospitalReplacementRoleId) return;
    await performHospitalRoleAssignment(pendingHospitalReplacementRoleId, true);
  };

  const removeHospitalRole = async () => {
    if (!canManageHospitalRoles) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to remove hospital roles.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedStaffUserId) return;

    if (isCrossHospitalAssignment) {
      toast({
        title: 'Cross-hospital assignment not allowed',
        description: 'Hospital role removal can only target staff inside your hospital.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setRemovingHospitalRole(true);
      await rbacApi.removeUserHospitalRole(selectedStaffUserId);
      toast({ title: 'Hospital role removed' });
      await hydrateSelectedStaffAssignments(selectedStaff);
    } catch (error: unknown) {
      toast({
        title: 'Failed to remove hospital role',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setRemovingHospitalRole(false);
    }
  };

  const effectiveUnionPermissions = useMemo(
    () => uniquePermissionCodes(effectivePermissionState.effective_permissions),
    [effectivePermissionState.effective_permissions],
  );

  const platformScopedPermissions = useMemo(
    () => uniquePermissionCodes(effectivePermissionState.permissions_by_scope.platform_roles),
    [effectivePermissionState.permissions_by_scope.platform_roles],
  );

  const hospitalScopedPermissions = useMemo(
    () => uniquePermissionCodes(effectivePermissionState.permissions_by_scope.hospital_role),
    [effectivePermissionState.permissions_by_scope.hospital_role],
  );

  return (
    <AppLayout
      title="Role Management"
      // subtitle="Manage roles, assignments, and user access"
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'definitions' | 'assignments')}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="definitions">Role Definitions</TabsTrigger>
            <TabsTrigger value="assignments">User Assignments</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refreshDefinitions}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Role Data
            </Button>
            <Button
              onClick={() => openCreateRoleEditor(activeRoleScopeTab)}
              disabled={!canManageCurrentScope}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create {activeRoleScopeTab === 'platform' ? 'Platform' : 'Hospital'} Role
            </Button>
          </div>
        </div>

        <TabsContent value="definitions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Role Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {showPlatformScopeUi && showHospitalScopeUi ? (
                <Tabs value={roleScopeTab} onValueChange={(value) => setRoleScopeTab(value as RoleScope)}>
                  <TabsList>
                    <TabsTrigger value="platform">Platform Roles</TabsTrigger>
                    <TabsTrigger value="hospital">Hospital Roles</TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{showPlatformScopeUi ? 'Platform Roles' : 'Hospital Roles'}</Badge>
                </div>
              )}

              <div className="max-w-sm space-y-2">
                <Label htmlFor="role-search">Search Roles</Label>
                <Input
                  id="role-search"
                  value={roleSearch}
                  onChange={(event) => setRoleSearch(event.target.value)}
                  placeholder="Filter by role name or description"
                />
              </div>

              {loadingDefinitions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCurrentScopeRoles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No roles match the current filter.
                        </TableCell>
                      </TableRow>
                    ) : filteredCurrentScopeRoles.map((role) => {
                      const isSelected = activeRoleScopeTab === 'platform'
                        ? selectedPlatformRoleId === role.id
                        : selectedHospitalRoleId === role.id;
                      return (
                        <TableRow
                          key={`${role.scope}-${role.id}`}
                          className={`${isSelected ? 'bg-muted/40' : ''} cursor-pointer`}
                          onClick={() => {
                            if (activeRoleScopeTab === 'platform') {
                              setSelectedPlatformRoleId(role.id);
                            } else {
                              setSelectedHospitalRoleId(role.id);
                            }
                          }}
                        >
                          <TableCell className="font-medium hover:underline underline-offset-2">{role.name}</TableCell>
                          <TableCell className="text-muted-foreground">{role.description || 'No description'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{role.permission_codes.length} permissions</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={role.is_active ? 'default' : 'outline'}>
                              {role.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={role.scope === 'platform' ? !canManagePlatformRoles : !canManageHospitalRoles}
                                onClick={() => openEditRoleEditor(role.scope, role)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveTab('assignments');
                                  if (role.scope === 'platform') {
                                    setSelectedPlatformRoleToAssign(role.id);
                                  } else {
                                    setSelectedHospitalRoleToAssign(role.id);
                                  }
                                }}
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                Assign User
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={role.scope === 'platform' ? !canManagePlatformRoles : !canManageHospitalRoles}
                                onClick={() => setPendingDeleteRole({ scope: role.scope, role })}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selected Role Permissions</CardTitle>
              <CardDescription>
                {selectedRole
                  ? selectedRole.name
                  : 'Select a role to inspect assigned permission codes.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedRole ? (
                <p className="text-sm text-muted-foreground">No role selected.</p>
              ) : (
              <div className="space-y-4">
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="selected-role-permission-search" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Filter Permissions
                </Label>
                <Input
                  id="selected-role-permission-search"
                  value={selectedRolePermissionSearch}
                  onChange={(event) => setSelectedRolePermissionSearch(event.target.value)}
                  placeholder="Search by name or code…"
                  className="h-9 text-base bg-muted/40"
                />
                <p className="text-sm text-muted-foreground/70">
                  {filteredSelectedRolePermissionDetails.length} of {selectedRolePermissionDetails.length} permissions
                </p>
              </div>

              {selectedRolePermissionDetails.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No permissions assigned to this role.</p>
                </div>
              ) : filteredSelectedRolePermissionDetails.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No permissions match your filter.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {PERMISSION_GROUP_ORDER.map((group) => {
                    const permissionsInGroup = groupedSelectedRolePermissionDetails[group];
                    if (permissionsInGroup.length === 0) return null;

                    return (
                      <div key={`${selectedRole.id}-${group}`} className="rounded-lg border border-border/50 bg-card p-3 space-y-2">
                        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
                          {PERMISSION_GROUP_HEADINGS[group]}
                          <span className="ml-1.5 text-muted-foreground/50 font-normal">({permissionsInGroup.length})</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {permissionsInGroup.map((permission) => (
                            <Badge
                              key={`${selectedRole.id}-${group}-${permission.code}`}
                              variant="secondary"
                              title={permission.code}
                              className="text-sm font-medium px-2 py-0.5 bg-secondary/60 hover:bg-secondary transition-colors"
                            >
                              {permission.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>

              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Assignments</CardTitle>
              <CardDescription>
                {showPlatformScopeUi && showHospitalScopeUi
                  ? 'Assign access roles and review combined access for the selected user.'
                  : showPlatformScopeUi
                    ? 'Assign platform roles and review access for the selected user.'
                    : 'Assign a hospital role and review access for the selected user.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 lg:col-span-1">
                  <Label htmlFor="staff-search">Search Staff</Label>
                  <Input
                    id="staff-search"
                    placeholder="Search by name or email"
                    value={staffSearch}
                    onChange={(event) => setStaffSearch(event.target.value)}
                  />
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <Label>Select Staff</Label>
                  <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredStaff.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name} ({member.email || 'No email'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end lg:col-span-1">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={refreshSelectedStaffAssignments}
                    disabled={!selectedStaffUserId || loadingAssignments}
                  >
                    {loadingAssignments ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Refresh User Access
                  </Button>
                </div>
              </div>

              {selectedStaff && (
                <div className="rounded-lg border p-3 text-sm bg-muted/30">
                  <p className="font-medium">{selectedStaff.full_name}</p>
                  <p className="text-muted-foreground">{selectedStaff.email || 'No email'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">Hospital: {selectedStaff.hospital_name || selectedStaff.hospital_id || 'Unknown'}</Badge>
                    <Badge variant="outline">Legacy role: {selectedStaff.legacy_role_name || 'Unassigned'}</Badge>
                    {!selectedStaff.user_id && <Badge variant="destructive">Missing user identifier</Badge>}
                    {isCrossHospitalAssignment && (
                      <Badge variant="destructive">Cross-hospital restrictions apply</Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className={showPlatformScopeUi && showHospitalScopeUi ? 'grid gap-6 xl:grid-cols-2' : 'grid gap-6'}>
            {showPlatformScopeUi && (
            <Card>
              <CardHeader>
                <CardTitle>Platform Role Assignments</CardTitle>
                <CardDescription>Users can hold multiple platform roles.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingAssignments ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : userPlatformAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No platform roles assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {userPlatformAssignments.map((assignment) => (
                      <div key={`${assignment.assignment_id}-${assignment.role_id}`} className="flex items-center justify-between rounded-md border p-2">
                        <div>
                          <p className="text-sm font-medium">{assignment.role_name || assignment.role_id}</p>
                          <p className="text-xs text-muted-foreground">{assignment.role_id}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManagePlatformRoles || removingPlatformAssignmentId === (assignment.assignment_id || assignment.role_id)}
                          onClick={() => removePlatformRole(assignment)}
                        >
                          {removingPlatformAssignmentId === (assignment.assignment_id || assignment.role_id) ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <UserMinus className="h-4 w-4 mr-1" />
                          )}
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Select value={selectedPlatformRoleToAssign} onValueChange={setSelectedPlatformRoleToAssign}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose platform role" />
                    </SelectTrigger>
                    <SelectContent>
                      {platformRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={assignPlatformRole}
                    disabled={
                      assigningPlatformRole ||
                      !selectedStaffUserId ||
                      !selectedPlatformRoleToAssign ||
                      !canManagePlatformRoles
                    }
                  >
                    {assigningPlatformRole ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Assign Platform Role
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}

            {showHospitalScopeUi && (
            <Card>
              <CardHeader>
                <CardTitle>Hospital Role Assignment</CardTitle>
                <CardDescription>Each user can hold one hospital role at a time.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingAssignments ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : userHospitalAssignment ? (
                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium">{userHospitalAssignment.role_name || userHospitalAssignment.role_id}</p>
                    <p className="text-xs text-muted-foreground">{userHospitalAssignment.role_id || 'Role ID unavailable'}</p>
                    {(userHospitalAssignment.hospital_name || userHospitalAssignment.hospital_id) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Hospital: {userHospitalAssignment.hospital_name || userHospitalAssignment.hospital_id}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hospital role assigned.</p>
                )}

                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <Select value={selectedHospitalRoleToAssign} onValueChange={setSelectedHospitalRoleToAssign}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose hospital role" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleHospitalRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={assignHospitalRole}
                    disabled={
                      settingHospitalRole ||
                      !selectedStaffUserId ||
                      !selectedHospitalRoleToAssign ||
                      !canManageHospitalRoles
                    }
                  >
                    {settingHospitalRole ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    {userHospitalAssignment ? 'Set / Replace' : 'Assign'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={removeHospitalRole}
                    disabled={
                      removingHospitalRole ||
                      !selectedStaffUserId ||
                      !userHospitalAssignment ||
                      !canManageHospitalRoles
                    }
                  >
                    {removingHospitalRole ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4 mr-2" />
                    )}
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Effective Permissions</CardTitle>
              <CardDescription>
                Combined access for the selected user.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedStaffUserId ? (
                <p className="text-sm text-muted-foreground">Select a staff member to inspect effective permissions.</p>
              ) : loadingAssignments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {showPlatformScopeUi ? (
                      <Badge variant="outline">
                        Platform Roles: {effectivePermissionState.platform_roles.join(', ') || 'None'}
                      </Badge>
                    ) : null}
                    {showHospitalScopeUi ? (
                      <Badge variant="outline">
                        Hospital Role: {effectivePermissionState.hospital_role || 'None'}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary">Union: {effectiveUnionPermissions.length} permissions</Badge>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">All Assigned Permissions</p>
                    {effectiveUnionPermissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No effective permissions found.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {effectiveUnionPermissions.map((code) => (
                          <Badge key={`union-${code}`}>
                            {permissionCatalogByCode[normalizePermissionCode(code)]?.name || code}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={showPlatformScopeUi && showHospitalScopeUi ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
                    {showPlatformScopeUi ? (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">From Additional Roles</p>
                        {platformScopedPermissions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {platformScopedPermissions.map((code) => (
                              <Badge key={`platform-${code}`} variant="outline">
                                {permissionCatalogByCode[normalizePermissionCode(code)]?.name || code}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {showHospitalScopeUi ? (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">From Primary Role</p>
                        {hospitalScopedPermissions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {hospitalScopedPermissions.map((code) => (
                              <Badge key={`hospital-${code}`} variant="outline">
                                {permissionCatalogByCode[normalizePermissionCode(code)]?.name || code}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
            <DialogDescription>
              Configure {editorScope} role metadata and assign permission catalog entries.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name*</Label>
                <Input
                  id="role-name"
                  value={editorName}
                  onChange={(event) => setEditorName(event.target.value)}
                  placeholder="EXAMPLE_ROLE"
                />
                <p className="text-xs text-muted-foreground">Saved in uppercase with underscores.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role-description">Description</Label>
                <Input
                  id="role-description"
                  value={editorDescription}
                  onChange={(event) => setEditorDescription(event.target.value)}
                  placeholder="Short role purpose"
                />
              </div>

              {/* {editorScope === 'hospital' && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="role-hospital-id">Hospital ID</Label>
                  <Input
                    id="role-hospital-id"
                    value={editorHospitalId}
                    onChange={(event) => setEditorHospitalId(event.target.value)}
                    placeholder="Hospital UUID"
                  />
                </div>
              )} */}

              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={editorIsActive}
                    onCheckedChange={(checked) => setEditorIsActive(Boolean(checked))}
                  />
                  Active role
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Permission Matrix</Label>
              <p className="text-xs text-muted-foreground">
                Toggle permissions by capability area and access level.
              </p>
              {loadingPermissionCatalog && (
                <p className="text-xs text-muted-foreground">Refreshing permission options...</p>
              )}
              {permissionsCatalog.length === 0 && (
                <p className="text-xs text-amber-600">
                  Permission options are currently unavailable, so matrix cells are disabled.
                </p>
              )}

              <div className="rounded-lg border">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-12 gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                      <div className="col-span-6">Capability Area</div>
                      {MATRIX_ACTION_ORDER.map((action) => (
                        <div key={`header-${action}`} className="col-span-2 text-center">
                          {MATRIX_ACTION_LABELS[action]}
                        </div>
                      ))}
                    </div>

                    <div className="divide-y">
                      {PERMISSION_MATRIX_MODULES.map((module) => (
                        <div key={module.key} className="grid grid-cols-12 gap-2 items-center px-3 py-3">
                          <div className="col-span-6">
                            <p className="text-sm font-medium">{module.label}</p>
                            <p className="text-xs text-muted-foreground">{module.description}</p>
                          </div>

                          {MATRIX_ACTION_ORDER.map((action) => {
                            const cellCodes = permissionMatrixCodeMap[module.key]?.[action] || [];
                            const checked = cellCodes.some((code) => (
                              editorPermissionSet.has(normalizePermissionCode(code))
                            ));
                            const disabled = loadingPermissionCatalog || cellCodes.length === 0;

                            return (
                              <div key={`${module.key}-${action}`} className="col-span-2 flex justify-center">
                                <Checkbox
                                  checked={checked}
                                  disabled={disabled}
                                  aria-label={`${module.label} ${MATRIX_ACTION_LABELS[action]}`}
                                  onCheckedChange={(next) => setPermissionMatrixCell(module.key, action, Boolean(next))}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Selected permissions: {editorPermissionCodes.length}</Badge>
                <Badge variant="outline">Available permissions: {permissionsCatalog.length}</Badge>
              </div>

              {editorLockedPermissionCodes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800">Additional saved permissions</p>
                  <p className="text-xs text-amber-700">
                    Existing permissions not listed in the current options are kept during save.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editorLockedPermissionCodes.map((code) => (
                      <Badge key={`locked-${code}`} variant="outline" className="border-amber-300 text-amber-800">
                        {code}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancel
            </Button>
            <Button onClick={saveRoleDefinition} disabled={savingEditor}>
              {savingEditor ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              {editingRole ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDeleteRole} onOpenChange={(open) => !open && setPendingDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {pendingDeleteRole?.role.name || 'this role'} from {pendingDeleteRole?.scope || 'selected'} scope.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteRoleDefinition}
            >
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showHospitalReplacementDialog}
        onOpenChange={(open) => {
          setShowHospitalReplacementDialog(open);
          if (!open) setPendingHospitalReplacementRoleId('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing hospital role?</AlertDialogTitle>
            <AlertDialogDescription>
              This user already has a hospital role assignment. Confirming will replace it with the selected role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmHospitalRoleReplacement}>
              Replace Hospital Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default RoleManagement;
