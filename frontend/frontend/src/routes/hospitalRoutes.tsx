/**
 * Hospital Application Routes
 *
 * These routes belong to hospital users (Hospital Admin, Pharmacist,
 * Doctor, Coordinator, Logistics Staff, etc.).
 * They are intentionally separate from platform administration routes.
 *
 * Exported as a JSX Fragment so React Router v6 can process it
 * transparently when included inside <Routes> in App.tsx.
 */
import { Route } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Dashboard from '@/pages/Dashboard';
import Inventory from '@/pages/Inventory';
import InventoryAnalytics from '@/pages/InventoryAnalytics';
import InventoryForecast from '@/pages/InventoryForecast';
import SharedResources from '@/pages/SharedResources';
import RequestWorkflow from '@/pages/RequestWorkflow';
import ResourceVisibility from '@/pages/ResourceVisibility';
import RequestTemplatesPage from '@/pages/RequestTemplatesPage';
import EmergencyBroadcastPage from '@/pages/EmergencyBroadcastPage';
import Hospitals from '@/pages/Hospitals';
import HospitalDetails from '@/pages/HospitalDetails';
import HospitalTrustProfile from '@/pages/HospitalTrustProfile';
import ResourceDetails from '@/pages/ResourceDetails';
import CreditLedger from '@/pages/CreditLedger';
import Messages from '@/pages/Messages';
import Reports from '@/pages/Reports';
import Catalog from '@/pages/Catalog';
import UserProfile from '@/pages/UserProfile';
import OffboardingRequest from '@/pages/OffboardingRequest';

// ── Hospital application routes ───────────────────────────────────────────────
// Exported as a Fragment, NOT a component, so React Router v6 can see
// the Route elements directly when {HospitalRoutes} is placed in <Routes>.
const HospitalRoutes = (
  <>
    {/* Core dashboard */}
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />

    {/* Inventory */}
    <Route
      path="/inventory"
      element={
        <ProtectedRoute>
          <Inventory />
        </ProtectedRoute>
      }
    />
    <Route
      path="/inventory/analytics"
      element={
        <ProtectedRoute>
          <InventoryAnalytics />
        </ProtectedRoute>
      }
    />
    <Route
      path="/inventory/forecast"
      element={
        <ProtectedRoute>
          <InventoryForecast />
        </ProtectedRoute>
      }
    />

    {/* Hospitals & trust */}
    <Route
      path="/hospitals"
      element={
        <ProtectedRoute>
          <Hospitals />
        </ProtectedRoute>
      }
    />
    <Route
      path="/hospital/:hospitalId"
      element={
        <ProtectedRoute>
          <HospitalDetails />
        </ProtectedRoute>
      }
    />
    <Route
      path="/hospital/:hospitalId/profile"
      element={
        <ProtectedRoute>
          <HospitalTrustProfile />
        </ProtectedRoute>
      }
    />
    <Route
      path="/trust/profiles"
      element={
        <ProtectedRoute>
          <Hospitals />
        </ProtectedRoute>
      }
    />
    <Route
      path="/trust/performance"
      element={
        <ProtectedRoute>
          <HospitalTrustProfile />
        </ProtectedRoute>
      }
    />
    <Route
      path="/trust/credits"
      element={
        <ProtectedRoute>
          <CreditLedger />
        </ProtectedRoute>
      }
    />
    <Route
      path="/credits"
      element={
        <ProtectedRoute>
          <CreditLedger />
        </ProtectedRoute>
      }
    />

    {/* Resources */}
    <Route
      path="/resource/:resourceId"
      element={
        <ProtectedRoute>
          <ResourceDetails />
        </ProtectedRoute>
      }
    />

    {/* Resource sharing */}
    <Route
      path="/sharing"
      element={
        <ProtectedRoute>
          <SharedResources />
        </ProtectedRoute>
      }
    />
    <Route
      path="/sharing/requests"
      element={
        <ProtectedRoute>
          <RequestWorkflow />
        </ProtectedRoute>
      }
    />
    <Route
      path="/sharing/visibility"
      element={
        <ProtectedRoute>
          <ResourceVisibility />
        </ProtectedRoute>
      }
    />
    <Route
      path="/sharing/templates"
      element={
        <ProtectedRoute>
          <RequestTemplatesPage />
        </ProtectedRoute>
      }
    />

    {/* Communication */}
    <Route
      path="/messages"
      element={
        <ProtectedRoute>
          <Messages />
        </ProtectedRoute>
      }
    />
    <Route
      path="/communication/emergency"
      element={
        <ProtectedRoute>
          <EmergencyBroadcastPage />
        </ProtectedRoute>
      }
    />

    {/* Catalog & reporting */}
    <Route
      path="/catalog"
      element={
        <ProtectedRoute>
          <Catalog />
        </ProtectedRoute>
      }
    />
    <Route
      path="/reports"
      element={
        <ProtectedRoute>
          <Reports />
        </ProtectedRoute>
      }
    />

    {/* User profile */}
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <UserProfile />
        </ProtectedRoute>
      }
    />

    <Route
      path="/offboarding/request"
      element={
        <ProtectedRoute allowedRoles={['HOSPITAL_ADMIN']}>
          <OffboardingRequest />
        </ProtectedRoute>
      }
    />
  </>
);

export default HospitalRoutes;
