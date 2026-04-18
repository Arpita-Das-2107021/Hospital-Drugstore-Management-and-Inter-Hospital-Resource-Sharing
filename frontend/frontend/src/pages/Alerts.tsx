import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, Zap, RefreshCcw, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { notificationsApi } from '@/services/api';
import { NOTIFICATIONS_UPDATED_EVENT } from '@/constants/events';

interface Alert {
  id: string;
  title: string;
  message: string;
  type: string;
  severity: string;
  isRead: boolean;
  hospital: string;
  createdAt: string;
}

const Alerts = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationsApi.getAll();
      const items = (data as unknown)?.data ?? (data as unknown)?.results ?? [];
      const mapped: Alert[] = (Array.isArray(items) ? items : []).map((n: unknown) => ({
        id: n.id,
        title: n.data?.title || n.title || n.notification_type || 'Notification',
        message: n.message || n.data?.message || '',
        type: n.notification_type || n.type || 'info',
        severity: n.priority || n.data?.priority || n.severity || 'info',
        isRead: n.is_read ?? false,
        hospital: n.hospital_name || n.data?.hospital || n.hospital || '',
        createdAt: n.created_at,
      }));
      setAlerts(mapped);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const openAlert = async (alert: Alert) => {
    if (!alert.isRead) {
      await markAsRead(alert.id);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'shortage': return <AlertTriangle className="h-5 w-5" />;
      case 'expiry': return <Clock className="h-5 w-5" />;
      case 'emergency': return <Zap className="h-5 w-5" />;
      default: return <RefreshCcw className="h-5 w-5" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-destructive bg-destructive/5 text-destructive';
      case 'warning': return 'border-warning bg-warning/5 text-warning';
      default: return 'border-info bg-info/5 text-info';
    }
  };

  return (
    <AppLayout title="Alerts & Notifications"
      // subtitle="System alerts and warnings"
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <Tabs defaultValue="all">
        <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="critical">Critical</TabsTrigger><TabsTrigger value="warning">Warnings</TabsTrigger><TabsTrigger value="info">Info</TabsTrigger></TabsList>
        <TabsContent value="all" className="mt-6 space-y-3">
          {alerts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No notifications</p>
          ) : alerts.map(alert => (
            <Card
              key={alert.id}
              className={`${getSeverityColor(alert.severity)} ${alert.isRead ? 'opacity-60' : ''}`}
              onClick={() => openAlert(alert)}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div className={getSeverityColor(alert.severity).split(' ')[2]}>{getIcon(alert.type)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2"><h4 className="font-medium">{alert.title}</h4><Badge variant="outline" className="capitalize">{alert.type}</Badge></div>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.hospital} • {new Date(alert.createdAt).toLocaleString()}</p>
                </div>
                {!alert.isRead && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      markAsRead(alert.id);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
      )}
    </AppLayout>
  );
};

export default Alerts;
