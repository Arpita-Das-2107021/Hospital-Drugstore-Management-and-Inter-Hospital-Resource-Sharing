import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Building2,
  Clock3,
  Loader2,
  RefreshCw,
  UserCheck,
  UserMinus,
  Users,
  UserX,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import { analyticsApi, type PlatformSummaryAnalytics } from '@/services/api';

type PlatformMetricKey = keyof Omit<PlatformSummaryAnalytics, 'generated_at'>;

const METRIC_ROWS: Array<{ key: PlatformMetricKey; label: string; helper: string }> = [
  {
    key: 'healthcare_registered_count',
    label: 'Healthcare Registered',
    helper: 'Total registered healthcare facilities in the platform.',
  },
  {
    key: 'healthcare_pending_count',
    label: 'Healthcare Pending',
    helper: 'Healthcare facilities currently pending registration completion.',
  },
  {
    key: 'healthcare_verified_count',
    label: 'Healthcare Verified',
    helper: 'Healthcare facilities with completed verification.',
  },
  {
    key: 'healthcare_pending_verification_count',
    label: 'Pending Verification',
    helper: 'Healthcare facilities waiting for verification review.',
  },
  {
    key: 'pending_registration_requests_count',
    label: 'Pending Registration Requests',
    helper: 'Open registration requests awaiting platform action.',
  },
  {
    key: 'staff_system_count',
    label: 'System Staff',
    helper: 'Staff users currently registered in the platform.',
  },
  {
    key: 'healthcare_admin_count',
    label: 'Healthcare Admins',
    helper: 'Healthcare admin users across facilities.',
  },
  {
    key: 'ml_count',
    label: 'ML Users',
    helper: 'Users in ML-focused roles.',
  },
  {
    key: 'others_count',
    label: 'Other Users',
    helper: 'Users not grouped into healthcare admin or ML categories.',
  },
  {
    key: 'total_users_count',
    label: 'Total Users',
    helper: 'All users registered in the platform.',
  },
  {
    key: 'active_users_count',
    label: 'Active Users',
    helper: 'Users currently marked as active.',
  },
  {
    key: 'inactive_users_count',
    label: 'Inactive Users',
    helper: 'Users currently marked as inactive.',
  },
  {
    key: 'pending_staff_invitations_count',
    label: 'Pending Staff Invitations',
    helper: 'Outstanding staff invitations awaiting acceptance.',
  },
];

const formatTimestamp = (value: string): string => {
  if (!value.trim()) {
    return 'Not available';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const AdminAnalytics = () => {
  const [data, setData] = useState<PlatformSummaryAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const summary = await analyticsApi.getPlatformSummary();
      setData(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load analytics data.';
      setErrorMessage(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading) {
    return (
      <AppLayout title="Platform Analytics">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading analytics...</span>
        </div>
      </AppLayout>
    );
  }

  if (errorMessage) {
    return (
      <AppLayout title="Platform Analytics">
        <Card className="border-destructive/40">
          <CardContent className="py-10">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button variant="outline" onClick={loadAnalytics}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout title="Platform Analytics">
        <Card>
          <CardContent className="py-10">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 opacity-60" />
              <p>No platform analytics data is currently available.</p>
              <Button variant="outline" onClick={loadAnalytics}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const registrationCards = [
    {
      title: 'Healthcare Registered',
      value: data.healthcare_registered_count,
      helper: `${data.healthcare_pending_count.toLocaleString()} pending registration`,
      icon: Building2,
    },
    {
      title: 'Healthcare Verified',
      value: data.healthcare_verified_count,
      helper: `${data.healthcare_pending_verification_count.toLocaleString()} pending verification`,
      icon: UserCheck,
    },
    {
      title: 'Pending Registration Requests',
      value: data.pending_registration_requests_count,
      helper: 'Awaiting review workflow completion',
      icon: Clock3,
    },
    {
      title: 'Total Users',
      value: data.total_users_count,
      helper: `${data.active_users_count.toLocaleString()} active / ${data.inactive_users_count.toLocaleString()} inactive`,
      icon: Users,
    },
  ];

  return (
    <AppLayout title="Platform Analytics"
      // subtitle="Platform-wide statistics and insights"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Platform analytics sourced from /api/v1/analytics/platform-summary/</p>
            <p className="text-xs text-muted-foreground">Last updated: {formatTimestamp(data.generated_at)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {registrationCards.map((item) => (
            <Card key={item.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{item.value.toLocaleString()}</div>
                <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Activity Snapshot</CardTitle>
            <CardDescription>Current active versus inactive account distribution.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserCheck className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">Active Users</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{data.active_users_count.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserMinus className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">Inactive Users</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{data.inactive_users_count.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserX className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">Pending Staff Invitations</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{data.pending_staff_invitations_count.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Platform Summary Metrics</CardTitle>
            <CardDescription>Direct mapping of every field returned by the platform summary API.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {METRIC_ROWS.map((metric) => (
                <div key={metric.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{metric.label}</p>
                    <p className="text-xs text-muted-foreground">{metric.helper}</p>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {data[metric.key].toLocaleString()}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminAnalytics;
