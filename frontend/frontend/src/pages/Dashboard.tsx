import AppLayout from '@/components/layout/AppLayout';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  RefreshCcw,
  TrendingUp,
  Siren,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuth } from '@/contexts/AuthContext';
import HospitalLogo from '@/components/HospitalLogo';

const Dashboard = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: dashboardData, loading, error, refetch } = useDashboardData();

  if (loading) {
    return (
      <AppLayout title={t('nav.dashboard')}
        // subtitle={t('dashboard.overview')}
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading dashboard...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title={t('nav.dashboard')}
        // subtitle={t('dashboard.overview')}
      >
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
      <AppLayout title={t('nav.dashboard')}
        // subtitle={t('dashboard.overview')}
      >
        <div className="text-center">No dashboard data available</div>
      </AppLayout>
    );
  }

  const { statistics, hospital, critical_inventory } = dashboardData;
  const username = user?.full_name || user?.email?.split('@')[0] || 'Clinician';

  return (
    <AppLayout title={t('nav.dashboard')}>
    {/* <AppLayout title={t('nav.dashboard')} subtitle={`${hospital.name} - ${t('dashboard.overview')}`}> */}
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-chart-2/20 px-6 py-7 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-24 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-chart-1/20 blur-3xl" />

          <div className="relative flex flex-col gap-6">
            <div className="flex items-start gap-4 sm:gap-5">
              <HospitalLogo
                name={hospital.name}
                logo={hospital.logo}
                className="h-16 w-16"
                fallbackClassName="bg-primary/20 text-primary"
              />

              <div className="space-y-1">
                {/* <p className="text-sm font-medium text-muted-foreground">Welcome, {username}</p> */}
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {username}</h2>
                <p className="text-base font-semibold text-primary">{hospital.name}</p>
                <p className="text-xs text-muted-foreground">{hospital.city}, {hospital.region}</p>
                <p className="text-sm text-muted-foreground">{statistics.total_staff} Staff · {statistics.total_resources} Resources</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/sharing/requests/incoming" className="group">
            <article className="flex items-center justify-between rounded-full border border-primary/20 bg-primary/5 px-5 py-4 transition-all group-hover:border-primary/40 group-hover:bg-primary/10">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Incoming Requests</p>
                <p className="text-2xl font-semibold leading-tight">{statistics.incoming_requests}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                <RefreshCcw className="h-4 w-4" />
              </span>
            </article>
          </Link>

          <Link to="/sharing/requests/outgoing" className="group">
            <article className="flex items-center justify-between rounded-full border border-chart-2/30 bg-chart-2/10 px-5 py-4 transition-all group-hover:border-chart-2/50 group-hover:bg-chart-2/20">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Outgoing Requests</p>
                <p className="text-2xl font-semibold leading-tight">{statistics.outgoing_requests}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chart-2/20 text-chart-2">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </article>
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <Link to="/inventory/forecasting" className="group">
            <article className="h-full rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 transition-all group-hover:border-primary/60 group-hover:shadow-lg group-hover:shadow-primary/10">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Forecasting</p>
                  <h3 className="text-xl font-semibold">Check Forecast</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Open demand projections and plan procurement decisions from your existing forecasting page.
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <TrendingUp className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-5 flex items-center text-sm font-medium text-primary">
                Open Forecast
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </div>
            </article>
          </Link>

          <Link to="/inventory/outbreak-prediction" className="group">
            <article className="h-full rounded-3xl border border-chart-2/40 bg-gradient-to-br from-chart-2/20 via-background to-background p-6 transition-all group-hover:border-chart-2/70 group-hover:shadow-lg group-hover:shadow-chart-2/10">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Outbreak Monitoring</p>
                  <h3 className="text-xl font-semibold">Check Outbreak</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Review current outbreak signals and response recommendations from your existing outbreak view.
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-chart-2/20 text-chart-2">
                  <Siren className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-5 flex items-center text-sm font-medium text-chart-2">
                Open Outbreak
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </div>
            </article>
          </Link>
        </section>

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
      </div>
    </AppLayout>
  );
};

export default Dashboard;
