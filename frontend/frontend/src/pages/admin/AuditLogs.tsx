import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import { auditApi } from '@/services/api';
// ...existing code...

interface AuditLog {
  id: string;
  action: string;
  actor: string;
  actor_name?: string;
  target_model?: string;
  target_id?: string;
  details?: string | Record<string, unknown>;
  ip_address?: string;
  timestamp: string;
  created_at?: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  login: 'bg-purple-100 text-purple-800',
  logout: 'bg-gray-100 text-gray-800',
  approve: 'bg-teal-100 text-teal-800',
  reject: 'bg-orange-100 text-orange-800',
  suspend: 'bg-red-100 text-red-800',
};

function getActionColor(action: string) {
  const key = Object.keys(ACTION_COLORS).find(k => action?.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : 'bg-secondary text-secondary-foreground';
}

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 25;

  const { toast } = useToast();

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      };
      if (actionFilter !== 'all') params.action = actionFilter;
      if (search.trim()) params.search = search.trim();

      const res = await auditApi.getAll(params);
      const raw = (res as unknown)?.data ?? res;
      const items: AuditLog[] = raw?.results ?? (Array.isArray(raw) ? raw : []);
      setLogs(items);
      setTotalCount(raw?.count ?? items.length);
    } catch {
      toast({ title: 'Error', description: 'Failed to load audit logs', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatDetails = (details: AuditLog['details']) => {
    if (!details) return '—';
    if (typeof details === 'string') return details;
    return JSON.stringify(details, null, 0).substring(0, 80) + (JSON.stringify(details).length > 80 ? '…' : '');
  };

  return (
    <AppLayout title="Audit Logs" subtitle="Platform security and activity history">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Activity Logs
            </CardTitle>
            <CardDescription>All actions performed on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search by actor, model..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                    <SelectItem value="suspend">Suspend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={loadLogs} variant="outline" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
                  <p>No audit logs found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp ?? log.created_at ?? '').toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {log.actor_name ?? log.actor ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={getActionColor(log.action)}>
                            {log.action ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.target_model ? (
                            <span className="text-sm">
                              {log.target_model}
                              {log.target_id && (
                                <span className="text-muted-foreground ml-1 font-mono text-xs">
                                  #{String(log.target_id).substring(0, 8)}
                                </span>
                              )}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground max-w-xs truncate block">
                            {formatDetails(log.details)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">
                            {log.ip_address ?? '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AuditLogs;
