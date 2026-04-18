import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { inventoryModuleApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search } from 'lucide-react';

interface ImportErrorRow {
  row_number?: number | string;
  field_name?: string;
  error_code?: string;
  message?: string;
}

interface ImportJobView {
  id: string;
  mode: string;
  status: string;
  file_hash: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeJob = (payload: unknown): ImportJobView => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const summary = asRecord(data.summary);

  return {
    id: String(data.id ?? root.id ?? data.job_id ?? root.job_id ?? ''),
    mode: String(data.mode ?? summary.mode ?? root.mode ?? 'UNKNOWN'),
    status: String(data.status ?? summary.status ?? root.status ?? 'UNKNOWN'),
    file_hash: String(data.file_hash ?? summary.file_hash ?? root.file_hash ?? ''),
    total_rows: toNumber(data.total_rows ?? summary.total_rows ?? 0),
    valid_rows: toNumber(data.valid_rows ?? summary.valid_rows ?? 0),
    error_rows: toNumber(data.error_rows ?? summary.error_rows ?? 0),
  };
};

const normalizeErrors = (payload: unknown): { rows: ImportErrorRow[]; total: number } => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const list = asArray(data.results ?? data.errors ?? root.results ?? root.errors ?? payload);

  const rows = list.map((item) => {
    const row = asRecord(item);
    const rawRowNumber = row.row_number ?? row.row ?? row.line_number;
    const rowNumber = typeof rawRowNumber === 'number' || typeof rawRowNumber === 'string'
      ? rawRowNumber
      : undefined;
    return {
      row_number: rowNumber,
      field_name: String(row.field_name ?? row.field ?? row.column ?? ''),
      error_code: String(row.error_code ?? row.code ?? ''),
      message: String(row.message ?? row.detail ?? row.error ?? 'Validation error'),
    };
  });

  const total = toNumber(data.count ?? root.count ?? rows.length);

  return { rows, total };
};

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' => {
  const normalized = status.toUpperCase();
  if (normalized === 'APPLIED' || normalized === 'SUCCESS') return 'default';
  if (normalized === 'PARTIALLY_APPLIED' || normalized === 'PROCESSING') return 'secondary';
  if (normalized === 'FAILED') return 'destructive';
  return 'secondary';
};

const InventoryImportJobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [jobLookup, setJobLookup] = useState(jobId ?? '');
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<ImportJobView | null>(null);
  const [errors, setErrors] = useState<ImportErrorRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalErrors, setTotalErrors] = useState(0);

  const fieldHints = useMemo(() => {
    const uniqueFields = Array.from(new Set(errors.map((error) => error.field_name || '').filter(Boolean)));
    return uniqueFields;
  }, [errors]);

  const activeJobId = useMemo(() => jobId || '', [jobId]);

  const fetchJob = async (id: string, pageValue: number) => {
    if (!id) return;

    try {
      setLoading(true);
      const [jobResponse, errorsResponse] = await Promise.all([
        inventoryModuleApi.getImportJob(id),
        inventoryModuleApi.getImportJobErrors(id, {
          page: String(pageValue),
          page_size: String(pageSize),
        }),
      ]);

      setJob(normalizeJob(jobResponse));
      const parsedErrors = normalizeErrors(errorsResponse);
      setErrors(parsedErrors.rows);
      setTotalErrors(parsedErrors.total);
    } catch (error) {
      setJob(null);
      setErrors([]);
      setTotalErrors(0);
      toast({
        title: 'Unable to load import job',
        description: error instanceof Error ? error.message : 'The requested job could not be retrieved.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeJobId) return;
    fetchJob(activeJobId, page);
  }, [activeJobId, page]);

  const onLookup = () => {
    const trimmed = jobLookup.trim();
    if (!trimmed) {
      toast({ title: 'Job id required', description: 'Enter an import job id first.', variant: 'destructive' });
      return;
    }
    setPage(1);
    navigate(`/inventory/imports/${trimmed}`);
  };

  return (
    <AppLayout title="Inventory Import Job Detail"
      // subtitle="Inspect import status and row-level error diagnostics"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find Import Job</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="job-id">Job ID</Label>
              <Input
                id="job-id"
                placeholder="Paste import job id"
                value={jobLookup}
                onChange={(event) => setJobLookup(event.target.value)}
              />
            </div>
            <Button onClick={onLookup}>
              <Search className="mr-2 h-4 w-4" />
              Open Job
            </Button>
            <Button asChild variant="outline">
              <Link to="/inventory/imports">Back to Import Center</Link>
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : job ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Job Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Badge variant="outline">Job: {job.id}</Badge>
                  <Badge variant="outline">Mode: {job.mode}</Badge>
                  <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">File Hash</p>
                    <p className="font-mono text-xs break-all">{job.file_hash || 'N/A'}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                    <p className="text-lg font-semibold">{job.total_rows}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Valid Rows</p>
                    <p className="text-lg font-semibold text-emerald-600">{job.valid_rows}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Error Rows</p>
                    <p className="text-lg font-semibold text-destructive">{job.error_rows}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Row Errors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {errors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No row errors on this page.</p>
                ) : (
                  <>
                    {fieldHints.length > 0 ? (
                      <div className="rounded-md border p-3">
                        <p className="text-sm font-medium">Fields Referenced in Errors</p>
                        <p className="text-xs text-muted-foreground">Use these field names to align your CSV headers.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {fieldHints.map((field) => (
                            <Badge key={field} variant="outline">{field}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errors.map((error, index) => (
                          <TableRow key={`${error.row_number}-${error.field_name}-${index}`}>
                            <TableCell>{error.row_number ?? '-'}</TableCell>
                            <TableCell>{error.field_name || '-'}</TableCell>
                            <TableCell>{error.error_code || '-'}</TableCell>
                            <TableCell>{error.message || 'Validation error'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Total errors: {totalErrors}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || page * pageSize >= totalErrors}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Enter a job id to view import execution details.
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default InventoryImportJobDetail;
