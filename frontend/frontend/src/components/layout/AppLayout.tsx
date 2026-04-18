import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import authService from '@/services/authService';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { useScrollRestoration } from '@/hooks/use-scroll-restoration';
import { AppSidebar } from './AppSidebar';
import { LanguageToggle } from './LanguageToggle';
import { Bell, Search, MessageCircle, QrCode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { broadcastsApi, conversationsApi } from '@/services/api';
import { BROADCASTS_UPDATED_EVENT, CHAT_UPDATED_EVENT } from '@/constants/events';
import { canAccessNavItem } from '@/lib/accessResolver';
import { useBroadcastStore, shouldRefreshBroadcastUnread } from '@/store/broadcastStore';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

type BroadcastsUpdatedDetail = {
  unreadCount?: number;
  incrementUnread?: number;
  decrementUnread?: number;
  clearUnread?: boolean;
  forceRefresh?: boolean;
  listChanged?: boolean;
  broadcastId?: string;
  isRead?: boolean;
};

const CHAT_ACCESS_PERMISSION_CODES = [
  'communication:chat.view',
  'communication:conversation.view',
  'hospital:communication.view',
];
const DISPATCH_SCANNER_PERMISSION_CODES = ['hospital:request.view'];

const BROADCAST_UNREAD_PERMISSION_CODES = ['communication:broadcast.read', 'communication:broadcast.respond'];
const BROADCAST_CENTER_PERMISSION_CODES = ['communication:broadcast.view', 'communication:broadcast.manage', 'hospital:broadcast.manage'];
const BROADCAST_BADGE_PERMISSION_CODES = [
  ...BROADCAST_UNREAD_PERMISSION_CODES,
  ...BROADCAST_CENTER_PERMISSION_CODES,
];
const BROADCAST_ALERTS_STALE_MS = 30_000;
const BROADCAST_SOCKET_NON_RETRYABLE_CLOSE_CODES = new Set([1000, 1008, 4401, 4403]);
const BROADCAST_SOCKET_RECONNECT_BASE_DELAY_MS = 2_000;
const BROADCAST_SOCKET_RECONNECT_MAX_DELAY_MS = 15_000;
const BROADCAST_SOCKET_MAX_RECONNECT_ATTEMPTS = 6;
const BROADCAST_SOCKET_STABLE_OPEN_RESET_MS = 10_000;
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const getWsBaseUrl = (): string => {
  if (API_BASE_URL.startsWith('https://')) {
    return API_BASE_URL.replace('https://', 'wss://');
  }

  return API_BASE_URL.replace('http://', 'ws://');
};

const shouldRetryBroadcastSocketClose = (closeCode: number): boolean => {
  return !BROADCAST_SOCKET_NON_RETRYABLE_CLOSE_CODES.has(closeCode);
};

const AppLayout = ({ children, title, subtitle }: AppLayoutProps) => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const { saveScrollPosition } = useScrollRestoration();
  const navigate = useNavigate();

  const unreadBroadcasts = useBroadcastStore((state) => state.unreadCount);
  const unreadBroadcastsLastFetchedAt = useBroadcastStore((state) => state.lastFetchedAt);
  const setUnreadBroadcasts = useBroadcastStore((state) => state.setUnreadCount);
  const incrementUnreadBroadcasts = useBroadcastStore((state) => state.incrementUnread);
  const decrementUnreadBroadcasts = useBroadcastStore((state) => state.decrementUnread);
  const clearUnreadBroadcasts = useBroadcastStore((state) => state.clearUnread);

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [broadcastAlertsFetchedAt, setBroadcastAlertsFetchedAt] = useState<number | null>(null);
  const [broadcastAlerts, setBroadcastAlerts] = useState<
    Array<{ id: string; title: string; preview: string; createdAt: string; isRead: boolean }>
  >([]);

  const broadcastSocketRef = useRef<WebSocket | null>(null);
  const broadcastReconnectTimeoutRef = useRef<number | null>(null);
  const broadcastReconnectAttemptsRef = useRef(0);
  const broadcastStableOpenTimeoutRef = useRef<number | null>(null);
  const alertsOpenRef = useRef(false);
  const refreshUnreadNotificationsRef = useRef((_: { force?: boolean } = {}) => Promise.resolve());
  const fetchBroadcastAlertsRef = useRef((_: { force?: boolean } = {}) => Promise.resolve());

  const canAccessChat = canAccessNavItem(user, 'hospital', CHAT_ACCESS_PERMISSION_CODES);
  const canAccessDispatchScanner = canAccessNavItem(user, 'hospital', DISPATCH_SCANNER_PERMISSION_CODES);
  const canTrackBroadcastUnread = canAccessNavItem(user, 'hospital', BROADCAST_BADGE_PERMISSION_CODES);
  const canAccessEmergencyCenter = canAccessNavItem(user, 'hospital', BROADCAST_CENTER_PERMISSION_CODES);
  const unreadNotifications = canTrackBroadcastUnread ? unreadBroadcasts : 0;

  const asRecord = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  };

  const toFiniteNumber = (...values: unknown[]): number | null => {
    for (const value of values) {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  const parseItems = (payload: unknown): unknown[] => {
    const payloadRecord = asRecord(payload);
    const rootValue = payloadRecord.data ?? payload;

    if (Array.isArray(rootValue)) return rootValue;

    const root = asRecord(rootValue);
    if (Array.isArray(root.results)) return root.results;
    if (Array.isArray(root.data)) return root.data;
    if (Array.isArray(root.items)) return root.items;
    return [];
  };

  const fetchUnreadMessages = useCallback(async () => {
    if (!canAccessChat) {
      setUnreadMessages(0);
      return;
    }

    let unreadResolved = false;

    try {
      const unreadResponse: unknown = await conversationsApi.getGlobalUnreadCount();
      const root = asRecord(unreadResponse);
      const data = asRecord(root.data);
      const unread: number =
        toFiniteNumber(
          data.total_unread,
          data.unread_count,
          data.total,
          root.total_unread,
          root.unread_count,
          root.total,
        ) ?? 0;

      setUnreadMessages(Math.max(0, unread));
      unreadResolved = true;
    } catch {
      // Fallback to list aggregation when global unread endpoint is unavailable.
    }

    if (unreadResolved) {
      return;
    }

    try {
      const res: unknown = await conversationsApi.getAll();
      const items: unknown[] = parseItems(res);
      const unread: number = items.reduce<number>((total, conversation: unknown) => {
        const conversationRecord = asRecord(conversation);
        const unreadCount = toFiniteNumber(conversationRecord.unread_count) ?? 0;
        return total + (unreadCount > 0 ? 1 : 0);
      }, 0);
      setUnreadMessages(Math.max(0, unread));
    } catch {
      // no-op: keep existing count on transient fetch errors
    }
  }, [canAccessChat]);

  const refreshUnreadNotifications = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!canTrackBroadcastUnread) {
        clearUnreadBroadcasts();
        return;
      }

      if (!force && !shouldRefreshBroadcastUnread(unreadBroadcastsLastFetchedAt)) {
        return;
      }

      try {
        const unreadResponse: unknown = await broadcastsApi.getUnreadCount();
        const root = asRecord(unreadResponse);
        const data = asRecord(root.data);
        const unread =
          toFiniteNumber(
            data.unread_count,
            data.total_unread,
            data.total,
            root.unread_count,
            root.total_unread,
            root.total,
          ) ?? 0;

        setUnreadBroadcasts(Math.max(0, unread));
      } catch {
        // Keep existing cached value on transient failures.
      }
    },
    [canTrackBroadcastUnread, clearUnreadBroadcasts, setUnreadBroadcasts, unreadBroadcastsLastFetchedAt],
  );

  const fetchBroadcastAlerts = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (
        !force &&
        broadcastAlertsFetchedAt &&
        Date.now() - broadcastAlertsFetchedAt < BROADCAST_ALERTS_STALE_MS
      ) {
        return;
      }

      try {
        const res: unknown = await broadcastsApi.getAll();
        const items: unknown[] = parseItems(res);
        const mapped = items
          .map((item: unknown) => {
            const itemRecord = asRecord(item);
            const message = String(itemRecord.message ?? '');
            return {
              id: String(itemRecord.id ?? ''),
              title: String(itemRecord.title ?? 'Emergency Broadcast'),
              preview: message.length > 90 ? `${message.slice(0, 90)}...` : message,
              createdAt: String(itemRecord.created_at ?? ''),
              isRead: Boolean(itemRecord.is_read ?? false),
            };
          })
          .filter((item) => !!item.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setBroadcastAlerts(mapped.slice(0, 8));
        setBroadcastAlertsFetchedAt(Date.now());
      } catch {
        // Keep existing alert list on transient failures.
      }
    },
    [broadcastAlertsFetchedAt],
  );

  useEffect(() => {
    if (!alertsOpen) {
      return;
    }

    void fetchBroadcastAlerts();
  }, [alertsOpen, fetchBroadcastAlerts]);

  useEffect(() => {
    alertsOpenRef.current = alertsOpen;
  }, [alertsOpen]);

  useEffect(() => {
    refreshUnreadNotificationsRef.current = refreshUnreadNotifications;
  }, [refreshUnreadNotifications]);

  useEffect(() => {
    fetchBroadcastAlertsRef.current = fetchBroadcastAlerts;
  }, [fetchBroadcastAlerts]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void refreshUnreadNotifications();
    void fetchUnreadMessages();

    const handleBroadcastsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<BroadcastsUpdatedDetail>).detail;
      const hasUnreadCount = typeof detail?.unreadCount === 'number' && Number.isFinite(detail.unreadCount);
      const hasIncrementUnread = typeof detail?.incrementUnread === 'number' && Number.isFinite(detail.incrementUnread);
      const hasDecrementUnread = typeof detail?.decrementUnread === 'number' && Number.isFinite(detail.decrementUnread);
      const clearUnreadRequested = Boolean(detail?.clearUnread);

      if (hasUnreadCount) {
        setUnreadBroadcasts(Math.max(0, detail.unreadCount as number));
      }

      if (hasIncrementUnread && (detail?.incrementUnread as number) > 0) {
        incrementUnreadBroadcasts(detail.incrementUnread as number);
      }

      if (hasDecrementUnread && (detail?.decrementUnread as number) > 0) {
        decrementUnreadBroadcasts(detail.decrementUnread as number);
      }

      if (clearUnreadRequested) {
        clearUnreadBroadcasts();
      }

      if (typeof detail?.broadcastId === 'string' && typeof detail?.isRead === 'boolean') {
        setBroadcastAlerts((current) =>
          current.map((alert) =>
            alert.id === detail.broadcastId
              ? { ...alert, isRead: detail.isRead as boolean }
              : alert,
          ),
        );
      }

      const hasDetail = typeof detail !== 'undefined';
      if (detail?.forceRefresh || (!hasDetail && canTrackBroadcastUnread)) {
        void refreshUnreadNotifications({ force: true });
      }

      if (alertsOpen && (detail?.forceRefresh || detail?.listChanged || !detail)) {
        void fetchBroadcastAlerts({ force: true });
      }
    };

    const handleChatUpdated = (event: Event) => {
      if (!canAccessChat) {
        setUnreadMessages(0);
        return;
      }

      const detail = (event as CustomEvent<{ unreadMessages?: number; forceRefresh?: boolean }>).detail;
      const hasUnreadPayload = typeof detail?.unreadMessages === 'number' && Number.isFinite(detail.unreadMessages);
      if (hasUnreadPayload) {
        setUnreadMessages(Math.max(0, detail.unreadMessages as number));
      }

      if (detail?.forceRefresh) {
        void fetchUnreadMessages();
        return;
      }

      if (!hasUnreadPayload) {
        void fetchUnreadMessages();
      }
    };

    const handleWindowFocusOrVisibility = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      void refreshUnreadNotifications();
      if (alertsOpen) {
        void fetchBroadcastAlerts();
      }
      void fetchUnreadMessages();
    };

    window.addEventListener(BROADCASTS_UPDATED_EVENT, handleBroadcastsUpdated);
    window.addEventListener(CHAT_UPDATED_EVENT, handleChatUpdated as EventListener);
    window.addEventListener('focus', handleWindowFocusOrVisibility);
    document.addEventListener('visibilitychange', handleWindowFocusOrVisibility);

    return () => {
      window.removeEventListener(BROADCASTS_UPDATED_EVENT, handleBroadcastsUpdated);
      window.removeEventListener(CHAT_UPDATED_EVENT, handleChatUpdated as EventListener);
      window.removeEventListener('focus', handleWindowFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleWindowFocusOrVisibility);
    };
  }, [
    alertsOpen,
    canAccessChat,
    canTrackBroadcastUnread,
    clearUnreadBroadcasts,
    decrementUnreadBroadcasts,
    fetchBroadcastAlerts,
    fetchUnreadMessages,
    incrementUnreadBroadcasts,
    isAuthenticated,
    refreshUnreadNotifications,
    setUnreadBroadcasts,
  ]);

  useEffect(() => {
    const teardownBroadcastSocket = () => {
      if (broadcastReconnectTimeoutRef.current !== null) {
        window.clearTimeout(broadcastReconnectTimeoutRef.current);
        broadcastReconnectTimeoutRef.current = null;
      }

      if (broadcastStableOpenTimeoutRef.current !== null) {
        window.clearTimeout(broadcastStableOpenTimeoutRef.current);
        broadcastStableOpenTimeoutRef.current = null;
      }

      broadcastReconnectAttemptsRef.current = 0;

      if (broadcastSocketRef.current) {
        broadcastSocketRef.current.close();
        broadcastSocketRef.current = null;
      }
    };

    const shouldConnectBroadcastSocket =
      isAuthenticated && (canAccessEmergencyCenter || canTrackBroadcastUnread);

    if (!shouldConnectBroadcastSocket) {
      teardownBroadcastSocket();
      return () => {
        teardownBroadcastSocket();
      };
    }

    const token = authService.getAccessToken();
    if (!token) {
      teardownBroadcastSocket();
      return () => {
        teardownBroadcastSocket();
      };
    }

    let isDisposed = false;
    const wsUrl = `${getWsBaseUrl()}/ws/broadcasts/?token=${encodeURIComponent(token)}`;

    const connectBroadcastSocket = () => {
      if (isDisposed) {
        return;
      }

      const socket = new WebSocket(wsUrl);
      broadcastSocketRef.current = socket;

      socket.onopen = () => {
        if (broadcastReconnectTimeoutRef.current !== null) {
          window.clearTimeout(broadcastReconnectTimeoutRef.current);
          broadcastReconnectTimeoutRef.current = null;
        }

        if (broadcastStableOpenTimeoutRef.current !== null) {
          window.clearTimeout(broadcastStableOpenTimeoutRef.current);
          broadcastStableOpenTimeoutRef.current = null;
        }

        // Treat short-lived open-close cycles as reconnect failures to avoid infinite flapping loops.
        broadcastStableOpenTimeoutRef.current = window.setTimeout(() => {
          broadcastReconnectAttemptsRef.current = 0;
          broadcastStableOpenTimeoutRef.current = null;
        }, BROADCAST_SOCKET_STABLE_OPEN_RESET_MS);

        void refreshUnreadNotificationsRef.current({ force: true });
        if (alertsOpenRef.current) {
          void fetchBroadcastAlertsRef.current({ force: true });
        }
      };

      socket.onmessage = (event) => {
        let parsed: unknown;

        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        const envelope = asRecord(parsed);
        const eventType = String(envelope.event ?? '').trim();
        const data = asRecord(envelope.data);

        if (eventType === 'unread_count.updated') {
          const unreadCount = toFiniteNumber(
            data.total_unread,
            data.unread_count,
            envelope.total_unread,
            envelope.unread_count,
          );

          if (canTrackBroadcastUnread && unreadCount !== null) {
            setUnreadBroadcasts(Math.max(0, unreadCount));
          }

          if (alertsOpenRef.current) {
            void fetchBroadcastAlertsRef.current({ force: true });
          }
          return;
        }

        if (eventType === 'broadcast.created') {
          const unreadCount = toFiniteNumber(
            data.total_unread,
            data.unread_count,
            envelope.total_unread,
            envelope.unread_count,
          );

          if (canTrackBroadcastUnread) {
            if (unreadCount !== null) {
              setUnreadBroadcasts(Math.max(0, unreadCount));
            } else {
              // Avoid optimistic drift when sender-side create events omit unread totals.
              void refreshUnreadNotificationsRef.current({ force: true });
            }
          }

          if (alertsOpenRef.current) {
            void fetchBroadcastAlertsRef.current({ force: true });
          }
        }
      };

      socket.onclose = (event) => {
        if (isDisposed) {
          return;
        }

        if (broadcastSocketRef.current === socket) {
          broadcastSocketRef.current = null;
        }

        if (broadcastStableOpenTimeoutRef.current !== null) {
          window.clearTimeout(broadcastStableOpenTimeoutRef.current);
          broadcastStableOpenTimeoutRef.current = null;
        }

        if (!shouldRetryBroadcastSocketClose(event.code)) {
          return;
        }

        if (broadcastReconnectAttemptsRef.current >= BROADCAST_SOCKET_MAX_RECONNECT_ATTEMPTS) {
          return;
        }

        broadcastReconnectAttemptsRef.current += 1;
        const reconnectDelay = Math.min(
          BROADCAST_SOCKET_RECONNECT_BASE_DELAY_MS * (2 ** (broadcastReconnectAttemptsRef.current - 1)),
          BROADCAST_SOCKET_RECONNECT_MAX_DELAY_MS,
        );

        if (broadcastReconnectTimeoutRef.current !== null) {
          window.clearTimeout(broadcastReconnectTimeoutRef.current);
          broadcastReconnectTimeoutRef.current = null;
        }

        broadcastReconnectTimeoutRef.current = window.setTimeout(() => {
          if (!isDisposed) {
            connectBroadcastSocket();
          }
        }, reconnectDelay);
      };
    };

    connectBroadcastSocket();

    return () => {
      isDisposed = true;
      teardownBroadcastSocket();
    };
  }, [
    canAccessEmergencyCenter,
    canTrackBroadcastUnread,
    isAuthenticated,
    setUnreadBroadcasts,
  ]);

  const handleAlertClick = async (alertId: string, isRead: boolean) => {
    if (!isRead) {
      try {
        await broadcastsApi.markRead(alertId);
        window.dispatchEvent(
          new CustomEvent<BroadcastsUpdatedDetail>(BROADCASTS_UPDATED_EVENT, {
            detail: {
              decrementUnread: 1,
              broadcastId: alertId,
              isRead: true,
            },
          }),
        );
      } catch {
        // no-op
      }
    }

    setAlertsOpen(false);
    if (!canAccessEmergencyCenter) {
      return;
    }

    navigate('/communication/emergency', { state: { highlightBroadcastId: alertId, openDetails: true } });
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
      <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      
      <div
        className={cn(
          'transition-[padding-left] duration-300 ease-in-out',
          sidebarCollapsed ? 'md:pl-20' : 'md:pl-64',
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex min-w-0 flex-1 items-center pl-12 md:pl-0">
            <div className="min-w-0">
              {title && <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>}
              {subtitle && <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>}
            </div>
          </div>
          
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                className="w-40 sm:w-64 pl-9"
              />
            </div>
            <LanguageToggle />
            <ThemeToggle />
            {canAccessDispatchScanner ? (
              <Button variant="ghost" size="icon" asChild>
                <Link to="/dispatch/scan" aria-label="Open dispatch scanner">
                  <QrCode className="h-5 w-5" />
                </Link>
              </Button>
            ) : null}
            {canAccessChat ? (
              <Button variant="ghost" size="icon" className="relative" asChild>
                <Link to="/messages" aria-label="Open messages">
                  <MessageCircle className="h-5 w-5" />
                  {unreadMessages > 0 && (
                    <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1 text-xs" variant="secondary">
                      {unreadMessages}
                    </Badge>
                  )}
                </Link>
              </Button>
            ) : null}
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
                  {canAccessEmergencyCenter ? (
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => {
                      setAlertsOpen(false);
                      navigate('/communication/emergency');
                    }}>
                      Open Emergency Broadcast Center
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Emergency center access is restricted for your account.</p>
                  )}
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