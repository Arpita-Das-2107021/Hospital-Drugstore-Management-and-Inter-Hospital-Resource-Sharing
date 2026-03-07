import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PermissionMatrix } from '@/components/admin/PermissionMatrix';
import { useRolePermissions, useAuditLogs } from '@/hooks/useRolePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, History, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const RoleManagement = () => {
  const { user } = useAuth();
  const { permissions, loading: permissionsLoading, error: permissionsError, refetch: refetchPermissions } = useRolePermissions();
  const { auditLogs, loading: auditLoading, error: auditError, refetch: refetchAuditLogs } = useAuditLogs(user?.hospital_id);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'default';
      case 'update': return 'secondary';
      case 'delete': return 'destructive';
      case 'approve': return 'default';
      default: return 'outline';
    }
  };

  return (
    <AppLayout title="Role & Policy Management" subtitle="Configure permissions and view audit logs">
      <Tabs defaultValue="permissions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="permissions" className="gap-2">
            <Shield className="h-4 w-4" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="h-4 w-4" />
            Audit Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          {permissionsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading permissions...</span>
            </div>
          ) : permissionsError ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-medium mb-2">Failed to load permissions</h3>
                <p className="text-muted-foreground mb-4">{permissionsError}</p>
                <Button onClick={refetchPermissions}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : (
            <PermissionMatrix permissions={permissions} />
          )}
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Audit Logs</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {user?.hospital_name ? `Showing logs for ${user.hospital_name}` : 'System-wide audit logs'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refetchAuditLogs}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading audit logs...</span>
                </div>
              ) : auditError ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                  <p className="text-sm text-muted-foreground">{auditError}</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No audit logs found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead className="hidden md:table-cell">Details</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.slice(0, 20).map(log => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action_type)}>
                            {log.action_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{log.user_name || 'System'}</div>
                            <div className="text-sm text-muted-foreground">{log.hospital_name}</div>
                          </div>
                        </TableCell>
                        <TableCell>{log.resource_name || log.action}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {log.details}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatDate(log.timestamp)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};
export default RoleManagement;