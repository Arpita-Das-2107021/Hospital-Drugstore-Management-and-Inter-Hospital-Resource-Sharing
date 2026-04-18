import { useLocation, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { hasAnyPermission } from '@/lib/rbac';
import { 
  LayoutDashboard, 
  Package, 
  Share2, 
  Siren,
  MessageSquare,
  Plus
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  strictPermission?: string;
  requiredPermissions: string[];
}

const navItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: 'Home',
    href: '/dashboard',
    requiredPermissions: ['dashboard:view', 'hospital:inventory.view', 'hospital:request.view', 'communication:chat.view'],
  },
  {
    icon: Package,
    label: 'Inventory',
    href: '/inventory',
    strictPermission: 'inventory.view',
    requiredPermissions: ['hospital:inventory.view'],
  },
  {
    icon: Share2,
    label: 'Share',
    href: '/sharing',
    requiredPermissions: ['hospital:resource_share.view'],
  },
  {
    icon: Siren,
    label: 'Emergency',
    href: '/communication/emergency',
    requiredPermissions: ['communication:broadcast.view', 'communication:broadcast.manage', 'hospital:broadcast.manage'],
  },
  {
    icon: MessageSquare,
    label: 'Messages',
    href: '/messages',
    requiredPermissions: ['communication:chat.view', 'communication:conversation.view', 'hospital:communication.view'],
  },
];

interface MobileBottomNavProps {
  onQuickAction?: () => void;
}

export const MobileBottomNav = ({ onQuickAction }: MobileBottomNavProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const { can } = usePermission();

  const hasHospitalContext = Boolean(
    typeof user?.hospital_id === 'string' && user.hospital_id.trim().length > 0,
  );

  if (!hasHospitalContext) {
    return null;
  }

  const visibleItems = navItems.filter((item) => {
    if (item.strictPermission) {
      return can(item.strictPermission);
    }

    return hasAnyPermission(user, item.requiredPermissions);
  });

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {visibleItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-colors min-w-[60px]",
                isActive 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Center FAB */}
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg -mt-6 bg-primary hover:bg-primary/90"
          onClick={onQuickAction}
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Quick Action</span>
        </Button>

        {visibleItems.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-colors min-w-[60px]",
                isActive 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
