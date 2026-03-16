import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, TrendingUp, Building2, Users, Package, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import { analyticsApi } from '@/services/api';
// ...existing code...

const AdminAnalytics = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await analyticsApi.get();
      setData((res as any)?.data ?? res);
    } catch {
      toast({ title: 'Error', description: 'Failed to load analytics data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

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

  const hospitals = data?.hospitals ?? {};
  const resources = data?.resources ?? {};
  const requests = data?.requests ?? {};
  const users = data?.users ?? {};
  const credits = data?.credits ?? {};

  return (
    <AppLayout title="Platform Analytics" subtitle="Platform-wide statistics and insights">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Real-time platform metrics</p>
          <Button variant="outline" size="sm" onClick={loadAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hospitals</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hospitals.total ?? '—'}</div>
              {hospitals.active != null && (
                <p className="text-xs text-muted-foreground mt-1">{hospitals.active} active</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.total ?? '—'}</div>
              {users.active != null && (
                <p className="text-xs text-muted-foreground mt-1">{users.active} active</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{requests.total ?? '—'}</div>
              {requests.pending != null && (
                <p className="text-xs text-muted-foreground mt-1">{requests.pending} pending</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Credits</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {credits.total_issued != null ? credits.total_issued.toLocaleString() : '—'}
              </div>
              {credits.total_outstanding != null && (
                <p className="text-xs text-muted-foreground mt-1">{credits.total_outstanding.toLocaleString()} outstanding</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Hospitals Breakdown */}
        {hospitals && Object.keys(hospitals).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Hospital Overview</CardTitle>
              <CardDescription>Registered hospitals by verification status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: 'Verified', value: hospitals.verified, color: 'bg-green-100 text-green-800' },
                  { label: 'Pending Verification', value: hospitals.pending, color: 'bg-yellow-100 text-yellow-800' },
                  { label: 'Suspended', value: hospitals.suspended, color: 'bg-red-100 text-red-800' },
                ].map(({ label, value, color }) => (
                  value != null && (
                    <div key={label} className="flex items-center justify-between p-3 border rounded-md">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <Badge className={color}>{value}</Badge>
                    </div>
                  )
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Requests Breakdown */}
        {requests && Object.keys(requests).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Resource Requests</CardTitle>
              <CardDescription>Request activity across the platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                {[
                  { label: 'Total', value: requests.total },
                  { label: 'Pending', value: requests.pending },
                  { label: 'Approved', value: requests.approved },
                  { label: 'Fulfilled', value: requests.fulfilled },
                  { label: 'Rejected', value: requests.rejected },
                ].map(({ label, value }) => (
                  value != null && (
                    <div key={label} className="text-center p-3 border rounded-md">
                      <div className="text-2xl font-bold">{value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{label}</div>
                    </div>
                  )
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Raw data fallback for additional fields */}
        {data && Object.keys(data).filter(k => !['hospitals', 'resources', 'requests', 'users', 'credits'].includes(k)).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Additional Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {Object.entries(data)
                  .filter(([k]) => !['hospitals', 'resources', 'requests', 'users', 'credits'].includes(k))
                  .map(([key, value]) => (
                    typeof value === 'number' || typeof value === 'string' ? (
                      <div key={key} className="flex items-center justify-between p-3 border rounded-md">
                        <span className="text-sm text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ) : null
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!data && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground py-12">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No analytics data available</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminAnalytics;
