import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/components/layout/LanguageToggle';
import {
  LayoutDashboard,
  Package,
  BarChart3,
  TrendingUp,
  Share2,
  ArrowRightLeft,
  Bell,
  MessageSquare,
  Users,
  Database,
  FileText,
  LogOut,
  ChevronDown,
  Activity,
  Menu,
  X,
  Building2,
  Eye,
  Truck,
  CreditCard,
  Siren,
  // FileTemplate,
  Star,
  Timer
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
  children?: { title: string; href: string }[];
}

const getNavigation = (t: (key: string) => string): NavItem[] => [
  { title: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
  {
    title: t('nav.inventory.label'),
    icon: Package,
    children: [
      { title: t('nav.inventory.stockList'), href: '/inventory' },
      { title: t('nav.inventory.analytics'), href: '/inventory/analytics' },
      { title: t('nav.inventory.forecasting'), href: '/inventory/forecast' },
    ],
  },
  {
    title: t('nav.resourceSharing.label'),
    icon: Share2,
    children: [
      { title: t('nav.resourceSharing.sharedResources'), href: '/sharing' },
      { title: t('nav.resourceSharing.requestWorkflow'), href: '/sharing/requests' },
      { title: t('nav.resourceSharing.visibilityControl'), href: '/sharing/visibility' },
      { title: t('nav.resourceSharing.requestTemplates'), href: '/sharing/templates' },
    ],
  },
  {
    title: t('nav.transport.label'),
    icon: Truck,
    children: [
      { title: t('nav.transport.activeTransports'), href: '/transport/tracking' },
      { title: t('nav.transport.emergencyBroadcast'), href: '/transport/emergency' },
    ],
  },
  {
    title: t('nav.trust.label'),
    icon: Star,
    children: [
      { title: t('nav.trust.hospitalProfiles'), href: '/trust/profiles' },
      { title: t('nav.trust.creditLedger'), href: '/trust/credits' },
      { title: t('nav.trust.performanceTracking'), href: '/trust/performance' },
    ],
  },
  {
    title: t('nav.communication.label'),
    icon: MessageSquare,
    badge: 3,
    children: [
      { title: t('nav.communication.alerts'), href: '/alerts' },
      { title: t('nav.communication.messages'), href: '/messages' },
    ],
  },
  {
    title: t('nav.admin.label'),
    icon: Users,
    children: [
      { title: t('nav.admin.roles'), href: '/admin/roles' },
      { title: t('nav.admin.data'), href: '/admin/data' },
    ],
  },
  { title: t('nav.reports'), href: '/reports', icon: FileText },
];

const NavItemComponent = ({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(
    item.children?.some(child => location.pathname === child.href) || false
  );

  if (item.children) {
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
          {item.children.map((child) => (
            <NavLink
              key={child.href}
              to={child.href}
              onClick={onNavigate}
              end
              className={({ isActive }) =>
                cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive || location.pathname === child.href
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              {child.title}
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
  
  const navigation = getNavigation(t);

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
        {navigation.map((item) => (
          <NavItemComponent key={item.title} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* User Section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.name}</p>
            <p className="truncate text-xs capitalize text-sidebar-foreground/60">{user?.role}</p>
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