import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { broadcastsApi } from '@/services/api';
import { BROADCASTS_UPDATED_EVENT } from '@/constants/events';
import {
  LayoutDashboard,
  Package,
  BarChart3,
  Share2,
  MessageSquare,
  Users,
  Database,
  FileText,
  LogOut,
  ChevronDown,
  Activity,
  Menu,
  Building2,
  CreditCard,
  Siren,
  Star,
  ClipboardList,
  ShieldCheck,
  DoorClosed,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NavItem {
  title: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  roles?: string[];  // if set, only show to users with one of these roles
  children?: { title: string; href: string; roles?: string[]; badge?: number }[];
}

// Roles that belong to hospital operations (not platform admin)
const HOSPITAL_ROLES = ['HOSPITAL_ADMIN', 'PHARMACIST', 'STAFF', 'LOGISTICS_STAFF', 'DOCTOR', 'COORDINATOR'];
const ALL_APP_ROLES = [...HOSPITAL_ROLES, 'SUPER_ADMIN'];

const getNavigation = (
  t: (key: string) => string,
  unreadBroadcasts: number,
  showBroadcastBadge: boolean
): NavItem[] => [
  // ── Hospital user navigation ────────────────────────────────────────
  { title: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard, roles: HOSPITAL_ROLES },
  {
    title: t('nav.inventory.label'),
    icon: Package,
    roles: HOSPITAL_ROLES,
    children: [
      { title: t('nav.inventory.stockList'), href: '/inventory' },
      { title: t('nav.inventory.analytics'), href: '/inventory/analytics' },
      { title: t('nav.inventory.forecasting'), href: '/inventory/forecast' },
    ],
  },
  {
    title: t('nav.resourceSharing.label'),
    icon: Share2,
    roles: HOSPITAL_ROLES,
    children: [
      { title: t('nav.resourceSharing.sharedResources'), href: '/sharing' },
      { title: t('nav.resourceSharing.requestWorkflow'), href: '/sharing/requests' },
      { title: t('nav.resourceSharing.visibilityControl'), href: '/sharing/visibility' },
      { title: t('nav.resourceSharing.requestTemplates'), href: '/sharing/templates' },
    ],
  },
  {
    title: t('nav.trust.label'),
    icon: Star,
    roles: HOSPITAL_ROLES,
    children: [
      { title: t('nav.trust.hospitalProfiles'), href: '/trust/profiles' },
      { title: t('nav.trust.performanceTracking'), href: '/trust/performance' },
    ],
  },
  {
    title: t('nav.communication.label'),
    icon: MessageSquare,
    roles: HOSPITAL_ROLES,
    children: [
      { title: t('nav.communication.messages'), href: '/messages' },
      {
        title: t('nav.transport.emergencyBroadcast'),
        href: '/communication/emergency',
        badge: showBroadcastBadge && unreadBroadcasts > 0 ? unreadBroadcasts : undefined,
      },
    ],
  },
  // Administration for HOSPITAL_ADMIN only
  {
    title: t('nav.admin.label'),
    icon: Users,
    roles: ['HOSPITAL_ADMIN'],
    children: [
      { title: t('nav.admin.roles'), href: '/admin/roles', roles: ['HOSPITAL_ADMIN'] },
      { title: t('nav.admin.staffInvitations'), href: '/admin/staff-invitations', roles: ['HOSPITAL_ADMIN'] },
      { title: t('nav.admin.staff'), href: '/admin/staff', roles: ['HOSPITAL_ADMIN'] },
      { title: 'Request Offboarding', href: '/offboarding/request', roles: ['HOSPITAL_ADMIN'] },
    ],
  },
  { title: t('nav.reports'), href: '/reports', icon: FileText, roles: HOSPITAL_ROLES },

  // ── SUPER_ADMIN navigation ──────────────────────────────────────────
  { title: 'Hospital Registrations', href: '/admin/hospital-registrations', icon: ClipboardList, roles: ['SUPER_ADMIN'] },
  { title: 'Hospital Management', href: '/admin/hospitals', icon: Building2, roles: ['SUPER_ADMIN'] },
  { title: 'Hospital Update Requests', href: '/admin/hospital-update-requests', icon: ClipboardList, roles: ['SUPER_ADMIN'] },
  { title: 'Offboarding Requests', href: '/admin/offboarding-requests', icon: DoorClosed, roles: ['SUPER_ADMIN'] },
  { title: 'Staff Management', href: '/admin/staff', icon: Users, roles: ['SUPER_ADMIN'] },
  {
    title: 'Emergency Broadcasts',
    href: '/communication/emergency',
    icon: Siren,
    roles: ['SUPER_ADMIN'],
    badge: showBroadcastBadge && unreadBroadcasts > 0 ? unreadBroadcasts : undefined,
  },
  { title: 'Reports', href: '/reports', icon: FileText, roles: ['SUPER_ADMIN'] },
  { title: 'Platform Analytics', href: '/admin/analytics', icon: BarChart3, roles: ['SUPER_ADMIN'] },
  { title: 'Credit Ledger', href: '/credits', icon: CreditCard, roles: ['SUPER_ADMIN'] },
  { title: 'Audit Logs', href: '/admin/audit-logs', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
  { title: 'Data Integration', href: '/admin/data', icon: Database, roles: ['SUPER_ADMIN'] },
];

const NavItemComponent = ({ item, userRole, onNavigate }: { item: NavItem; userRole?: string; onNavigate?: () => void }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(
    item.children?.some(child => location.pathname === child.href) || false
  );

  if (item.children) {
    // Filter children by role
    const visibleChildren = item.children.filter(child =>
      !child.roles || (userRole && child.roles.includes(userRole))
    );
    if (visibleChildren.length === 0) return null;

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <div className="flex items-center gap-3">
            <item.icon className="h-5 w-5" />
            <span>{item.title}</span>
            {item.badge && (
              <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                {item.badge}
              </Badge>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-8 space-y-1 pt-1">
          {visibleChildren.map((child) => (
            <NavLink
              key={child.href}
              to={child.href}
              onClick={onNavigate}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive || location.pathname === child.href
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <span>{child.title}</span>
              {child.badge ? (
                <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1.5 text-xs">
                  {child.badge}
                </Badge>
              ) : null}
            </NavLink>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <NavLink
      to={item.href!}
      onClick={onNavigate}
      end
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <item.icon className="h-5 w-5" />
      <span>{item.title}</span>
      {item.badge && (
        <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1.5 text-xs">
          {item.badge}
        </Badge>
      )}
    </NavLink>
  );
};

const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [unreadBroadcasts, setUnreadBroadcasts] = useState(0);

  const userRole = user?.role?.toUpperCase();
  const showBroadcastBadge = Boolean(user?.hospital_id) && userRole !== 'SUPER_ADMIN';

  const refreshUnreadBroadcasts = async () => {
    if (!showBroadcastBadge) {
      setUnreadBroadcasts(0);
      return;
    }

    try {
      const response: unknown = await broadcastsApi.getUnreadCount();
      const count =
        response?.data?.unread_count ??
        response?.unread_count ??
        0;
      setUnreadBroadcasts(Number.isFinite(count) ? count : 0);
    } catch {
      // Keep the previous value on transient failures.
    }
  };

  useEffect(() => {
    if (!showBroadcastBadge) {
      setUnreadBroadcasts(0);
      return;
    }

    refreshUnreadBroadcasts();
    const intervalId = window.setInterval(refreshUnreadBroadcasts, 30000);
    const handleBroadcastsUpdated = () => {
      refreshUnreadBroadcasts();
    };

    window.addEventListener(BROADCASTS_UPDATED_EVENT, handleBroadcastsUpdated);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(BROADCASTS_UPDATED_EVENT, handleBroadcastsUpdated);
    };
  }, [showBroadcastBadge, user?.hospital_id]);

  const navigation = getNavigation(t, unreadBroadcasts, showBroadcastBadge);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
          <Activity className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-sidebar-foreground">HealthSync</h1>
          <p className="text-xs text-sidebar-foreground/60">Resource Management</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {navigation
          .filter(item => !item.roles || (userRole && item.roles.includes(userRole)))
          .map((item) => (
            <NavItemComponent key={item.title} item={item} userRole={userRole} onNavigate={onNavigate} />
          ))}
      </nav>

      {/* User Section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground">
            {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <NavLink to="/profile" className="block">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.full_name || user?.email}</p>
              <p className="truncate text-xs capitalize text-sidebar-foreground/60">{user?.role}</p>
            </NavLink>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const AppSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarContent />
      </aside>

      {/* Mobile Hamburger Menu */}
      <div className="fixed left-4 top-4 z-50 md:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="bg-background shadow-md">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
            <SidebarContent onNavigate={() => setIsOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};

export default AppSidebar;