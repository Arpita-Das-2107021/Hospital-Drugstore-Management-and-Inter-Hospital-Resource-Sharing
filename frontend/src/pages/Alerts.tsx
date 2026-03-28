import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockAlerts } from '@/data/mockData';
import { AlertTriangle, Clock, Zap, RefreshCcw, Check } from 'lucide-react';
import { useState } from 'react';

const Alerts = () => {
  const [alerts, setAlerts] = useState(mockAlerts);

  const markAsRead = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, isRead: true } : a));
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
    <AppLayout title="Alerts & Notifications" subtitle="System alerts and warnings">
      <Tabs defaultValue="all">
        <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="critical">Critical</TabsTrigger><TabsTrigger value="warning">Warnings</TabsTrigger><TabsTrigger value="info">Info</TabsTrigger></TabsList>
        <TabsContent value="all" className="mt-6 space-y-3">
          {alerts.map(alert => (
            <Card key={alert.id} className={`${getSeverityColor(alert.severity)} ${alert.isRead ? 'opacity-60' : ''}`}>
              <CardContent className="flex items-start gap-4 p-4">
                <div className={getSeverityColor(alert.severity).split(' ')[2]}>{getIcon(alert.type)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2"><h4 className="font-medium">{alert.title}</h4><Badge variant="outline" className="capitalize">{alert.type}</Badge></div>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.hospital} • {new Date(alert.createdAt).toLocaleString()}</p>
                </div>
                {!alert.isRead && <Button size="sm" variant="ghost" onClick={() => markAsRead(alert.id)}><Check className="h-4 w-4" /></Button>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Alerts;