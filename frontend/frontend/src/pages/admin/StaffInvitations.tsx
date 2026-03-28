// frontend/src/pages/admin/StaffInvitations.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Search, Mail, Calendar, XCircle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { invitationService } from '../../services/invitationService';
// ...existing code...
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { hospitalsApi, staffApi } from '@/services/api';
import AppLayout from '@/components/layout/AppLayout';

interface Role {
  id: string;
  name: string;
  description?: string;
}

interface Invitation {
  id: string;
  email: string;
  role?: string;
  role_name?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  accepted_at?: string;
  invited_by?: string;
  created_at: string;
}

interface StaffOption {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  hospital?: string;
}

interface HospitalOption {
  id: string;
  name: string;
}

const StaffInvitations: React.FC = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER_ADMIN';
  
  // Form state
  const [formData, setFormData] = useState({
    email: '',
    role: '',
    staffId: '',
    hospital: user?.hospital_id || '',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, [statusFilter, searchTerm, isSuperAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invitationsRes, rolesRes] = await Promise.all([
        invitationService.listInvitations(statusFilter, searchTerm),
        invitationService.getRoles(),
      ]);

      const staffRes = await staffApi.getAll();
      const staffData = (staffRes as unknown)?.data ?? staffRes ?? {};
      const staffList: unknown[] = staffData?.results ?? (Array.isArray(staffData) ? staffData : []);
      setStaffOptions(staffList.map((staff) => ({
        id: String(staff.id ?? ''),
        email: staff.email ?? '',
        first_name: staff.first_name,
        last_name: staff.last_name,
        role: String(staff.role ?? staff.role_id ?? ''),
        hospital: String(staff.hospital ?? staff.hospital_id ?? ''),
      })));

      if (isSuperAdmin) {
        const hospitalsRes = await hospitalsApi.getAll();
        const hospitalsData = (hospitalsRes as unknown)?.data ?? hospitalsRes ?? {};
        const hospitalsList: unknown[] = hospitalsData?.results ?? (Array.isArray(hospitalsData) ? hospitalsData : []);
        setHospitals(hospitalsList.map((hospital) => ({ id: String(hospital.id), name: hospital.name || hospital.hospital_name || 'Hospital' })));
      }
      
      setInvitations(invitationsRes.invitations || invitationsRes || []);
      setRoles(rolesRes.roles || []);
    } catch (error: unknown) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    try {
      const selectedStaff = staffOptions.find((staff) => staff.id === formData.staffId);
      const invitationData: { email: string; role_id?: string } = {
        email: selectedStaff?.email || formData.email,
      };
      if (formData.role) invitationData.role_id = formData.role;
      if (isSuperAdmin && formData.hospital) (invitationData as unknown).hospital = formData.hospital;
      if (selectedStaff?.first_name) (invitationData as unknown).first_name = selectedStaff.first_name;
      if (selectedStaff?.last_name) (invitationData as unknown).last_name = selectedStaff.last_name;

      await invitationService.inviteStaff(invitationData);
      setFormSuccess('Invitation sent successfully!');
      
      // Reset form
      setFormData({
        email: '',
        role: '',
        staffId: '',
        hospital: user?.hospital_id || '',
      });
      
      // Refresh invitations list
      fetchData();
      
      // Close form after 2 seconds
      setTimeout(() => {
        setShowInviteForm(false);
        setFormSuccess('');
      }, 2000);
    } catch (error: unknown) {
      setFormError(error.message || 'Failed to send invitation');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!window.confirm('Are you sure you want to cancel this invitation?')) {
      return;
    }

    try {
      await invitationService.cancelInvitation(invitationId);
      fetchData();
    } catch (error: unknown) {
      alert(error.message || 'Failed to cancel invitation');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { bg: 'bg-yellow-900/20', text: 'text-yellow-300', icon: Clock },
      accepted: { bg: 'bg-green-900/20', text: 'text-green-300', icon: CheckCircle },
      expired: { bg: 'bg-muted/20', text: 'text-muted-foreground', icon: AlertCircle },
      revoked: { bg: 'bg-red-900/20', text: 'text-red-300', icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    const Icon = config.icon;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.text} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!['HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(user?.role?.toUpperCase() || '')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppLayout title="Staff Invitations" subtitle="Invite and manage staff members for your hospital">
      <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Staff Invitations</h1>
        <p className="text-muted-foreground mt-1">Invite and manage staff members for your hospital</p>
      </div>

      {/* Header Actions */}
      <div className="rounded-lg p-4 mb-6 border border-muted/40 bg-muted/10">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted/20 text-white placeholder:text-muted-foreground border border-muted/40 focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-lg bg-muted/20 text-white border border-muted/40 focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>

          {/* Invite Button */}
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Invite Staff
          </button>
        </div>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <div className="rounded-lg p-6 mb-6 border border-muted/40 bg-muted/10">
          <h2 className="text-xl font-semibold mb-4 text-white">Send Staff Invitation</h2>

          {formError && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-300">
              {formError}
            </div>
          )}

          {formSuccess && (
            <div className="mb-4 p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-300">
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Existing User (Optional)
              </label>
              <select
                name="staffId"
                value={formData.staffId}
                onChange={(e) => {
                  const selected = staffOptions.find((staff) => staff.id === e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    staffId: e.target.value,
                    email: selected?.email || prev.email,
                    role: selected?.role || prev.role,
                    hospital: isSuperAdmin ? (selected?.hospital || prev.hospital) : prev.hospital,
                  }));
                }}
                className="w-full px-3 py-2 rounded-lg bg-muted/20 text-white border border-muted/40 focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select existing user</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 rounded-lg bg-muted/20 text-white border border-muted/40 focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {isSuperAdmin && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Hospital</label>
                <select
                  name="hospital"
                  value={formData.hospital}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 rounded-lg bg-muted/20 text-white border border-muted/40 focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Select Hospital</option>
                  {hospitals.map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Role
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-muted/20 text-white border border-muted/40 focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select Role (Optional)</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm(false);
                  setFormError('');
                  setFormSuccess('');
                }}
                className="px-4 py-2 rounded-lg border border-muted/40 hover:bg-muted/20 transition-colors text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Send Invitation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invitations Table */}
      <div className="rounded-lg overflow-hidden border border-muted/40 bg-muted/10">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2">Loading invitations...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p>No invitations found.</p>
            <p className="text-sm mt-1">Invite staff members to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/20 border-b border-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Expires At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted/40">
                {invitations.map((invitation) => (
                  <tr key={invitation.id} className="hover:bg-muted/10">
                    <td className="px-6 py-4 text-sm text-white">
                      {invitation.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground capitalize">
                      {invitation.role_name || invitation.role || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(invitation.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {formatDate(invitation.expires_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {invitation.status === 'pending' && (
                          <button
                            onClick={() => handleCancelInvitation(invitation.id)}
                            className="text-destructive hover:text-destructive/90 font-medium"
                            title="Revoke invitation"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {invitation.status === 'accepted' && (
                          <span className="text-muted-foreground text-sm">
                            Accepted {invitation.accepted_at && formatDate(invitation.accepted_at)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </AppLayout>
  );
};

export default StaffInvitations;
