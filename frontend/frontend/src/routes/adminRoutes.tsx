/**
 * Platform Administration Routes
 *
 * These routes belong to the SUPER_ADMIN domain.
 * They are intentionally separate from hospital application routes.
 *
 * Exported as a JSX Fragment so React Router v6 can process it
 * transparently when included inside <Routes> in App.tsx.
 */
import { Navigate, Route } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RoleManagement from '@/pages/system-admin/RoleManagement';
import DataIntegration from '@/pages/DataIntegration';
import HospitalManagement from '@/pages/system-admin/HospitalManagement';
import HospitalRegistrations from '@/pages/system-admin/HospitalRegistrations';
import HospitalRegistrationDetail from '@/pages/system-admin/HospitalRegistrationDetail';
import StaffInvitations from '@/pages/system-admin/StaffInvitations';
import StaffManagement from '@/pages/system-admin/StaffManagement';
import AdminAnalytics from '@/pages/system-admin/AdminAnalytics';
import OffboardingRequests from '@/pages/system-admin/OffboardingRequests';
import HospitalUpdateRequests from '@/pages/system-admin/HospitalUpdateRequests';
import FacilitySourceSetup from '@/pages/system-admin/FacilitySourceSetup';

// ── Platform admin routes ─────────────────────────────────────────────────────
// Exported as a Fragment, NOT a component, so React Router v6 can see
// the Route elements directly when {AdminRoutes} is placed in <Routes>.
const PERMISSIONS = {
  hospitalReview: ['platform:hospital.review'],
  hospitalDirectory: ['platform:hospital.view', 'platform:hospital.manage'],
  staff: ['platform:user.view', 'platform:user_role.assign', 'platform:role.assign', 'platform:role.manage'],
  staffInvitations: ['platform:user.view', 'platform:user_role.assign', 'platform:role.assign', 'platform:role.manage'],
  roles: ['platform:role.view', 'platform:role.manage', 'platform:role.assign', 'platform:user_role.view', 'platform:user_role.assign'],
  dataIntegration: ['platform:hospital.manage'],
  analytics: ['platform:audit.view'],
  audit: ['platform:audit.view'],
  facilitySourceSetup: ['platform:hospital.manage'],
};

const AdminRoutes = (
  <>
    {/* Hospital registration approval workflow — SUPER_ADMIN only */}
    <Route
      path="/admin/hospital-registrations"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.hospitalReview}>
          <HospitalRegistrations />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/hospital-registrations/:id"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.hospitalReview}>
          <HospitalRegistrationDetail />
        </ProtectedRoute>
      }
    />

    {/* Hospital management (active hospitals) — SUPER_ADMIN only */}
    <Route
      path="/admin/hospitals"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.hospitalDirectory}>
          <HospitalManagement />
        </ProtectedRoute>
      }
    />

    {/* Staff management — platform scope only */}
    <Route
      path="/admin/staff"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.staff}>
          <StaffManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/staff-invitations"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.staffInvitations}>
          <StaffInvitations />
        </ProtectedRoute>
      }
    />

    {/* Roles & permissions — platform scope only */}
    <Route
      path="/admin/roles"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.roles}>
          <RoleManagement />
        </ProtectedRoute>
      }
    />

    {/* Platform data integration — SUPER_ADMIN only */}
    <Route
      path="/admin/data"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.dataIntegration}>
          <DataIntegration />
        </ProtectedRoute>
      }
    />

    {/* Platform analytics — SUPER_ADMIN only */}
    <Route
      path="/admin/analytics"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.analytics}>
          <AdminAnalytics />
        </ProtectedRoute>
      }
    />

    {/* Backward-compatible audit route redirect — reporting now lives under Reports */}
    <Route
      path="/admin/audit-logs"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.audit}>
          <Navigate to="/reports" replace />
        </ProtectedRoute>
      }
    />

    <Route
      path="/admin/offboarding-requests"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.hospitalReview}>
          <OffboardingRequests />
        </ProtectedRoute>
      }
    />

    <Route
      path="/admin/hospital-update-requests"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.hospitalReview}>
          <HospitalUpdateRequests />
        </ProtectedRoute>
      }
    />

    <Route
      path="/admin/facility-source-setup"
      element={
        <ProtectedRoute requiredContext="PLATFORM" requiredPermissions={PERMISSIONS.facilitySourceSetup}>
          <FacilitySourceSetup />
        </ProtectedRoute>
      }
    />
  </>
);

export default AdminRoutes;
