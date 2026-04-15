import { useState, useEffect } from 'react';
// ...existing code...
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus, Search, Ban, RefreshCw, Pencil, Mail } from 'lucide-react';
import { staffApi, rolesApi, hospitalsApi, invitationsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import authService from '@/services/authService';
import { evaluateAccess, getAccessErrorMessage } from '@/lib/accessResolver';

interface StaffMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  employee_id: string;
  role: string;
  role_name: string;
  hospital_id: string;
  hospital_name: string;
  department: string;
  position: string;
  phone_number: string;
  employment_status: string;
  is_active: boolean;
  status: string;
  date_joined: string;
  last_login: string | null;
}

interface Role {
  id: string;
  name: string;
  scope: 'platform' | 'hospital' | 'shared';
}

interface StaffFormData {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  hospital: string;
}

interface HospitalOption {
  id: string;
  name: string;
}

export default function StaffManagement() {
  const { user } = useAuth();
  const canManageStaff = evaluateAccess(user, {
    requiredContext: 'PLATFORM',
    requiredPermissions: ['platform:user.view', 'platform:user_role.assign', 'platform:role.assign'],
  }).allowed;
  const canAssignPlatformRoles = evaluateAccess(user, {
    requiredContext: 'PLATFORM',
    requiredPermissions: ['platform:user_role.assign', 'platform:role.assign'],
  }).allowed;
  const canViewHospitals = evaluateAccess(user, {
    requiredContext: 'PLATFORM',
    requiredPermissions: ['platform:hospital.view', 'platform:hospital.manage'],
  }).allowed;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<StaffFormData>({
    email: '',
    first_name: '',
    last_name: '',
    role: '',
    hospital: '',
  });

  const selectedRole = roles.find((role) => role.id === formData.role);
  const selectedRoleRequiresHospital = selectedRole?.scope === 'hospital';
  const visibleRoles = roles.filter((role) => role.scope !== 'hospital' || canViewHospitals);

  const fetchStaff = async () => {
    try {
      const res = await staffApi.getAll();
      const data = (res as unknown)?.data ?? res ?? {};
      const list: unknown[] = data?.results ?? (Array.isArray(data) ? data : []);
      setStaff(list.map((s) => ({
        id: String(s.id ?? ''),
        email: s.email ?? s.user?.email ?? '',
        first_name: s.first_name ?? '',
        last_name: s.last_name ?? '',
        full_name: s.full_name ?? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
        employee_id: s.employee_id ?? '',
        role: String(s.role ?? s.role_id ?? ''),
        role_name: s.role_name ?? s.role?.name ?? s.position ?? '',
        hospital_id: String(s.hospital ?? s.hospital_id ?? ''),
        hospital_name: s.hospital_name ?? '',
        department: s.department ?? '',
        position: s.position ?? '',
        phone_number: s.phone_number ?? '',
        employment_status: s.employment_status ?? 'active',
        is_active: s.employment_status === 'active' || s.is_active === true,
        status: s.employment_status ?? s.status ?? (s.is_active ? 'active' : 'suspended'),
        date_joined: s.date_joined ?? s.created_at ?? '',
        last_login: s.last_login ?? null,
      })));
    } catch (err) {
      toast({
        title: 'Failed to load staff',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to view platform staff.',
          fallbackMessage: 'Unable to load staff list.',
        }),
        variant: 'destructive',
      });
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const rolesRes = await rolesApi.getAll();
        const rolesData = (rolesRes as unknown)?.data ?? rolesRes ?? {};
        const rolesList: unknown[] = rolesData?.results ?? (Array.isArray(rolesData) ? rolesData : []);
        setRoles(
          rolesList
            .map((role) => {
              const item = role as Record<string, unknown>;
              const rawScope = String(item.scope ?? item.context ?? '').toLowerCase();
              const derivedScope: Role['scope'] = rawScope === 'platform'
                ? 'platform'
                : rawScope === 'hospital'
                  ? 'hospital'
                  : item.hospital || item.hospital_id
                    ? 'hospital'
                    : 'shared';

              return {
                id: String(item.id ?? ''),
                name: String(item.name ?? ''),
                scope: derivedScope,
              };
            })
            .filter((role) => role.id),
        );
      } catch (err) {
        toast({
          title: 'Failed to load roles',
          description: getAccessErrorMessage(err, {
            forbiddenMessage: 'You are not authorized to view role assignments.',
            fallbackMessage: 'Unable to load role list.',
          }),
          variant: 'destructive',
        });
        setRoles([]);
      }

      try {
        if (!canViewHospitals) {
          setHospitals([]);
        } else {
          const hospitalsRes = await hospitalsApi.getAll();
          const hospitalsData = (hospitalsRes as unknown)?.data ?? hospitalsRes ?? {};
          const hospitalsList: unknown[] = hospitalsData?.results ?? (Array.isArray(hospitalsData) ? hospitalsData : []);
          setHospitals(
            hospitalsList
              .map((hospital) => {
                const item = hospital as Record<string, unknown>;
                return {
                  id: String(item.id ?? ''),
                  name: String(item.name ?? item.hospital_name ?? item.id ?? ''),
                };
              })
              .filter((hospital) => hospital.id),
          );
        }
      } catch (err) {
        toast({
          title: 'Failed to load healthcare facilities',
          description: getAccessErrorMessage(err, {
            forbiddenMessage: 'You are not authorized to view healthcare facility assignments.',
            fallbackMessage: 'Unable to load healthcare facilities.',
          }),
          variant: 'destructive',
        });
        setHospitals([]);
      }

      await fetchStaff();
    };
    fetchAll();
  }, [canViewHospitals]);

  const handleCreate = async () => {
    if (!canManageStaff || !canAssignPlatformRoles) {
      toast({
        title: 'Access denied',
        description: 'You are not authorized to create platform staff records.',
        variant: 'destructive',
      });
      return;
    }

    const hospitalId = selectedRoleRequiresHospital ? formData.hospital : undefined;
    if (!formData.email || !formData.first_name || !formData.last_name || !formData.role || (selectedRoleRequiresHospital && !formData.hospital)) return;
    setSubmitting(true);
    try {
      await staffApi.create({
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role || undefined,
        hospital: hospitalId || undefined,
      });

      try {
        await invitationsApi.send({
          email: formData.email,
          role_id: formData.role,
          hospital: hospitalId || undefined,
          first_name: formData.first_name,
          last_name: formData.last_name,
        });
      } catch {
        // Keep staff creation success even if invitation fails.
      }

      toast({
        title: 'Staff member created',
        description: `${formData.email} has been added and a password setup invitation was triggered.`,
      });
      setShowCreateDialog(false);
      setFormData({ email: '', first_name: '', last_name: '', role: '', hospital: '' });
      await fetchStaff();
    } catch (err) {
      toast({
        title: 'Failed to create staff',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to create this staff account.',
          fallbackMessage: 'Please retry creating this staff member.',
        }),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspend = async (id: string, name: string) => {
    if (!canManageStaff) {
      toast({
        title: 'Access denied',
        description: 'You are not authorized to suspend staff accounts.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await staffApi.suspend(id);
      toast({ title: 'Staff member suspended', description: `${name} has been suspended.` });
      await fetchStaff();
    } catch (err) {
      toast({
        title: 'Failed to suspend staff member',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to suspend this staff member.',
          fallbackMessage: 'Please retry suspending this account.',
        }),
        variant: 'destructive',
      });
    }
  };

  const canEditMember = (member: StaffMember) => {
    return !!member;
  };

  const openEditDialog = (member: StaffMember) => {
    if (!canEditMember(member)) return;
    setEditingId(member.id);
    setFormData({
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
      role: member.role,
      hospital: member.hospital_id || '',
    });
    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!canManageStaff || !canAssignPlatformRoles) {
      toast({
        title: 'Access denied',
        description: 'You are not authorized to update staff profiles.',
        variant: 'destructive',
      });
      return;
    }

    if (!editingId || !formData.first_name || !formData.last_name || !formData.role) return;
    if (selectedRoleRequiresHospital && !formData.hospital) return;

    const hospitalId = selectedRoleRequiresHospital ? formData.hospital : undefined;

    setSubmitting(true);
    try {
      await staffApi.update(editingId, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
        hospital: hospitalId || undefined,
      });
      toast({ title: 'Staff member updated', description: 'Changes were saved successfully.' });
      setShowEditDialog(false);
      setEditingId(null);
      await fetchStaff();
    } catch (err) {
      toast({
        title: 'Failed to update staff member',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to update this staff member.',
          fallbackMessage: 'Please retry updating this staff profile.',
        }),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (member: StaffMember) => {
    if (!canManageStaff) {
      toast({
        title: 'Access denied',
        description: 'You are not authorized to trigger password reset emails.',
        variant: 'destructive',
      });
      return;
    }

    if (!member.email) {
      toast({
        title: 'Cannot trigger password reset',
        description: 'This staff member does not have a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const detail = await authService.requestPasswordReset(member.email);
      toast({
        title: 'Reset email triggered',
        description: detail || `A password reset email has been sent to ${member.email} if the account exists.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Failed to trigger password reset',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to trigger password reset for this staff member.',
          fallbackMessage: 'Please retry.',
        }),
        variant: 'destructive',
      });
    }
  };

  const scopedStaff = staff;

  const filtered = scopedStaff.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.first_name.toLowerCase().includes(search.toLowerCase()) ||
      s.last_name.toLowerCase().includes(search.toLowerCase()) ||
      s.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      s.department.toLowerCase().includes(search.toLowerCase()) ||
      s.position.toLowerCase().includes(search.toLowerCase()) ||
      s.hospital_name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive || status === 'suspended') return 'bg-red-100 text-red-800';
    if (status === 'active') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <AppLayout title="Staff Management"
      // subtitle="Manage platform staff and role assignments"
    >
      <div className="flex-1 space-y-6 p-8 pt-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold">{staff.length}</p>
              <p className="text-sm text-muted-foreground">Total Staff</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold text-green-600">
                {staff.filter((s) => s.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold text-red-600">
                {staff.filter((s) => !s.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">Suspended</p>
            </CardContent>
          </Card>
        </div>

        {/* Staff Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Staff Members</CardTitle>
                <CardDescription>
                  All staff members across healthcare facilities
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchStaff}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={() => setShowCreateDialog(true)} disabled={!canManageStaff || !canAssignPlatformRoles}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Staff
                </Button>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, email, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No staff members found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Department / Position</TableHead>
                    <TableHead>Healthcare</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.full_name || `${member.first_name} ${member.last_name}`.trim() || '—'}
                      </TableCell>
                      <TableCell>{member.email || '—'}</TableCell>
                      <TableCell>{member.employee_id || '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{member.position || '—'}</div>
                          {member.department && <div className="text-muted-foreground text-xs">{member.department}</div>}
                        </div>
                      </TableCell>
                      <TableCell>{member.hospital_name || '—'}</TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(member.status, member.is_active)}>
                          {member.is_active ? member.status || 'active' : 'suspended'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.date_joined
                          ? new Date(member.date_joined).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canEditMember(member) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(member)}
                              disabled={!canManageStaff || !canAssignPlatformRoles}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          )}
                          {canEditMember(member) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResetPassword(member)}
                              disabled={!canManageStaff}
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              Reset Password
                            </Button>
                          )}
                          {member.is_active && canEditMember(member) && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                handleSuspend(
                                  member.id,
                                  `${member.first_name} ${member.last_name}`
                                )
                              }
                              disabled={!canManageStaff}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Suspend
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Staff Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
              <DialogDescription>Create a new staff account for the platform.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                  disabled={!canAssignPlatformRoles}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRoleRequiresHospital && (
                <div className="space-y-2">
                  <Label>Healthcare Facility *</Label>
                  <Select
                    value={formData.hospital}
                    onValueChange={(v) => setFormData({ ...formData, hospital: v })}
                    disabled={!canViewHospitals}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select healthcare facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitals.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  submitting ||
                  !canManageStaff ||
                  !canAssignPlatformRoles ||
                  !formData.email ||
                  !formData.first_name ||
                  !formData.last_name ||
                  !formData.role ||
                  (selectedRoleRequiresHospital && !formData.hospital)
                }
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Staff
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Staff Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Staff Member</DialogTitle>
              <DialogDescription>Update staff profile and role assignment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={formData.email} disabled />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_first_name">First Name</Label>
                  <Input
                    id="edit_first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_last_name">Last Name</Label>
                  <Input
                    id="edit_last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                  disabled={!canAssignPlatformRoles}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRoleRequiresHospital && (
                <div className="space-y-2">
                  <Label>Healthcare Facility *</Label>
                  <Select
                    value={formData.hospital}
                    onValueChange={(v) => setFormData({ ...formData, hospital: v })}
                    disabled={!canViewHospitals}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select healthcare facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitals.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={
                  submitting ||
                  !canManageStaff ||
                  !canAssignPlatformRoles ||
                  !formData.first_name ||
                  !formData.last_name ||
                  !formData.role ||
                  (selectedRoleRequiresHospital && !formData.hospital)
                }
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
