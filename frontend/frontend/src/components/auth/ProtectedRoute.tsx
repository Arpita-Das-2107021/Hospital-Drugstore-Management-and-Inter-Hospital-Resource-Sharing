import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { type AccessContext, evaluateAccess } from '@/lib/accessResolver';
import { hasAnyPlatformRole } from '@/lib/rbac';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requireAllPermissions?: boolean;
  requiredContext?: AccessContext | AccessContext[];
  requireHospitalContext?: boolean;
  requiredPlatformRoles?: string[];
  fallbackPath?: string;
}

const ProtectedRoute = ({
  children,
  requiredPermissions,
  requireAllPermissions = false,
  requiredContext,
  requireHospitalContext = false,
  requiredPlatformRoles,
}: ProtectedRouteProps) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const requiredContextRule = requiredContext || (requireHospitalContext ? 'HEALTHCARE' : undefined);

  const access = evaluateAccess(user, {
    requiredContext: requiredContextRule,
    requiredPermissions,
    requireAllPermissions,
  });

  const hasRequiredPlatformRole = requiredPlatformRoles?.length
    ? hasAnyPlatformRole(user, requiredPlatformRoles)
    : true;

  if (!access.allowed || !hasRequiredPlatformRole) {
    const expectedContext = access.requiredContexts.length > 0
      ? access.requiredContexts.join(' or ')
      : '';

    const contextMessage = !hasRequiredPlatformRole
      ? 'Your account role is not allowed to access this platform page.'
      : access.denialReason === 'missing_context' || access.denialReason === 'forbidden_context'
      ? expectedContext
        ? `This page requires ${expectedContext} workspace context.`
        : 'This page is restricted by workspace context.'
      : 'Your account does not have the required permissions for this page.';

    const contextDetail = !hasRequiredPlatformRole
      ? `Allowed platform roles: ${(requiredPlatformRoles || []).join(', ')}`
      : access.denialReason === 'missing_context'
      ? 'Your account context is not available yet. Sign out and sign in again to refresh your session context.'
      : access.denialReason === 'forbidden_context'
        ? `Current context: ${access.context || 'UNKNOWN'}.`
        : null;

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md space-y-2">
          <h1 className="text-xl font-semibold">Access denied (403)</h1>
          <p className="text-sm text-muted-foreground">
            {contextMessage}
          </p>
          {contextDetail ? <p className="text-xs text-muted-foreground">{contextDetail}</p> : null}
        </div>
      </div>
    );
  }

  // User is authenticated and passes configured access constraints.
  return <>{children}</>;
};

export default ProtectedRoute;