import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/components/layout/LanguageToggle";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import InventoryAnalytics from "./pages/InventoryAnalytics";
import InventoryForecast from "./pages/InventoryForecast";
import SharedResources from "./pages/SharedResources";
import RequestWorkflow from "./pages/RequestWorkflow";
import Alerts from "./pages/Alerts";
import Messages from "./pages/Messages";
import RoleManagement from "./pages/RoleManagement";
import DataIntegration from "./pages/DataIntegration";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import Hospitals from "./pages/Hospitals";
import HospitalDetails from "./pages/HospitalDetails";
import ResourceDetails from "./pages/ResourceDetails";
import ResourceVisibility from "./pages/ResourceVisibility";
import TransportTracking from "./pages/TransportTracking";
import HospitalTrustProfile from "./pages/HospitalTrustProfile";
import CreditLedger from "./pages/CreditLedger";
import EmergencyBroadcastPage from "./pages/EmergencyBroadcastPage";
import RequestTemplatesPage from "./pages/RequestTemplatesPage";
import HospitalRegistration from "./pages/HospitalRegistration";
import RegistrationSuccess from "./pages/RegistrationSuccess";
import HospitalManagement from "./pages/admin/HospitalManagement";

const queryClient = new QueryClient();

// Component to handle login redirect for authenticated users
const LoginRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <Login />;
};

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/register" element={<HospitalRegistration />} />
      <Route path="/registration-success" element={<RegistrationSuccess />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
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
        path="/resource/:resourceId" 
        element={
          <ProtectedRoute>
            <ResourceDetails />
          </ProtectedRoute>
        } 
      />
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
      <Route 
        path="/transport/tracking" 
        element={
          <ProtectedRoute>
            <TransportTracking />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/transport/active" 
        element={
          <ProtectedRoute>
            <TransportTracking />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/transport/emergency" 
        element={
          <ProtectedRoute>
            <EmergencyBroadcastPage />
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
        path="/trust/credits" 
        element={
          <ProtectedRoute>
            <CreditLedger />
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
        path="/credits" 
        element={
          <ProtectedRoute>
            <CreditLedger />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/alerts" 
        element={
          <ProtectedRoute>
            <Alerts />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/messages" 
        element={
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/roles" 
        element={
          <ProtectedRoute>
            <RoleManagement />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/hospitals" 
        element={
          <ProtectedRoute>
            <HospitalManagement />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/data" 
        element={
          <ProtectedRoute>
            <DataIntegration />
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
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="healthshare-theme">
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AppRoutes />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;