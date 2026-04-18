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

interface AuditLogApiItem {
  id: string;
  event_type?: string;
  action?: string;
  actor?: string | null;
  actor_name?: string;
  actor_email?: string | null;
  hospital_name?: string | null;
  object_type?: string | null;
  object_id?: string | null;
  metadata?: unknown;
  created_at?: string;

  // Legacy keys kept for compatibility with older payload shapes.
  target_model?: string;
  target_id?: string;
  details?: string | Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  timestamp?: string;
}

interface AuditLogRow {
  id: string;
  timestamp: string;
  actorLabel: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | Record<string, unknown> | null;
  ipAddress: string;
}

interface AuditLogEnvelope {
  data?: unknown;
  results?: unknown;
  count?: number;
  meta?: {
    total?: number;
    page?: number;
    total_pages?: number;
  };
}

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-blue-100 text-blue-800',
  logout: 'bg-gray-100 text-gray-800',
  offboarding: 'bg-amber-100 text-amber-800',
  request: 'bg-emerald-100 text-emerald-800',
  shipment: 'bg-cyan-100 text-cyan-800',
  hospital: 'bg-indigo-100 text-indigo-800',
  inventory: 'bg-lime-100 text-lime-800',
  role: 'bg-violet-100 text-violet-800',
  staff: 'bg-sky-100 text-sky-800',
  broadcast: 'bg-rose-100 text-rose-800',
  password: 'bg-orange-100 text-orange-800',
  suspend: 'bg-red-100 text-red-800',
};

function getActionColor(action: string) {
  const key = Object.keys(ACTION_COLORS).find(k => action?.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : 'bg-secondary text-secondary-foreground';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toReadableAction(value: string) {
  if (!value) return '—';
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function extractAuditItems(payload: unknown): AuditLogApiItem[] {
  if (Array.isArray(payload)) return payload as AuditLogApiItem[];
  if (!isRecord(payload)) return [];

  const rootData = payload.data;
  if (Array.isArray(rootData)) return rootData as AuditLogApiItem[];

  if (isRecord(rootData) && Array.isArray(rootData.results)) {
    return rootData.results as AuditLogApiItem[];
  }

  if (Array.isArray(payload.results)) return payload.results as AuditLogApiItem[];
  return [];
}

function extractTotalCount(payload: unknown, fallback: number) {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.count === 'number') return payload.count;

  if (isRecord(payload.meta) && typeof payload.meta.total === 'number') {
    return payload.meta.total;
  }

  const rootData = payload.data;
  if (isRecord(rootData) && typeof rootData.count === 'number') {
    return rootData.count;
  }

  if (isRecord(rootData?.meta) && typeof rootData.meta.total === 'number') {
    return rootData.meta.total;
  }

  return fallback;
}

function normalizeAuditLog(item: AuditLogApiItem): AuditLogRow {
  const action = item.event_type ?? item.action ?? '';
  const actorId = item.actor ?? '';
  const actorLabel = item.actor_email ?? item.actor_name ?? actorId ?? '—';
  const targetType = item.object_type ?? item.target_model ?? '';
  const targetId = item.object_id ?? item.target_id ?? '';
  const details = item.metadata ?? item.details ?? null;

  return {
    id: item.id,
    timestamp: item.created_at ?? item.timestamp ?? '',
    actorLabel: actorLabel || '—',
    actorId,
    action,
    targetType,
    targetId,
    details: typeof details === 'string' || isRecord(details) ? details : null,
    ipAddress: item.ip_address ?? '',
  };
}

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
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
        page: String(page),
      };

      const searchTerms = [search.trim()];
      if (actionFilter !== 'all') {
        searchTerms.push(actionFilter);
      }
      const combinedSearch = searchTerms.filter(Boolean).join(' ').trim();
      if (combinedSearch) params.search = combinedSearch;

      const res = await auditApi.getAll(params);
      const raw = (res as AuditLogEnvelope) ?? {};
      const items = extractAuditItems(raw).map(normalizeAuditLog);

      setLogs(items);
      setTotalCount(extractTotalCount(raw, items.length));
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

  const formatDetails = (details: AuditLogRow['details']) => {
    if (!details) return '—';
    if (typeof details === 'string') return details;

    const summary = details.message ?? details.detail ?? details.description;
    if (typeof summary === 'string' && summary.trim()) {
      return summary;
    }

    const serialized = JSON.stringify(details, null, 0);
    return serialized.substring(0, 80) + (serialized.length > 80 ? '…' : '');
  };

  return (
    <AppLayout title="Audit Logs"
      // subtitle="Platform security and activity history"
    >
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
                  placeholder="Search by actor, event, target..."
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
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="logout">Logout</SelectItem>
                    <SelectItem value="hospital_offboarding_requested">Offboarding Requested</SelectItem>
                    <SelectItem value="hospital_offboarding_approved">Offboarding Approved</SelectItem>
                    <SelectItem value="hospital_offboarding_rejected">Offboarding Rejected</SelectItem>
                    <SelectItem value="request_created">Request Created</SelectItem>
                    <SelectItem value="request_approved">Request Approved</SelectItem>
                    <SelectItem value="request_rejected">Request Rejected</SelectItem>
                    <SelectItem value="shipment_created">Shipment Created</SelectItem>
                    <SelectItem value="shipment_status_updated">Shipment Status Updated</SelectItem>
                    <SelectItem value="inventory_adjusted">Inventory Adjusted</SelectItem>
                    <SelectItem value="broadcast_sent">Broadcast Sent</SelectItem>
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
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="text-sm font-medium block">{log.actorLabel}</span>
                            {log.actorId && log.actorId !== log.actorLabel && (
                              <span className="text-xs font-mono text-muted-foreground">
                                {log.actorId.slice(0, 8)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getActionColor(log.action)}>
                            {toReadableAction(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.targetType ? (
                            <span className="text-sm">
                              {log.targetType}
                              {log.targetId && (
                                <span className="text-muted-foreground ml-1 font-mono text-xs">
                                  #{String(log.targetId).substring(0, 8)}
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
                            {log.ipAddress || '—'}
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
