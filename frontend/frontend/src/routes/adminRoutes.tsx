/**
 * Platform Administration Routes
 *
 * These routes belong to the SUPER_ADMIN domain.
 * They are intentionally separate from hospital application routes.
 *
 * Exported as a JSX Fragment so React Router v6 can process it
 * transparently when included inside <Routes> in App.tsx.
 */
import { Route } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RoleManagement from '@/pages/RoleManagement';
import DataIntegration from '@/pages/DataIntegration';
import HospitalManagement from '@/pages/admin/HospitalManagement';
import HospitalRegistrations from '@/pages/admin/HospitalRegistrations';
import HospitalRegistrationDetail from '@/pages/admin/HospitalRegistrationDetail';
import StaffInvitations from '@/pages/admin/StaffInvitations';
import StaffManagement from '@/pages/admin/StaffManagement';
import AdminAnalytics from '@/pages/admin/AdminAnalytics';
import AuditLogs from '@/pages/admin/AuditLogs';
import OffboardingRequests from '@/pages/admin/OffboardingRequests';
import HospitalUpdateRequests from '@/pages/admin/HospitalUpdateRequests';

// ── Platform admin routes (SUPER_ADMIN only) ──────────────────────────────────
// Exported as a Fragment, NOT a component, so React Router v6 can see
// the Route elements directly when {AdminRoutes} is placed in <Routes>.
const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'];
const ADMIN_AND_HOSPITAL_ADMIN = ['SUPER_ADMIN', 'HOSPITAL_ADMIN'];
const HOSPITAL_ADMIN_AND_SUPER_ADMIN = ['HOSPITAL_ADMIN', 'SUPER_ADMIN'];

const AdminRoutes = (
  <>
    {/* Hospital registration approval workflow — SUPER_ADMIN only */}
    <Route
      path="/admin/hospital-registrations"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <HospitalRegistrations />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/hospital-registrations/:id"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <HospitalRegistrationDetail />
        </ProtectedRoute>
      }
    />

    {/* Hospital management (active hospitals) — SUPER_ADMIN only */}
    <Route
      path="/admin/hospitals"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <HospitalManagement />
        </ProtectedRoute>
      }
    />

    {/* Staff management — SUPER_ADMIN and HOSPITAL_ADMIN */}
    <Route
      path="/admin/staff"
      element={
        <ProtectedRoute allowedRoles={ADMIN_AND_HOSPITAL_ADMIN}>
          <StaffManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/staff-invitations"
      element={
        <ProtectedRoute allowedRoles={HOSPITAL_ADMIN_AND_SUPER_ADMIN}>
          <StaffInvitations />
        </ProtectedRoute>
      }
    />

    {/* Roles & permissions — SUPER_ADMIN and HOSPITAL_ADMIN */}
    <Route
      path="/admin/roles"
      element={
        <ProtectedRoute allowedRoles={ADMIN_AND_HOSPITAL_ADMIN}>
          <RoleManagement />
        </ProtectedRoute>
      }
    />

    {/* Platform data integration — SUPER_ADMIN only */}
    <Route
      path="/admin/data"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <DataIntegration />
        </ProtectedRoute>
      }
    />

    {/* Platform analytics — SUPER_ADMIN only */}
    <Route
      path="/admin/analytics"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <AdminAnalytics />
        </ProtectedRoute>
      }
    />

    {/* Audit logs — SUPER_ADMIN only */}
    <Route
      path="/admin/audit-logs"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <AuditLogs />
        </ProtectedRoute>
      }
    />

    <Route
      path="/admin/offboarding-requests"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <OffboardingRequests />
        </ProtectedRoute>
      }
    />

    <Route
      path="/admin/hospital-update-requests"
      element={
        <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
          <HospitalUpdateRequests />
        </ProtectedRoute>
      }
    />
  </>
);

export default AdminRoutes;
