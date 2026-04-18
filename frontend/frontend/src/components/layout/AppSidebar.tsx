import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { canAccessMlPlatformDashboards, canAccessNavItem, resolveUserContext, type NavScope } from '@/lib/accessResolver';
import { useBroadcastStore } from '@/store/broadcastStore';
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
  ClipboardList,
  DoorClosed,
  Brain,
  Shield,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { getInitials, resolveMediaUrl } from '@/utils/media';
import { useEffect, useState } from 'react';
import { useBadges } from '@/hooks/useBadges';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NavChildItem {
  title: string;
  href?: string;
  requiredPermissions?: string[];
  badge?: number;
  scope?: 'hospital' | 'platform' | 'shared';
  children?: NavChildItem[];
}

interface NavItem extends NavChildItem {
  icon: React.ComponentType<{ className?: string }>;
}

type SidebarBadgeCounts = {
  incomingRequests: number;
  outgoingRequests: number;
  hospitalRegistrations: number;
  updateRequests: number;
  offboardingRequests: number;
};

const HOSPITAL_ADMIN_ADMINISTRATION_PERMISSIONS = [
  'hospital:offboarding.request',
  'hospital:role.manage',
  'hospital:user_role.assign',
  'hospital:staff.manage',
  'hospital:invitation.manage',
  'hospital:hospital.update',
  'hospital:integration.manage',
];

const PLATFORM_ML_OPERATIONS_PERMISSIONS = [
  'ml:job.view',
  'ml:job.manage',
  'ml:dataset.review',
  'ml:training.manage',
  'ml:model_version.manage',
  'ml:model_version.activate',
];

const PLATFORM_ML_INSIGHTS_PERMISSIONS = [
  'ml:forecast.view',
  'ml:outbreak.view',
  'ml:suggestion.view',
  'ml:dataset.review',
  'ml:training.manage',
  'ml:model_version.manage',
  'ml:model_version.activate',
];

const PERMISSIONS = {
  dashboard: [
    'dashboard:view',
    'hospital:inventory.view',
    'hospital:request.view',
    'hospital:hospital.view',
    'communication:chat.view',
    'reports:view',
  ],
  inventory: ['hospital:inventory.view'],
  forecasting: ['ml:forecast.view', 'hospital:inventory.view'],
  outbreak: ['ml:outbreak.view', 'hospital:inventory.view'],
  inventoryImports: ['hospital:inventory.import', 'hospital:inventory.view'],
  sales: ['hospital:sales.view'],
  sharing: ['hospital:resource_share.view'],
  sharingRequests: ['hospital:request.view'],
  dispatchScan: ['hospital:request.view'],
  sharingVisibility: ['hospital:resource_share.visibility.view', 'hospital:resource_share.manage'],
  sharingTemplates: ['communication:template.view', 'hospital:request.create'],
  paymentCheckout: ['hospital:payment.view', 'hospital:payment.initiate'],
  paymentOps: ['hospital:payment.view'],
  paymentReconcile: ['hospital:payment.reconcile.manage'],
  mlOperations: PLATFORM_ML_OPERATIONS_PERMISSIONS,
  mlInsights: PLATFORM_ML_INSIGHTS_PERMISSIONS,
  trustProfiles: ['hospital:hospital.view', 'hospital:hospital.update', 'hospital:inventory.view', 'platform:hospital.view'],
  trustPerformance: ['hospital:analytics.view', 'reports:analytics.view'],
  messages: ['communication:chat.view', 'communication:conversation.view', 'hospital:communication.view'],
  emergency: ['communication:broadcast.view', 'communication:broadcast.manage', 'hospital:broadcast.manage'],
  adminRolesPlatform: ['platform:role.view', 'platform:role.manage', 'platform:user_role.view', 'platform:user_role.assign'],
  adminRolesHospital: ['hospital:role.view', 'hospital:role.manage', 'hospital:user_role.view', 'hospital:user_role.assign'],
  adminStaffInvitationsPlatform: ['platform:user.view', 'platform:user_role.assign', 'platform:role.assign', 'platform:role.manage'],
  adminStaffInvitationsHospital: ['hospital:invitation.view', 'hospital:invitation.manage', 'hospital:user_role.assign'],
  adminStaffPlatform: ['platform:user.view', 'platform:user_role.assign', 'platform:role.assign', 'platform:role.manage'],
  adminStaffHospital: ['hospital:staff.view', 'hospital:staff.manage', 'hospital:staff.supervise'],
  adminFacilitySourcePlatform: ['platform:hospital.manage', 'platform:hospital.update.review'],
  adminFacilitySourceHospital: ['hospital:integration.manage', 'hospital:hospital.update'],
  adminHospitalUpdateRequests: HOSPITAL_ADMIN_ADMINISTRATION_PERMISSIONS,
  adminOffboardingRequest: HOSPITAL_ADMIN_ADMINISTRATION_PERMISSIONS,
  reports: ['reports:view', 'hospital:analytics.view', 'platform:audit.view'],
  platformHospitalReview: ['platform:hospital.review'],
  platformHospitals: ['platform:hospital.view', 'platform:hospital.manage'],
  platformAnalytics: ['platform:audit.view'],
  platformDataIntegration: ['platform:hospital.manage'],
  profile: [
    'auth:permission.effective.view',
    'dashboard:view',
    'communication:notification.view',
    'communication:chat.view',
    'hospital:hospital.view',
    'platform:user.view',
  ],
  broadcastInbox: ['communication:broadcast.read', 'communication:broadcast.respond'],
};

const hasNavigationAccess = (
  user: ReturnType<typeof useAuth>['user'],
  scope: NavScope | undefined,
  requiredPermissions?: string[],
): boolean => {
  return canAccessNavItem(user, scope || 'shared', requiredPermissions);
};

const isPathActive = (pathname: string, href?: string): boolean => {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
};

const hasActiveDescendantHref = (node: NavChildItem, activeHref: string | undefined): boolean => {
  if (!activeHref) {
    return false;
  }

  if (node.href === activeHref) {
    return true;
  }

  return (node.children || []).some((child) => hasActiveDescendantHref(child, activeHref));
};

const hasVisibleNavigationNode = (
  user: ReturnType<typeof useAuth>['user'],
  node: NavChildItem,
  fallbackScope: NavScope | undefined,
): boolean => {
  const effectiveScope = node.scope || fallbackScope;

  if (node.requiredPermissions && !hasNavigationAccess(user, effectiveScope, node.requiredPermissions)) {
    return false;
  }

  if (node.children?.length) {
    return node.children.some((child) => hasVisibleNavigationNode(user, child, effectiveScope));
  }

  if (!node.href) {
    return false;
  }

  return hasNavigationAccess(user, effectiveScope, node.requiredPermissions);
};

const getVisibleChildNodes = (
  user: ReturnType<typeof useAuth>['user'],
  nodes: NavChildItem[],
  fallbackScope: NavScope | undefined,
): NavChildItem[] => {
  return nodes.filter((node) => hasVisibleNavigationNode(user, node, node.scope || fallbackScope));
};

const resolveVisibleNodeBadge = (
  user: ReturnType<typeof useAuth>['user'],
  node: NavChildItem,
  fallbackScope: NavScope | undefined,
): number | undefined => {
  const effectiveScope = node.scope || fallbackScope;

  if (node.requiredPermissions && !hasNavigationAccess(user, effectiveScope, node.requiredPermissions)) {
    return undefined;
  }

  const ownBadge =
    typeof node.badge === 'number' && Number.isFinite(node.badge)
      ? Math.max(0, Math.floor(node.badge))
      : 0;

  if (!node.children?.length) {
    return ownBadge > 0 ? ownBadge : undefined;
  }

  const visibleChildren = getVisibleChildNodes(user, node.children, effectiveScope);
  const childBadgeTotal = visibleChildren.reduce(
    (total, child) => total + (resolveVisibleNodeBadge(user, child, effectiveScope) || 0),
    0,
  );

  const aggregated = ownBadge + childBadgeTotal;
  return aggregated > 0 ? aggregated : undefined;
};

const collectVisibleLeafHrefs = (
  user: ReturnType<typeof useAuth>['user'],
  node: NavChildItem,
  fallbackScope: NavScope | undefined,
): string[] => {
  const effectiveScope = node.scope || fallbackScope;

  if (node.requiredPermissions && !hasNavigationAccess(user, effectiveScope, node.requiredPermissions)) {
    return [];
  }

  if (node.children?.length) {
    return node.children.flatMap((child) => collectVisibleLeafHrefs(user, child, effectiveScope));
  }

  if (!node.href || !hasNavigationAccess(user, effectiveScope, node.requiredPermissions)) {
    return [];
  }

  return [node.href];
};

const resolveActiveHref = (
  pathname: string,
  user: ReturnType<typeof useAuth>['user'],
  nodes: NavItem[],
): string | undefined => {
  const candidateHrefs = nodes.flatMap((node) => collectVisibleLeafHrefs(user, node, node.scope));
  const matchedHrefs = candidateHrefs.filter((href) => isPathActive(pathname, href));

  if (matchedHrefs.length === 0) {
    return undefined;
  }

  return matchedHrefs.sort((left, right) => right.length - left.length)[0];
};

const formatRoleLabel = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const resolveUserDesignation = (user: ReturnType<typeof useAuth>['user']): string => {
  if (!user) return 'User';

  const primaryRole =
    user.hospital_role?.trim() ||
    user.role?.trim() ||
    user.roles?.find((role) => typeof role === 'string' && role.trim())?.trim() ||
    user.platform_roles?.find((role) => typeof role === 'string' && role.trim())?.trim() ||
    '';

  if (primaryRole) {
    return formatRoleLabel(primaryRole);
  }

  const effectivePermissions = Array.isArray(user.effective_permissions)
    ? user.effective_permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];
  const hasHospitalScopedPermissions = effectivePermissions.some((permission) => permission.startsWith('hospital:'));
  const hasPlatformScopedPermissions = effectivePermissions.some((permission) => permission.startsWith('platform:'));

  if (hasHospitalScopedPermissions && !hasPlatformScopedPermissions) return 'Healthcare Staff';
  if (hasPlatformScopedPermissions && !hasHospitalScopedPermissions) return 'Platform Staff';
  if (hasHospitalScopedPermissions && hasPlatformScopedPermissions) return 'Cross Scope Staff';

  if (user.context === 'HEALTHCARE') return 'Healthcare User';
  if (user.context === 'PLATFORM') return 'Platform User';
  return 'User';
};

const getNavigation = (
  t: (key: string) => string,
  unreadBroadcasts: number,
  showBroadcastBadge: boolean,
  options: {
    canInventoryView: boolean;
    canSaleCreate: boolean;
    canSaleHistoryView: boolean;
    isPlatformContext: boolean;
    canAccessMlDashboards: boolean;
    badges: SidebarBadgeCounts;
  }
): NavItem[] => {
  const hospitalAdministrationNav: NavItem = {
    title: t('nav.admin.label'),
    icon: Users,
    scope: 'hospital',
    children: [
      { title: t('nav.admin.roles'), href: '/hospital-admin/roles', scope: 'hospital', requiredPermissions: PERMISSIONS.adminRolesHospital },
      { title: t('nav.admin.staffInvitations'), href: '/hospital-admin/staff-invitations', scope: 'hospital', requiredPermissions: PERMISSIONS.adminStaffInvitationsHospital },
      { title: t('nav.admin.staff'), href: '/hospital-admin/staff', scope: 'hospital', requiredPermissions: PERMISSIONS.adminStaffHospital },
      { title: 'Staff Profiles', href: '/hospital-admin/staff-profiles', scope: 'hospital', requiredPermissions: PERMISSIONS.adminStaffHospital },
      { title: t('nav.trust.performanceTracking'), href: '/hospital-admin/performance-tracking', scope: 'hospital', requiredPermissions: PERMISSIONS.trustPerformance },
      { title: 'Facility Source Setup', href: '/hospital-admin/facility-source-setup', scope: 'hospital', requiredPermissions: PERMISSIONS.adminFacilitySourceHospital },
      {
        title: 'Healthcare Update Requests',
        href: '/hospital-admin/hospital-update-requests',
        scope: 'hospital',
        requiredPermissions: PERMISSIONS.adminHospitalUpdateRequests,
        badge: options.badges.updateRequests > 0 ? options.badges.updateRequests : undefined,
      },
      { title: 'Request Offboarding', href: '/hospital-admin/offboarding-request', scope: 'hospital', requiredPermissions: PERMISSIONS.adminOffboardingRequest },
    ],
  };

  const platformAdministrationNav: NavItem[] = [
    {
      title: 'Healthcare Registrations',
      href: '/admin/hospital-registrations',
      icon: Building2,
      scope: 'platform',
      requiredPermissions: PERMISSIONS.platformHospitalReview,
      badge: options.badges.hospitalRegistrations > 0 ? options.badges.hospitalRegistrations : undefined,
    },
    { title: 'Healthcare Management', href: '/admin/hospitals', icon: Building2, scope: 'platform', requiredPermissions: PERMISSIONS.platformHospitals },
    {
      title: 'Healthcare Update Requests',
      href: '/admin/hospital-update-requests',
      icon: ClipboardList,
      scope: 'platform',
      requiredPermissions: PERMISSIONS.platformHospitalReview,
      badge: options.badges.updateRequests > 0 ? options.badges.updateRequests : undefined,
    },
    {
      title: 'Offboarding Requests',
      href: '/admin/offboarding-requests',
      icon: DoorClosed,
      scope: 'platform',
      requiredPermissions: PERMISSIONS.platformHospitalReview,
      badge: options.badges.offboardingRequests > 0 ? options.badges.offboardingRequests : undefined,
    },
    { title: t('nav.admin.staffInvitations'), href: '/admin/staff-invitations', icon: Users, scope: 'platform', requiredPermissions: PERMISSIONS.adminStaffInvitationsPlatform },
    { title: t('nav.admin.staff'), href: '/admin/staff', icon: Users, scope: 'platform', requiredPermissions: PERMISSIONS.adminStaffPlatform },
    { title: t('nav.admin.roles'), href: '/admin/roles', icon: Shield, scope: 'platform', requiredPermissions: PERMISSIONS.adminRolesPlatform },
    { title: 'Facility Source Setup', href: '/admin/facility-source-setup', icon: Database, scope: 'platform', requiredPermissions: PERMISSIONS.adminFacilitySourcePlatform },
    { title: 'Platform Analytics', href: '/admin/analytics', icon: BarChart3, scope: 'platform', requiredPermissions: PERMISSIONS.platformAnalytics },
    { title: 'Data Integration', href: '/admin/data', icon: Database, scope: 'platform', requiredPermissions: PERMISSIONS.platformDataIntegration },
  ];

  const platformMlNav: NavItem[] = options.canAccessMlDashboards
    ? [
        { title: 'ML Operations', href: '/ml/operations', icon: Brain, scope: 'platform', requiredPermissions: PERMISSIONS.mlOperations },
        { title: 'Insights Dashboard', href: '/ml/insights', icon: Brain, scope: 'platform', requiredPermissions: PERMISSIONS.mlInsights },
      ]
    : [];

  const navigation: NavItem[] = [
    // ── Hospital user navigation ────────────────────────────────────────
    { title: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard, scope: 'hospital', requiredPermissions: PERMISSIONS.dashboard },
    { title: 'Outbreak Prediction', href: '/inventory/outbreak-prediction', icon: Activity, scope: 'hospital', requiredPermissions: PERMISSIONS.outbreak },
    { title: t('nav.trust.hospitalProfiles'), href: '/hospital-profiles', icon: Building2, scope: 'hospital', requiredPermissions: PERMISSIONS.trustProfiles },
    {
      title: t('nav.inventory.label'),
      icon: Package,
      scope: 'hospital',
      children: [
        options.canInventoryView ? { title: t('nav.inventory.stockList'), href: '/inventory' } : null,
        { title: 'Forecasting', href: '/inventory/forecasting', requiredPermissions: PERMISSIONS.forecasting },
        options.canSaleCreate ? { title: 'Create Sale', href: '/sales/create' } : null,
        options.canSaleHistoryView ? { title: 'Sale History', href: '/sales/history' } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    },
    {
      title: t('nav.resourceSharing.label'),
      icon: Share2,
      scope: 'hospital',
      requiredPermissions: PERMISSIONS.sharing,
      children: [
        { title: t('nav.resourceSharing.sharedResources'), href: '/sharing', requiredPermissions: PERMISSIONS.sharing },
        { title: t('nav.resourceSharing.mySharedResources'), href: '/sharing/my-resources', requiredPermissions: PERMISSIONS.sharing },
        { title: t('nav.resourceSharing.visibilityControl'), href: '/sharing/visibility', requiredPermissions: PERMISSIONS.sharingVisibility },
        { title: t('nav.resourceSharing.requestTemplates'), href: '/sharing/templates', requiredPermissions: PERMISSIONS.sharingTemplates },
      ],
    },
    {
      title: t('nav.resourceSharing.requestWorkflow'),
      icon: ClipboardList,
      scope: 'hospital',
      requiredPermissions: PERMISSIONS.sharingRequests,
      children: [
        {
          title: 'Incoming Requests',
          href: '/sharing/requests/incoming',
          requiredPermissions: PERMISSIONS.sharingRequests,
          badge: options.badges.incomingRequests > 0 ? options.badges.incomingRequests : undefined,
        },
        {
          title: 'Outgoing Requests',
          href: '/sharing/requests/outgoing',
          requiredPermissions: PERMISSIONS.sharingRequests,
          badge: options.badges.outgoingRequests > 0 ? options.badges.outgoingRequests : undefined,
        },
        {
          title: 'Dispatch QR Scanner',
          href: '/dispatch/scan',
          requiredPermissions: PERMISSIONS.dispatchScan,
        },
      ],
    },
    {
      title: 'Payments',
      icon: CreditCard,
      scope: 'hospital',
      requiredPermissions: PERMISSIONS.paymentOps,
      children: [
        { title: 'Checkout Status', href: '/payments/checkout', requiredPermissions: PERMISSIONS.paymentCheckout },
        { title: 'Operations Center', href: '/payments/operations', requiredPermissions: PERMISSIONS.paymentOps },
        { title: 'Reconciliation', href: '/payments/reconciliation', requiredPermissions: PERMISSIONS.paymentReconcile },
      ],
    },
    {
      title: t('nav.communication.label'),
      icon: MessageSquare,
      scope: 'hospital',
      requiredPermissions: PERMISSIONS.messages,
      children: [
        { title: t('nav.communication.messages'), href: '/messages', requiredPermissions: PERMISSIONS.messages },
        {
          title: t('nav.transport.emergencyBroadcast'),
          href: '/communication/emergency',
          requiredPermissions: PERMISSIONS.emergency,
          badge: showBroadcastBadge && unreadBroadcasts > 0 ? unreadBroadcasts : undefined,
        },
      ],
    },
    options.isPlatformContext || !options.canAccessMlDashboards
      ? null
      : {
          title: 'ML Insights',
          icon: Brain,
          scope: 'platform',
          requiredPermissions: PERMISSIONS.mlOperations,
          children: [
            { title: 'ML Operations', href: '/ml/operations', requiredPermissions: PERMISSIONS.mlOperations },
            { title: 'Insights Dashboard', href: '/ml/insights', requiredPermissions: PERMISSIONS.mlInsights },
          ],
        },
    options.isPlatformContext ? null : hospitalAdministrationNav,
    ...(options.isPlatformContext ? [...platformMlNav, ...platformAdministrationNav] : []),
    { title: 'CSV Import Center', href: '/inventory/imports', icon: Database, scope: 'hospital', requiredPermissions: PERMISSIONS.inventoryImports },
    { title: t('nav.reports'), href: '/reports', icon: FileText, scope: 'shared', requiredPermissions: PERMISSIONS.reports },
  ];

  return navigation.filter((item): item is NavItem => Boolean(item));
};

const NestedChildItem = ({
  item,
  user,
  parentScope,
  activeHref,
  onNavigate,
  depth = 0,
}: {
  item: NavChildItem;
  user: ReturnType<typeof useAuth>['user'];
  parentScope: NavScope | undefined;
  activeHref: string | undefined;
  onNavigate?: () => void;
  depth?: number;
}) => {
  const effectiveScope = item.scope || parentScope;
  const visibleChildren = item.children?.length
    ? getVisibleChildNodes(user, item.children, effectiveScope)
    : [];
  const hasChildren = visibleChildren.length > 0;
  const hasActiveDescendant = hasChildren && visibleChildren.some((child) => hasActiveDescendantHref(child, activeHref));
  const aggregatedBadge = resolveVisibleNodeBadge(user, item, parentScope);

  const [isOpen, setIsOpen] = useState(hasActiveDescendant);

  useEffect(() => {
    if (hasActiveDescendant) {
      setIsOpen(true);
    }
  }, [hasActiveDescendant]);

  if (item.requiredPermissions && !hasNavigationAccess(user, effectiveScope, item.requiredPermissions)) {
    return null;
  }

  const paddingLeft = `${0.75 + depth * 0.75}rem`;

  if (hasChildren) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          className="flex w-full items-center justify-between rounded-lg py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          style={{ paddingLeft }}
        >
          <div className="flex items-center gap-2">
            <span>{item.title}</span>
            {aggregatedBadge ? (
              <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                {aggregatedBadge}
              </Badge>
            ) : null}
          </div>
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-1">
          {visibleChildren.map((child) => (
            <NestedChildItem
              key={`${child.title}-${child.href || 'group'}`}
              item={child}
              user={user}
              parentScope={effectiveScope}
              activeHref={activeHref}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  if (!item.href || !hasNavigationAccess(user, effectiveScope, item.requiredPermissions)) {
    return null;
  }

  const isActive = item.href === activeHref;

  return (
    <NavLink
      to={item.href}
      onClick={onNavigate}
      end
      className={cn(
        'flex items-center gap-2 rounded-lg py-2 text-sm transition-colors',
        isActive
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
      style={{ paddingLeft }}
    >
      <span>{item.title}</span>
      {aggregatedBadge ? (
        <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1.5 text-xs">
          {aggregatedBadge}
        </Badge>
      ) : null}
    </NavLink>
  );
};

const NavItemComponent = ({
  item,
  user,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  user: ReturnType<typeof useAuth>['user'];
  activeHref: string | undefined;
  onNavigate?: () => void;
}) => {
  const visibleChildren = item.children?.length
    ? getVisibleChildNodes(user, item.children, item.scope)
    : [];
  const hasChildren = visibleChildren.length > 0;
  const hasActiveDescendant = hasChildren && visibleChildren.some((child) => hasActiveDescendantHref(child, activeHref));
  const aggregatedBadge = resolveVisibleNodeBadge(user, item, item.scope);

  const [isOpen, setIsOpen] = useState(hasActiveDescendant);

  useEffect(() => {
    if (hasActiveDescendant) {
      setIsOpen(true);
    }
  }, [hasActiveDescendant]);

  if (hasChildren) {
    if (item.requiredPermissions && !hasNavigationAccess(user, item.scope, item.requiredPermissions)) {
      return null;
    }

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <div className="flex items-center gap-3">
            <item.icon className="h-5 w-5" />
            <span>{item.title}</span>
            {aggregatedBadge && (
              <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                {aggregatedBadge}
              </Badge>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-1">
          {visibleChildren.map((child) => (
            <NestedChildItem
              key={`${child.title}-${child.href || 'group'}`}
              item={child}
              user={user}
              parentScope={item.scope}
              activeHref={activeHref}
              onNavigate={onNavigate}
              depth={1}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  if (!item.href || !hasNavigationAccess(user, item.scope, item.requiredPermissions)) {
    return null;
  }

  const isActive = item.href === activeHref;

  return (
    <NavLink
      to={item.href}
      onClick={onNavigate}
      end
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <item.icon className="h-5 w-5" />
      <span>{item.title}</span>
      {aggregatedBadge && (
        <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1.5 text-xs">
          {aggregatedBadge}
        </Badge>
      )}
    </NavLink>
  );
};

const SidebarContent = ({
  onNavigate,
  onCollapse,
  badges,
}: {
  onNavigate?: () => void;
  onCollapse?: () => void;
  badges: SidebarBadgeCounts;
}) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { can, canAny } = usePermission();
  const { t } = useLanguage();
  const unreadBroadcasts = useBroadcastStore((state) => state.unreadCount);
  const userDesignation = resolveUserDesignation(user);

  const showBroadcastBadge = canAccessNavItem(user, 'hospital', PERMISSIONS.broadcastInbox);

  const canInventoryView = can('inventory.view');
  const canSaleCreate = canAny(['sale.create', 'sale.manage', 'sales.manage', 'hospital:sales.manage']);
  const canSaleHistoryView = canAny(['sale.history.view', 'hospital:sales.view']);
  const isPlatformContext = resolveUserContext(user) === 'PLATFORM';
  const canAccessMlDashboards = canAccessMlPlatformDashboards(user);
  const profilePictureSrc = resolveMediaUrl(user?.profile_picture_url || user?.profile_picture || '');
  const profileInitials = getInitials(user?.full_name || user?.email || 'User');

  const navigation = getNavigation(t, unreadBroadcasts, showBroadcastBadge, {
    canInventoryView,
    canSaleCreate,
    canSaleHistoryView,
    isPlatformContext,
    canAccessMlDashboards,
    badges,
  });
  const activeHref = resolveActiveHref(location.pathname, user, navigation);

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
        {onCollapse ? (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto hidden h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent md:inline-flex"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {navigation
          .filter((item) => {
            if (item.children?.length) {
              return item.children.some((child) => hasVisibleNavigationNode(user, child, item.scope));
            }

            return hasNavigationAccess(user, item.scope, item.requiredPermissions);
          })
          .map((item) => (
            <NavItemComponent
              key={`${item.title}-${item.href || 'group'}`}
              item={item}
              user={user}
              activeHref={activeHref}
              onNavigate={onNavigate}
            />
          ))}
      </nav>

      {/* User Section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
          <Avatar className="h-9 w-9 border border-sidebar-border/70">
            {profilePictureSrc ? <AvatarImage src={profilePictureSrc} alt="User profile picture" /> : null}
            <AvatarFallback className="bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground">
              {profileInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <NavLink to="/profile" className="block">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.full_name || user?.email}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{userDesignation}</p>
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

interface AppSidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export const AppSidebar = ({ collapsed = false, onCollapsedChange }: AppSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const {
    incomingRequests,
    outgoingRequests,
    hospitalRegistrations,
    updateRequests,
    offboardingRequests,
  } = useBadges(user);

  const badgeCounts: SidebarBadgeCounts = {
    incomingRequests,
    outgoingRequests,
    hospitalRegistrations,
    updateRequests,
    offboardingRequests,
  };

  const handleCollapse = () => {
    onCollapsedChange?.(true);
  };

  const handleExpand = () => {
    onCollapsedChange?.(false);
  };

  return (
    <>
      {collapsed ? (
        <div className="fixed left-4 top-4 z-40 hidden md:block">
          <Button
            variant="outline"
            size="icon"
            className="bg-background/90 shadow-md"
            onClick={handleExpand}
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:block',
          collapsed ? '-translate-x-full' : 'translate-x-0'
        )}
      >
        <SidebarContent onCollapse={handleCollapse} badges={badgeCounts} />
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
            <SidebarContent onNavigate={() => setIsOpen(false)} badges={badgeCounts} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};

export default AppSidebar;