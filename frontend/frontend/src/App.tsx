import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/components/layout/LanguageToggle";
import { resolveDefaultAuthenticatedPath } from '@/lib/accessResolver';

// Public / auth pages
import Login from "./pages/Login";
import HospitalRegistration from "./pages/HospitalRegistration";
import AcceptInvitation from "./pages/AcceptInvitation";
import SetPassword from "./pages/SetPassword";
import ResetPassword from "./pages/ResetPassword";
import Index from "./pages/Index";
import Guidelines from "./pages/Guidelines";
import NotFound from "./pages/NotFound";

// Route groups — each is a JSX Fragment, not a component, so React Router v6
// can see the <Route> elements directly when they are placed inside <Routes>.
import HospitalRoutes from "./routes/hospitalRoutes";
import AdminRoutes from "./routes/adminRoutes";

const queryClient = new QueryClient();

// Redirect already-authenticated users away from /login
const LoginRoute = () => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (isAuthenticated) {
    const redirectPath = resolveDefaultAuthenticatedPath(user);
    return <Navigate to={redirectPath} replace />;
  }
  return <Login />;
};

// Public landing route: always show the new homepage at root.
const RootRoute = () => <Index />;

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      {/* ── Public / unauthenticated routes ────────────────────────────── */}
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/register" element={<HospitalRegistration />} />
      <Route path="/invitation/accept/:token" element={<AcceptInvitation />} />
      <Route path="/accept-invitation" element={<AcceptInvitation />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/forgot-password" element={<ResetPassword />} />
      <Route path="/guidelines" element={<Guidelines />} />
      <Route path="/docs" element={<Guidelines />} />
      <Route path="/" element={<RootRoute />} />

      {/* ── Hospital application (hospital users) ──────────────────────── */}
      {HospitalRoutes}

      {/* ── Platform administration (SUPER_ADMIN only) ─────────────────── */}
      {AdminRoutes}

      {/* ── Fallback ────────────────────────────────────────────────────── */}
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
