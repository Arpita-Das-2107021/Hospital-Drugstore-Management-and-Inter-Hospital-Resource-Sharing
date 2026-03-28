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
import { auditApi, rolesApi, staffApi } from '@/services/api';
import { CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Shield, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RoleItem {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, unknown>;
  can_use_broadcast: boolean;
}

interface StaffItem {
  id: string;
  full_name: string;
  email: string;
  role_id: string;
  role_name: string;
  hospital_name: string;
  hospital_id?: string;
}

interface AuditLog {
  id: string;
  action?: string;
  action_type?: string;
  user_name?: string;
  hospital_name?: string;
  resource_name?: string;
  details?: string;
  timestamp?: string;
}

type PermissionAction = 'view' | 'manage' | 'admin';
type PermissionState = Record<string, Record<PermissionAction, boolean>>;

const PERMISSION_MODULES = [
  { key: 'inventory', label: 'Inventory', description: 'Stock visibility, updates, and controls' },
  { key: 'sharing', label: 'Resource Sharing', description: 'Offer, approve, and manage shared resources' },
  { key: 'transport', label: 'Transport', description: 'Dispatch, tracking, and delivery operations' },
  { key: 'communication', label: 'Communication', description: 'Messaging and emergency communication' },
  { key: 'administration', label: 'Administration', description: 'Staff and platform administration tasks' },
];

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  manage: 'Manage',
  admin: 'Admin',
};

const emptyPermissionState = (): PermissionState => {
  const next: PermissionState = {};
  PERMISSION_MODULES.forEach((module) => {
    next[module.key] = { view: false, manage: false, admin: false };
  });
  return next;
};

const mapPermissionState = (permissions?: Record<string, unknown>): PermissionState => {
  const next = emptyPermissionState();

  PERMISSION_MODULES.forEach((module) => {
    const source = permissions?.[module.key] || {};
    next[module.key] = {
      view: Boolean(source.read ?? source.view ?? source.list),
      manage: Boolean(source.write ?? source.manage ?? source.update ?? source.create),
      admin: Boolean(source.admin ?? source.delete ?? source.approve),
    };
  });

  return next;
};

const mergePermissionPayload = (
  basePermissions: Record<string, unknown> | undefined,
  permissionState: PermissionState,
  canUseBroadcast: boolean,
) => {
  const merged = { ...(basePermissions || {}) };

  PERMISSION_MODULES.forEach((module) => {
    const current = merged[module.key] && typeof merged[module.key] === 'object' ? merged[module.key] : {};
    merged[module.key] = {
      ...current,
      read: Boolean(permissionState[module.key]?.view),
      write: Boolean(permissionState[module.key]?.manage),
      admin: Boolean(permissionState[module.key]?.admin),
    };
  });

  const currentBroadcast = merged.broadcast && typeof merged.broadcast === 'object' ? merged.broadcast : {};
  merged.broadcast = {
    ...currentBroadcast,
    read: canUseBroadcast,
  };

  return merged;
};

const parseList = (res: unknown): unknown[] => {
  const data = res?.data ?? res ?? {};
  return data?.results ?? (Array.isArray(data) ? data : []);
};

// Helper: determine whether a role's permission set is equivalent to Hospital Admin
const isEquivalentHospitalAdmin = (permissions: Record<string, unknown> | undefined) => {
  if (!permissions) return false;
  const state = mapPermissionState(permissions);
  // Define equivalence: administration admin OR full admin on inventory + sharing
  const adminAdmin = Boolean(state.administration?.admin);
  const inventoryAdmin = Boolean(state.inventory?.admin);
  const sharingAdmin = Boolean(state.sharing?.admin);
  // If administration admin is explicitly set, treat as Hospital Admin equivalent
  if (adminAdmin) return true;
  // Or if core hospital modules are admin-enabled
  if (inventoryAdmin && sharingAdmin) return true;
  return false;
};


const RoleManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const userRole = (user?.role || '').toUpperCase();
  const canManageRoles = userRole === 'HOSPITAL_ADMIN' || userRole === 'SUPER_ADMIN';

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(userRole === 'SUPER_ADMIN');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  const [showEditor, setShowEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorPermissionState, setEditorPermissionState] = useState<PermissionState>(emptyPermissionState());
  const [editorBroadcast, setEditorBroadcast] = useState(false);
  const [savingEditor, setSavingEditor] = useState(false);

  const [pendingDeleteRole, setPendingDeleteRole] = useState<RoleItem | null>(null);

  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedAssignRoleId, setSelectedAssignRoleId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [removingStaffRoleId, setRemovingStaffRoleId] = useState('');

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId],
  );

  // Hide SUPER_ADMIN role from non-super-admin users
  const visibleRoles = useMemo(() => {
    const isSuper = (user?.role || '').toUpperCase() === 'SUPER_ADMIN';
    return roles.filter((r) => {
      const name = (r.name || '').toUpperCase();
      if (name === 'SUPER_ADMIN' && !isSuper) return false;
      return true;
    });
  }, [roles, user]);

  const fetchRolesAndStaff = async () => {
    try {
      setLoadingRoles(true);
      const [rolesRes, staffRes] = await Promise.all([rolesApi.getAll(), staffApi.getAll().catch(() => null)]);

      const mappedRoles: RoleItem[] = parseList(rolesRes).map((role: unknown) => ({
        id: String(role.id ?? role.name ?? ''),
        name: String(role.name ?? 'Unnamed role'),
        description: String(role.description ?? ''),
        permissions: role.permissions && typeof role.permissions === 'object' ? role.permissions : {},
        can_use_broadcast: Boolean(role.can_use_broadcast ?? role.permissions?.broadcast?.read),
      }));

      const mappedStaff: StaffItem[] = parseList(staffRes).map((member: unknown) => ({
        id: String(member.id ?? ''),
        full_name: String((member.full_name ?? `${member.first_name || ''} ${member.last_name || ''}`.trim()) || member.email || 'Staff'),
        email: String(member.email ?? member.user?.email ?? ''),
        role_id: String(member.role_id ?? member.role ?? ''),
        role_name: String(member.role_name ?? member.role?.name ?? member.position ?? ''),
        hospital_name: String(member.hospital_name ?? ''),
        hospital_id: String(member.hospital_id ?? member.hospital?.id ?? ''),
      }));

      setRoles(mappedRoles);
      setStaff(mappedStaff);
      setSelectedRoleId((prev) => {
        if (prev && mappedRoles.some((role) => role.id === prev)) {
          return prev;
        }
        return mappedRoles[0]?.id || '';
      });
    } catch {
      toast({ title: 'Failed to load role data', variant: 'destructive' });
    } finally {
      setLoadingRoles(false);
    }
  };

  const fetchAuditLogs = async () => {
    if (userRole !== 'SUPER_ADMIN') {
      setAuditLogs([]);
      setLoadingAudit(false);
      return;
    }

    try {
      setLoadingAudit(true);
      const res = await auditApi.getAll();
      setAuditLogs(parseList(res));
    } catch {
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchRolesAndStaff();
    fetchAuditLogs();
  }, []);

  const staffByRoleId = useMemo(() => {
    const index: Record<string, number> = {};
    staff.forEach((member) => {
      if (!member.role_id) return;
      index[member.role_id] = (index[member.role_id] || 0) + 1;
    });
    return index;
  }, [staff]);

  const countEnabledPermissions = (role: RoleItem) => {
    const permissionState = mapPermissionState(role.permissions);
    let count = role.can_use_broadcast ? 1 : 0;
    PERMISSION_MODULES.forEach((module) => {
      if (permissionState[module.key]?.view) count += 1;
      if (permissionState[module.key]?.manage) count += 1;
      if (permissionState[module.key]?.admin) count += 1;
    });
    return count;
  };

  const openCreateDialog = () => {
    setEditingRole(null);
    setEditorName('');
    setEditorDescription('');
    setEditorPermissionState(emptyPermissionState());
    setEditorBroadcast(false);
    setShowEditor(true);
  };

  const openEditDialog = (role: RoleItem) => {
    setEditingRole(role);
    setEditorName(role.name);
    setEditorDescription(role.description || '');
    setEditorPermissionState(mapPermissionState(role.permissions));
    setEditorBroadcast(role.can_use_broadcast);
    setShowEditor(true);
  };

  const setPermissionValue = (moduleKey: string, action: PermissionAction, value: boolean) => {
    setEditorPermissionState((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [action]: value,
      },
    }));
  };

  const saveRole = async () => {
    if (!canManageRoles) {
      toast({ title: 'Only administrators can update roles', variant: 'destructive' });
      return;
    }

    if (!editorName.trim()) {
      toast({ title: 'Role name is required', variant: 'destructive' });
      return;
    }

    // Prevent non-privileged users from creating roles that escalate to Super/Hospital Admin
    const proposedIsSuperAdmin = (editorName || '').toUpperCase() === 'SUPER_ADMIN' || Boolean(editorPermissionState.administration?.admin && (editorName || '').toUpperCase() === 'SUPER_ADMIN');
    if (proposedIsSuperAdmin && (user?.role || '').toUpperCase() !== 'SUPER_ADMIN') {
      toast({ title: 'Permission denied', description: 'Only Super Admin can create or edit the Super Admin role.', variant: 'destructive' });
      return;
    }

    // If this role includes administration-level admin privileges, ensure current user can grant Hospital Admin equivalence
    const wantsHospitalAdmin = Boolean(editorPermissionState.administration?.admin);
    if (wantsHospitalAdmin) {
      const currentUserRoleObj = roles.find((r) => (r.name || '').toUpperCase() === (user?.role || '').toUpperCase());
      const currentIsHospitalAdmin = (user?.role || '').toUpperCase() === 'HOSPITAL_ADMIN';
      const currentIsEquivalent = currentUserRoleObj ? isEquivalentHospitalAdmin(currentUserRoleObj.permissions) : false;
      if (!currentIsHospitalAdmin && !currentIsEquivalent) {
        toast({ title: 'Permission denied', description: 'Only Hospital Admin (or a role explicitly granted equivalent permissions) can create or grant Hospital Admin-level roles.', variant: 'destructive' });
        return;
      }
    }

    const permissions = mergePermissionPayload(editingRole?.permissions, editorPermissionState, editorBroadcast);
    const payload = {
      name: editorName.trim(),
      description: editorDescription.trim(),
      permissions,
      can_use_broadcast: editorBroadcast,
    };

    try {
      setSavingEditor(true);
      if (editingRole) {
        await rolesApi.update(editingRole.id, payload);
        toast({ title: 'Role updated', description: `${editorName} has been updated.` });
      } else {
        await rolesApi.create(payload);
        toast({ title: 'Role created', description: `${editorName} has been added.` });
      }
      setShowEditor(false);
      await fetchRolesAndStaff();
    } catch (err: unknown) {
      const message = String(err?.message || 'Failed to save role');
      const unsupportedCreate = !editingRole && /404|405|not allowed|not found/i.test(message);
      toast({
        title: unsupportedCreate ? 'Create role is not available on this backend' : 'Failed to save role',
        description: unsupportedCreate
          ? 'Your API currently supports listing and updating roles only.'
          : message,
        variant: 'destructive',
      });
    } finally {
      setSavingEditor(false);
    }
  };

  const deleteRole = async () => {
    if (!pendingDeleteRole) return;
    try {
      await rolesApi.delete(pendingDeleteRole.id);
      toast({ title: 'Role deleted', description: `${pendingDeleteRole.name} has been removed.` });
      setPendingDeleteRole(null);
      await fetchRolesAndStaff();
    } catch (err: unknown) {
      const message = String(err?.message || 'Failed to delete role');
      const unsupportedDelete = /404|405|not allowed|not found/i.test(message);
      toast({
        title: unsupportedDelete ? 'Delete role is not available on this backend' : 'Failed to delete role',
        description: unsupportedDelete
          ? 'Your API currently supports listing and updating roles only.'
          : message,
        variant: 'destructive',
      });
    }
  };

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    // Always restrict to staff within the same hospital as the current user
    const sameHospital = staff.filter((member) => member.hospital_id && user?.hospital_id && member.hospital_id === user.hospital_id);
    const pool = sameHospital.length > 0 ? sameHospital : staff.filter((m) => !m.hospital_id || !user?.hospital_id);
    if (!q) return pool;
    return pool.filter((member) => (
      member.full_name.toLowerCase().includes(q) ||
      member.email.toLowerCase().includes(q) ||
      member.hospital_name.toLowerCase().includes(q)
    ));
  }, [staff, staffSearch]);

  const handleAssignRole = async () => {
    if (!selectedStaffId || !selectedAssignRoleId) {
      toast({ title: 'Select both staff and role', variant: 'destructive' });
      return;
    }
    // Validate assignment rules before calling API
    const targetStaff = staff.find((s) => s.id === selectedStaffId);
    const targetRole = roles.find((r) => r.id === selectedAssignRoleId);
    if (!targetStaff || !targetRole) {
      toast({ title: 'Invalid staff or role selection', variant: 'destructive' });
      return;
    }

    // Enforce same-hospital assignment
    if (user?.hospital_id && targetStaff.hospital_id && user.hospital_id !== targetStaff.hospital_id) {
      toast({ title: 'Cross-hospital assignment not allowed', description: 'You can only assign roles to staff within your hospital.', variant: 'destructive' });
      return;
    }

    // Super Admin role may only be granted by SUPER_ADMIN
    if ((targetRole.name || '').toUpperCase() === 'SUPER_ADMIN' && (user?.role || '').toUpperCase() !== 'SUPER_ADMIN') {
      toast({ title: 'Permission denied', description: 'Only Super Admin can grant or revoke the Super Admin role.', variant: 'destructive' });
      return;
    }

    // Hospital Admin role may only be granted by Hospital Admin or an equivalent role
    if ((targetRole.name || '').toUpperCase() === 'HOSPITAL_ADMIN') {
      const currentUserRoleObj = roles.find((r) => (r.name || '').toUpperCase() === (user?.role || '').toUpperCase());
      const currentIsHospitalAdmin = (user?.role || '').toUpperCase() === 'HOSPITAL_ADMIN';
      const currentIsEquivalent = currentUserRoleObj ? isEquivalentHospitalAdmin(currentUserRoleObj.permissions) : false;
      if (!currentIsHospitalAdmin && !currentIsEquivalent) {
        toast({ title: 'Permission denied', description: 'Only Hospital Admin (or a role explicitly granted equivalent permissions) can assign Hospital Admin.', variant: 'destructive' });
        return;
      }
    }

    try {
      setAssigning(true);
      await staffApi.update(selectedStaffId, {
        role: selectedAssignRoleId,
        role_id: selectedAssignRoleId,
      });
      toast({ title: 'Role assigned', description: 'Staff role assignment was updated.' });
      await fetchRolesAndStaff();
    } catch (err: unknown) {
      toast({
        title: 'Failed to assign role',
        description: String(err?.message || 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveRole = async (member: StaffItem) => {
    setRemovingStaffRoleId(member.id);
    try {
      // Prevent removing roles the current user is not permitted to revoke
      const currentUserRoleName = (user?.role || '').toUpperCase();
      const targetRoleObj = roles.find((r) => r.id === member.role_id);
      const targetRoleName = (targetRoleObj?.name || '').toUpperCase();

      if (targetRoleName === 'SUPER_ADMIN' && currentUserRoleName !== 'SUPER_ADMIN') {
        toast({ title: 'Permission denied', description: 'Only Super Admin can revoke the Super Admin role.', variant: 'destructive' });
        return;
      }

      if (targetRoleName === 'HOSPITAL_ADMIN') {
        const currentIsHospitalAdmin = currentUserRoleName === 'HOSPITAL_ADMIN';
        const currentIsEquivalent = targetRoleObj ? isEquivalentHospitalAdmin((roles.find((r) => (r.name || '').toUpperCase() === currentUserRoleName)?.permissions)) : false;
        if (!currentIsHospitalAdmin && !currentIsEquivalent) {
          toast({ title: 'Permission denied', description: 'Only Hospital Admin (or equivalent role) can revoke Hospital Admin.', variant: 'destructive' });
          return;
        }
      }

      try {
        await staffApi.update(member.id, { role: null, role_id: null });
      } catch {
        await staffApi.update(member.id, { role: '' });
      }
      toast({ title: 'Role removed', description: `${member.full_name} no longer has an assigned role.` });
      await fetchRolesAndStaff();
    } catch (err: unknown) {
      toast({
        title: 'Failed to remove role',
        description: String(err?.message || 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setRemovingStaffRoleId('');
    }
  };

  const permissionSummary = useMemo(() => {
    if (!selectedRole) return [] as Array<{ module: string; enabled: string[]; disabled: string[] }>;
    const state = mapPermissionState(selectedRole.permissions);
    const summary = PERMISSION_MODULES.map((module) => {
      const enabled: string[] = [];
      const disabled: string[] = [];
      (Object.keys(ACTION_LABELS) as PermissionAction[]).forEach((action) => {
        if (state[module.key]?.[action]) {
          enabled.push(ACTION_LABELS[action]);
        } else {
          disabled.push(ACTION_LABELS[action]);
        }
      });
      return {
        module: module.label,
        enabled,
        disabled,
      };
    });

    summary.push({
      module: 'Communication',
      enabled: selectedRole.can_use_broadcast ? ['Emergency Broadcast'] : [],
      disabled: selectedRole.can_use_broadcast ? [] : ['Emergency Broadcast'],
    });

    return summary;
  }, [selectedRole]);

  return (
    <AppLayout title="Role Management" subtitle="Manage role permissions and staff assignments without technical complexity">
      <Tabs defaultValue="roles" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="assignments">Assign Staff</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchRolesAndStaff}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={openCreateDialog} disabled={!canManageRoles}>
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </div>
        </div>

        <TabsContent value="roles" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Role Management Dashboard</CardTitle>
              <CardDescription>Use clear controls to manage role capabilities and assignments.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRoles ? (
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
                      <TableHead>Assigned Staff</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRoles.map((role) => (
                      <TableRow
                        key={role.id}
                        className={selectedRoleId === role.id ? 'bg-muted/40' : ''}
                        onClick={() => setSelectedRoleId(role.id)}
                      >
                        <TableCell className="font-medium">{role.name}</TableCell>
                        <TableCell className="text-muted-foreground">{role.description || 'No description'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{countEnabledPermissions(role)} enabled</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{staffByRoleId[role.id] || 0} staff</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(role)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedAssignRoleId(role.id);
                                setSelectedRoleId(role.id);
                              }}
                            >
                              <UserPlus className="h-3.5 w-3.5 mr-1" />
                              Assign Users
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!canManageRoles}
                              onClick={() => setPendingDeleteRole(role)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Permission Summary</CardTitle>
              <CardDescription>
                {selectedRole ? `Current role: ${selectedRole.name}` : 'Select a role to inspect enabled and disabled permissions.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedRole ? (
                <p className="text-sm text-muted-foreground">No role selected.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {permissionSummary.map((section) => (
                    <div key={section.module} className="rounded-lg border p-4 space-y-3">
                      <div className="font-medium flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        {section.module}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Enabled</p>
                        {section.enabled.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {section.enabled.map((item) => (
                              <Badge key={`${section.module}-${item}`} className="bg-green-100 text-green-800 hover:bg-green-100">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">None</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Disabled</p>
                        {section.disabled.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {section.disabled.map((item) => (
                              <Badge key={`${section.module}-disabled-${item}`} variant="outline">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">None</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign Role to Staff</CardTitle>
              <CardDescription>Select Staff, choose a role, and assign with one click.</CardDescription>
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
                          {member.full_name} ({member.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <Label>Select Role</Label>
                  <Select value={selectedAssignRoleId} onValueChange={setSelectedAssignRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent>
                        {visibleRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleAssignRole} disabled={assigning || !selectedStaffId || !selectedAssignRoleId}>
                  {assigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Assign
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Staff Role Assignments</CardTitle>
              <CardDescription>Remove a role from any staff member directly from this list.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.full_name}</TableCell>
                      <TableCell>{member.email || '-'}</TableCell>
                      <TableCell>{member.hospital_name || '-'}</TableCell>
                      <TableCell>
                        {member.role_name ? (
                          <Badge variant="secondary">{member.role_name}</Badge>
                        ) : (
                          <Badge variant="outline">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!member.role_id || removingStaffRoleId === member.id}
                          onClick={() => handleRemoveRole(member)}
                        >
                          {removingStaffRoleId === member.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <UserMinus className="h-4 w-4 mr-1" />
                          )}
                          Remove Role
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Recent Audit Logs</CardTitle>
              <CardDescription>Role and permission-related actions recorded by the system.</CardDescription>
            </CardHeader>
            <CardContent>
              {userRole !== 'SUPER_ADMIN' ? (
                <p className="text-sm text-muted-foreground">
                  Audit log visibility is available to SUPER_ADMIN users.
                </p>
              ) : loadingAudit ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.slice(0, 25).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.action_type || log.action || '-'}</TableCell>
                        <TableCell>{log.user_name || log.hospital_name || 'System'}</TableCell>
                        <TableCell>{log.resource_name || log.details || '-'}</TableCell>
                        <TableCell>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
            <DialogDescription>
              Configure permissions with checkboxes. JSON is handled internally by the system.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={editorName}
                  onChange={(event) => setEditorName(event.target.value)}
                  placeholder="Example: Pharmacy Supervisor"
                />
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
            </div>

            <div className="rounded-lg border">
              <div className="grid grid-cols-12 bg-muted/50 px-4 py-2 text-sm font-medium">
                <div className="col-span-5">Module</div>
                <div className="col-span-7 grid grid-cols-3 text-center">
                  <span>View</span>
                  <span>Manage</span>
                  <span>Admin</span>
                </div>
              </div>

              <div className="divide-y">
                {PERMISSION_MODULES.map((module) => (
                  <div key={module.key} className="grid grid-cols-12 items-center gap-2 px-4 py-3">
                    <div className="col-span-5">
                      <p className="font-medium">{module.label}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                    <div className="col-span-7 grid grid-cols-3 place-items-center">
                      {(Object.keys(ACTION_LABELS) as PermissionAction[]).map((action) => (
                        <Checkbox
                          key={`${module.key}-${action}`}
                          checked={Boolean(editorPermissionState[module.key]?.[action])}
                          onCheckedChange={(checked) => setPermissionValue(module.key, action, Boolean(checked))}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-12 items-center gap-2 px-4 py-3">
                  <div className="col-span-5">
                    <p className="font-medium">Emergency Broadcast</p>
                    <p className="text-xs text-muted-foreground">Allow this role to access emergency broadcast workflows</p>
                  </div>
                  <div className="col-span-7 flex justify-center">
                    <Checkbox checked={editorBroadcast} onCheckedChange={(checked) => setEditorBroadcast(Boolean(checked))} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancel
            </Button>
            <Button onClick={saveRole} disabled={savingEditor || !canManageRoles || !editorName.trim()}>
              {savingEditor ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
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
              This will remove {pendingDeleteRole?.name || 'this role'}. Staff assignments may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteRole}>
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default RoleManagement;