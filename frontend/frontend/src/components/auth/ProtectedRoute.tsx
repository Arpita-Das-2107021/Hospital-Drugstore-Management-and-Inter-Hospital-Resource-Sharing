import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If set, only users whose role matches one of these strings can access the route. */
  allowedRoles?: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
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

  // Role-based guard: redirect to appropriate area if role is not allowed
  if (allowedRoles && allowedRoles.length > 0 && user) {
    const userRole = user.role?.toUpperCase();
    const normalised = allowedRoles.map(r => r.toUpperCase());
    if (!normalised.includes(userRole)) {
      // SUPER_ADMIN accidentally hitting a hospital route → admin home
      // Hospital user hitting an admin route → hospital dashboard
      const fallback = userRole === 'SUPER_ADMIN' ? '/admin/hospital-registrations' : '/dashboard';
      return <Navigate to={fallback} replace />;
    }
  }

  // User is authenticated (and has the correct role), render the route
  return <>{children}</>;
};

export default ProtectedRoute;