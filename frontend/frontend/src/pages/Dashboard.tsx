import AppLayout from '@/components/layout/AppLayout';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Package,
  RefreshCcw,
  Clock,
  ArrowRight,
  Activity,
  Users,
  Loader2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Link } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuth } from '@/contexts/AuthContext';
import { analyticsApi } from '@/services/api';
import { useState, useEffect } from 'react';
import HospitalLogo from '@/components/HospitalLogo';

const KPICard = ({ 
  title, 
  value, 
  unit, 
  trend, 
  trendLabel,
  icon: Icon,
  variant = 'default'
}: { 
  title: string; 
  value: number | string; 
  unit?: string;
  trend: number; 
  trendLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'warning' | 'success' | 'critical';
}) => {
  const isPositive = trend > 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  
  const variantStyles = {
    default: 'bg-card',
    warning: 'bg-warning/5 border-warning/20',
    success: 'bg-success/5 border-success/20',
    critical: 'bg-critical/5 border-critical/20',
  };

  return (
    <Card className={variantStyles[variant]}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">{value}</span>
              {unit && <span className="text-lg text-muted-foreground">{unit}</span>}
            </div>
            <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-destructive' : 'text-success'}`}>
              <TrendIcon className="h-4 w-4" />
              <span>{Math.abs(trend)}% {trendLabel}</span>
            </div>
          </div>
          <div className="rounded-lg bg-primary/10 p-3">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: dashboardData, loading, error, refetch } = useDashboardData();
  const [trendData, setTrendData] = useState<any[]>([]);

  useEffect(() => {
    analyticsApi.get()
      .then((res: any) => {
        const weekly = res?.data?.weekly_trends || res?.weekly_trends || [];
        setTrendData(weekly);
      })
      .catch(() => {}); // Non-admin users may not have access
  }, []);

  if (loading) {
    return (
      <AppLayout title={t('nav.dashboard')} subtitle={t('dashboard.overview')}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading dashboard...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title={t('nav.dashboard')} subtitle={t('dashboard.overview')}>
        <div className="flex flex-col items-center justify-center h-64">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium mb-2">Failed to load dashboard data</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={refetch}>Try Again</Button>
        </div>
      </AppLayout>
    );
  }

  if (!dashboardData) {
    return (
      <AppLayout title={t('nav.dashboard')} subtitle={t('dashboard.overview')}>
        <div className="text-center">No dashboard data available</div>
      </AppLayout>
    );
  }

  const { statistics, hospital, recent_alerts, critical_inventory } = dashboardData;
  const criticalAlerts = recent_alerts.filter(alert => alert.severity === 'critical');
  const trustLevel = (hospital.trust_level || 'medium').toLowerCase();
  const trustLabel = trustLevel.charAt(0).toUpperCase() + trustLevel.slice(1);
  const resourceRatio = statistics.total_resources > 0
    ? statistics.available_resources / statistics.total_resources
    : 0;

  return (
    <AppLayout title={t('nav.dashboard')} subtitle={`${hospital.name} - ${t('dashboard.overview')}`}>
      <div className="space-y-6">
        {/* Hospital Info Banner */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <HospitalLogo
                  name={hospital.name}
                  logo={hospital.logo}
                  className="h-14 w-14"
                  fallbackClassName="bg-primary/15 text-primary"
                />
                <div>
                  <h2 className="text-2xl font-bold text-primary">{hospital.name}</h2>
                  <p className="text-muted-foreground">{hospital.city}, {hospital.region}</p>
                  <div className="mt-2 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{statistics.total_staff} Staff</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      <span>{statistics.total_resources} Resources</span>
                    </div>
                  </div>
                </div>
              </div>
              <Badge variant={trustLevel === 'high' ? 'default' : trustLevel === 'medium' ? 'secondary' : 'outline'}>
                {trustLabel} Trust
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Available Resources"
            value={statistics.available_resources}
            unit={`of ${statistics.total_resources}`}
            trend={0} // We don't have trend data yet
            trendLabel=""
            icon={Package}
            variant={resourceRatio > 0.8 ? 'success' : 'warning'}
          />
          <KPICard
            title="Critical Inventory"
            value={critical_inventory.length}
            unit="items"
            trend={0}
            trendLabel="need attention"
            icon={AlertTriangle}
            variant={critical_inventory.length > 0 ? 'critical' : 'success'}
          />
          <KPICard
            title="Pending Requests"
            value={statistics.incoming_requests}
            unit="incoming"
            trend={0}
            trendLabel=""
            icon={RefreshCcw}
            variant={statistics.incoming_requests > 0 ? 'warning' : 'default'}
          />
          <KPICard
            title="Unread Alerts"
            value={statistics.unread_alerts}
            trend={0}
            trendLabel="notifications"
            icon={Activity}
            variant={statistics.unread_alerts > 0 ? 'warning' : 'success'}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Trend Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Weekly Trends</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/reports">View Reports <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="requests" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-1))' }}
                      name="Requests"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="transfers" 
                      stroke="hsl(var(--chart-2))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-2))' }}
                      name="Transfers"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="stockOuts" 
                      stroke="hsl(var(--chart-3))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-3))' }}
                      name="Stock Outs"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Critical Alerts Panel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">
                {recent_alerts.length > 0 ? 'Recent Alerts' : 'No Active Alerts'}
              </CardTitle>
              {recent_alerts.length > 0 && (
                <Badge variant={criticalAlerts.length > 0 ? 'destructive' : 'default'}>
                  {recent_alerts.length}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {recent_alerts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">All systems running smoothly</p>
                </div>
              ) : (
                <>
                  {recent_alerts.slice(0, 4).map((alert) => (
                    <div 
                      key={alert.id} 
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        alert.severity === 'critical' 
                          ? 'border-destructive/20 bg-destructive/5' 
                          : alert.severity === 'warning'
                          ? 'border-warning/20 bg-warning/5'
                          : 'border-info/20 bg-info/5'
                      }`}
                    >
                      <AlertTriangle 
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          alert.severity === 'critical' ? 'text-destructive' :
                          alert.severity === 'warning' ? 'text-warning' : 'text-info'
                        }`} 
                      />
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium leading-tight">{alert.title}</p>
                          <Badge variant="outline" className="text-xs">
                            {alert.alert_type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(alert.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full" size="sm" asChild>
                    <Link to="/communication/emergency">View Emergency Broadcasts</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Critical Inventory Section */}
        {critical_inventory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Critical Inventory Items ({critical_inventory.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {critical_inventory.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.category}</p>
                      <p className="text-sm text-destructive">
                        Stock: {item.current_stock} (Min: {item.reorder_level})
                      </p>
                    </div>
                    <Badge variant="destructive">Critical</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button asChild>
                  <Link to="/inventory">Manage Inventory</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/inventory">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-chart-1/10 p-3">
                  <Package className="h-6 w-6 text-chart-1" />
                </div>
                <div>
                  <p className="font-medium">Manage Inventory</p>
                  <p className="text-sm text-muted-foreground">
                    {statistics.total_resources} resources
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/sharing/requests">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-chart-2/10 p-3">
                  <RefreshCcw className="h-6 w-6 text-chart-2" />
                </div>
                <div>
                  <p className="font-medium">Resource Requests</p>
                  <p className="text-sm text-muted-foreground">
                    {statistics.incoming_requests} pending approvals
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/inventory/forecast">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-chart-4/10 p-3">
                  <Activity className="h-6 w-6 text-chart-4" />
                </div>
                <div>
                  <p className="font-medium">Demand Forecast</p>
                  <p className="text-sm text-muted-foreground">AI predictions</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/reports">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-chart-5/10 p-3">
                  <TrendingUp className="h-6 w-6 text-chart-5" />
                </div>
                <div>
                  <p className="font-medium">Generate Reports</p>
                  <p className="text-sm text-muted-foreground">Analytics & KPIs</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;