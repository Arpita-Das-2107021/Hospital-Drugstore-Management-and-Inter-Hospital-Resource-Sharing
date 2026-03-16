import { ReactNode, useState, useEffect } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { useScrollRestoration } from '@/hooks/use-scroll-restoration';
import { AppSidebar } from './AppSidebar';
import { LanguageToggle } from './LanguageToggle';
import { Bell, Search, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { broadcastsApi, conversationsApi } from '@/services/api';
import { BROADCASTS_UPDATED_EVENT, CHAT_UPDATED_EVENT } from '@/constants/events';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const AppLayout = ({ children, title, subtitle }: AppLayoutProps) => {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const { saveScrollPosition } = useScrollRestoration();
  const navigate = useNavigate();

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [broadcastAlerts, setBroadcastAlerts] = useState<
    Array<{ id: string; title: string; preview: string; createdAt: string; isRead: boolean }>
  >([]);

  const parseItems = (payload: any): any[] => {
    const root = payload?.data ?? payload;
    if (Array.isArray(root?.results)) return root.results;
    if (Array.isArray(root?.data)) return root.data;
    if (Array.isArray(root?.items)) return root.items;
    if (Array.isArray(root)) return root;
    return [];
  };

  const fetchUnreadCounts = async () => {
    let unreadCountResolved = false;

    try {
      const unreadResponse: any = await broadcastsApi.getUnreadCount();
      const unread = unreadResponse?.data?.unread_count ?? unreadResponse?.unread_count ?? 0;
      setUnreadNotifications(Number.isFinite(unread) ? unread : 0);
      unreadCountResolved = true;
    } catch {
      // no-op: this endpoint may require hospital context; list fallback below keeps bell useful.
    }

    try {
      const res: any = await broadcastsApi.getAll();
      const items: any[] = parseItems(res);
      const mapped = items
        .map((item: any) => {
          const message = String(item?.message || '');
          return {
            id: String(item?.id || ''),
            title: String(item?.title || 'Emergency Broadcast'),
            preview: message.length > 90 ? `${message.slice(0, 90)}...` : message,
            createdAt: String(item?.created_at || ''),
            isRead: Boolean(item?.is_read ?? false),
          };
        })
        .filter((item: any) => !!item.id)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setBroadcastAlerts(mapped.slice(0, 8));

      // Fallback when unread-count endpoint is not available for current role.
      if (!unreadCountResolved) {
        setUnreadNotifications(mapped.filter((item: any) => !item.isRead).length);
      }
    } catch {
      // Keep existing UI state on transient fetch errors.
    }

    try {
      const res: any = await conversationsApi.getAll();
      const items: any[] = parseItems(res);
      const unread = items.reduce((total: number, conversation: any) => total + Number(conversation?.unread_count || 0), 0);
      setUnreadMessages(unread);
    } catch {
      // no-op: keep existing count on transient fetch errors
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchUnreadCounts();

    const handleBroadcastsUpdated = () => {
      fetchUnreadCounts();
    };

    const handleChatUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ unreadMessages?: number; forceRefresh?: boolean }>).detail;
      if (typeof detail?.unreadMessages === 'number') {
        setUnreadMessages(detail.unreadMessages);
        return;
      }

      if (detail?.forceRefresh) {
        void fetchUnreadCounts();
      }
    };

    const intervalId = window.setInterval(() => {
      void fetchUnreadCounts();
    }, 5000);

    window.addEventListener(BROADCASTS_UPDATED_EVENT, handleBroadcastsUpdated);
    window.addEventListener(CHAT_UPDATED_EVENT, handleChatUpdated as EventListener);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(BROADCASTS_UPDATED_EVENT, handleBroadcastsUpdated);
      window.removeEventListener(CHAT_UPDATED_EVENT, handleChatUpdated as EventListener);
    };
  }, [isAuthenticated]);

  const handleAlertClick = async (alertId: string, isRead: boolean) => {
    if (!isRead) {
      try {
        await broadcastsApi.markRead(alertId);
      } catch {
        // no-op
      }
    }

    setAlertsOpen(false);
    navigate('/communication/emergency', { state: { highlightBroadcastId: alertId, openDetails: true } });
    window.dispatchEvent(new Event(BROADCASTS_UPDATED_EVENT));
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleNavigationClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('[data-navigation]')) {
      saveScrollPosition();
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AppSidebar />
      
      <div className="md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="pl-12 md:pl-0">
            {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground hidden sm:block">{subtitle}</p>}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                className="w-40 sm:w-64 pl-9"
              />
            </div>
            <LanguageToggle />
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="relative" asChild>
              <Link to="/messages">
                <MessageCircle className="h-5 w-5" />
                {unreadMessages > 0 && (
                  <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1 text-xs" variant="secondary">
                    {unreadMessages}
                  </Badge>
                )}
              </Link>
            </Button>
            <Popover open={alertsOpen} onOpenChange={setAlertsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Open emergency broadcast alerts">
                  <Bell className="h-5 w-5" />
                  {unreadNotifications > 0 && (
                    <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1 text-xs" variant="destructive">
                      {unreadNotifications}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[360px] p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold">Emergency Alerts</p>
                  <p className="text-xs text-muted-foreground">Recent broadcast summaries</p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {broadcastAlerts.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No emergency broadcasts yet.</p>
                  ) : (
                    <div className="divide-y">
                      {broadcastAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-muted/50"
                          onClick={() => handleAlertClick(alert.id, alert.isRead)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="line-clamp-1 text-sm font-medium">{alert.title}</p>
                            {!alert.isRead ? <Badge variant="default">Unread</Badge> : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{alert.preview || 'No summary available.'}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t px-4 py-2">
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => {
                    setAlertsOpen(false);
                    navigate('/communication/emergency');
                  }}>
                    Open Emergency Broadcast Center
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-4 md:p-6 main-content" onClick={handleNavigationClick}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;