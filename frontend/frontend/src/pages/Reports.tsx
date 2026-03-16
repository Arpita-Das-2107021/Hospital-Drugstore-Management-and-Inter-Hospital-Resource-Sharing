import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Calendar, FileDown, Loader2, Printer, RefreshCw } from 'lucide-react';
import { analyticsApi, creditsApi, inventoryApi, requestsApi, shipmentsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

type ReportType = 'inventory' | 'shipments' | 'incoming_requests' | 'outgoing_requests' | 'credits' | 'analytics';

const Reports = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role?.toUpperCase() ?? '';
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const availableReports: { value: ReportType; label: string }[] = useMemo(() => {
    const base: { value: ReportType; label: string }[] = [
      { value: 'inventory', label: 'Inventory Report' },
      { value: 'shipments', label: 'Transport Report' },
      { value: 'incoming_requests', label: 'Incoming Requests Report' },
      { value: 'outgoing_requests', label: 'Outgoing Requests Report' },
    ];
    if (isSuperAdmin) {
      base.push({ value: 'credits', label: 'Credit Ledger Report' });
      base.push({ value: 'analytics', label: 'Platform Analytics Report' });
    }
    return base;
  }, [isSuperAdmin]);

  const [reportType, setReportType] = useState<ReportType>(isSuperAdmin ? 'analytics' : 'inventory');
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      if (reportType === 'inventory') {
        const res = await inventoryApi.getAll();
        const raw = (res as any)?.data?.results ?? (res as any)?.data ?? (res as any)?.results ?? (Array.isArray(res) ? res : []);
        setRows((Array.isArray(raw) ? raw : []).map((item: any) => ({
          name: item.catalog_item_name ?? item.name ?? item.resource_name ?? 'Unknown',
          category: item.resource_type_name ?? item.category ?? 'General',
          available: item.quantity_available ?? item.available_quantity ?? 0,
          reorder_level: item.reorder_level ?? 0,
          total_value: item.total_value ?? ((item.quantity_available ?? 0) * (item.unit_price ?? 0)),
        })));
      }

      if (reportType === 'shipments') {
        const res = await shipmentsApi.getAll();
        const raw = (res as any)?.data?.results ?? (res as any)?.data ?? (res as any)?.results ?? (Array.isArray(res) ? res : []);
        setRows((Array.isArray(raw) ? raw : []).map((s: any) => ({
          shipment: s.shipment_number ?? s.id,
          from: s.origin_hospital_name ?? s.from_hospital_name ?? '-',
          to: s.destination_hospital_name ?? s.to_hospital_name ?? '-',
          status: s.status ?? '-',
          updated_at: s.updated_at ?? s.created_at ?? '-',
        })));
      }

      if (reportType === 'incoming_requests' || reportType === 'outgoing_requests') {
        const res = await requestsApi.getAll();
        const raw = (res as any)?.data?.results ?? (res as any)?.data ?? (res as any)?.results ?? (Array.isArray(res) ? res : []);
        const hospitalId = user?.hospital_id || '';
        const filtered = (Array.isArray(raw) ? raw : []).filter((request: any) => {
          if (!hospitalId) return true;
          const supplyingHospital = String(request?.supplying_hospital || request?.supplying_hospital_id || '');
          const requestingHospital = String(request?.requesting_hospital || request?.requesting_hospital_id || request?.hospital_id || '');

          if (reportType === 'incoming_requests') {
            return supplyingHospital === hospitalId;
          }
          return requestingHospital === hospitalId;
        });

        setRows(filtered.map((r: any) => ({
          id: r.id,
          resource: r.catalog_item_name ?? r.resource_name ?? '-',
          quantity: r.quantity_requested ?? r.quantity ?? 0,
          status: r.status ?? '-',
          priority: r.priority ?? 'normal',
          requester: r.requesting_hospital_name ?? '-',
          supplier: r.supplying_hospital_name ?? '-',
        })));
      }

      if (reportType === 'credits') {
        const [ledgerRes, balanceRes] = await Promise.all([creditsApi.get(), creditsApi.getBalance()]);
        const ledgerRaw = (ledgerRes as any)?.data?.results ?? (ledgerRes as any)?.data ?? (ledgerRes as any)?.results ?? (Array.isArray(ledgerRes) ? ledgerRes : []);
        const balanceRaw = (balanceRes as any)?.data ?? balanceRes;
        const openingRow = {
          type: 'BALANCE',
          description: 'Current platform credit balance',
          amount: balanceRaw?.balance ?? balanceRaw?.credits ?? 0,
          timestamp: new Date().toISOString(),
        };
        const ledgerRows = (Array.isArray(ledgerRaw) ? ledgerRaw : []).map((entry: any) => ({
          type: entry.transaction_type ?? entry.type ?? '-',
          description: entry.description ?? '-',
          amount: entry.amount ?? 0,
          timestamp: entry.created_at ?? entry.timestamp ?? '-',
        }));
        setRows([openingRow, ...ledgerRows]);
      }

      if (reportType === 'analytics') {
        const res = await analyticsApi.get();
        const raw = (res as any)?.data ?? res;
        const flattened: Record<string, any>[] = Object.entries(raw || {}).map(([metric, value]) => ({
          metric,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
        }));
        setRows(flattened);
      }
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [reportType, user?.hospital_id]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [] as string[];
    return Object.keys(rows[0]);
  }, [rows]);

  const exportCSV = () => {
    if (rows.length === 0) return;
    const headers = columns;
    const csvRows = rows.map((row) =>
      headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="Reports" subtitle="Generate, print, and export API-backed reports">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Report Generator</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0}>
                <FileDown className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableReports.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                Current Snapshot
              </Button>

              <Button variant="outline" size="sm" onClick={loadReport}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No report data available.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col}>{col.replace(/_/g, ' ')}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={`${idx}-${reportType}`}>
                      {columns.map((col) => (
                        <TableCell key={`${idx}-${col}`}>{String(row[col] ?? '-')}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Reports;