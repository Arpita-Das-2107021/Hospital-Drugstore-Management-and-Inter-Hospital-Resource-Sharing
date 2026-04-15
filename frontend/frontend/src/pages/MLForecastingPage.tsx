import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mlApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { hasAnyPermission, hasHospitalRole } from '@/lib/rbac';
import { AlertTriangle, Loader2, RefreshCcw, TrendingUp } from 'lucide-react';

type FrequencyOption = 'hourly' | 'daily' | 'weekly';

interface ForecastRow {
  key: string;
  label: string;
  itemName: string;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  actual: number;
  riskLevel: string;
  recommendation: string;
}

interface FacilitySchedule {
  id: string;
  frequency: FrequencyOption;
  runTime: string;
  active: boolean;
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

const toFrequency = (value: unknown): FrequencyOption => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'hourly' || normalized === 'weekly') {
    return normalized;
  }
  return 'daily';
};

const toTime = (value: unknown): string => {
  const text = String(value || '').trim();
  if (!text) return '02:00';

  const hhmmMatch = text.match(/^(\d{2}:\d{2})/);
  if (hhmmMatch?.[1]) {
    return hhmmMatch[1];
  }

  return '02:00';
};

const normalizeRiskLabel = (value: unknown): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  return normalized;
};

const pickArray = (root: Record<string, unknown>, data: Record<string, unknown>, nested: Record<string, unknown>): unknown[] => {
  const candidates = [
    data.items,
    data.results,
    data.rows,
    data.forecast_rows,
    data.forecasts,
    nested.items,
    nested.results,
    nested.rows,
    nested.forecast_rows,
    nested.forecasts,
    root.items,
    root.results,
    root.rows,
    root.forecast_rows,
    root.forecasts,
  ];

  for (const candidate of candidates) {
    const parsed = asArray(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
};

const extractForecastRows = (payload: unknown): ForecastRow[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const nested = asRecord(data.result);

  const list = pickArray(root, data, nested);

  return list
    .map((item, index) => {
      const row = asRecord(item);
      const itemName = String(
        row.item_name ??
          row.catalog_item_name ??
          row.resource_name ??
          row.resource_catalog_id ??
          row.catalog_item_id ??
          row.name ??
          row.item ??
          'Item'
      ).trim();
      const label = String(
        row.period ?? row.month ?? row.week ?? row.date ?? row.bucket ?? `Point ${index + 1}`
      ).trim();

      const predicted = toNumber(
        row.predicted_demand ?? row.predicted ?? row.forecast_quantity ?? row.forecast ?? row.value
      );
      const lowerBound = toNumber(row.lower_bound ?? row.lowerBound ?? row.lower ?? row.min ?? predicted);
      const upperBound = toNumber(row.upper_bound ?? row.upperBound ?? row.upper ?? row.max ?? predicted);
      const actual = toNumber(row.actual_demand ?? row.actual ?? row.current_usage ?? row.observed ?? 0);
      const riskLevel = normalizeRiskLabel(
        row.risk_level ?? row.stockout_risk ?? row.severity ?? row.alert_level ?? ''
      );
      const recommendation = String(
        row.recommended_action ?? row.recommendation ?? row.action ?? row.guidance ?? ''
      ).trim();

      return {
        key: `${itemName}-${label}-${index}`,
        label: label || `Point ${index + 1}`,
        itemName: itemName || `Item ${index + 1}`,
        predicted,
        lowerBound,
        upperBound,
        actual,
        riskLevel,
        recommendation,
      };
    })
    .filter((row) => row.label && (row.predicted > 0 || row.actual > 0 || row.upperBound > 0));
};

const extractGeneratedAt = (payload: unknown): string => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const nested = asRecord(data.result);

  return String(
    data.completed_at ??
    data.generated_at ??
      data.created_at ??
      data.updated_at ??
      nested.completed_at ??
      nested.generated_at ??
      nested.created_at ??
      root.completed_at ??
      root.generated_at ??
      root.created_at ??
      ''
  );
};

const extractForecastSchedule = (payload: unknown, facilityId: string): FacilitySchedule | null => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const list = asArray(data.results ?? root.results ?? data.items ?? root.items ?? payload);

  const matched = list
    .map((item) => asRecord(item))
    .find((item) => {
      const scheduleFacilityId = String(item.facility_id ?? item.facility ?? '').trim();
      const jobType = String(item.job_type ?? item.type ?? '').toLowerCase();
      return scheduleFacilityId === facilityId && jobType === 'forecast';
    });

  if (!matched) return null;

  return {
    id: String(matched.id ?? matched.schedule_id ?? '').trim(),
    frequency: toFrequency(matched.frequency),
    runTime: toTime(matched.run_time ?? matched.time),
    active: Boolean(matched.active ?? matched.is_active ?? true),
  };
};

const riskVariant = (riskLevel: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (riskLevel.includes('critical') || riskLevel.includes('high')) return 'destructive';
  if (riskLevel.includes('medium') || riskLevel.includes('warning')) return 'secondary';
  if (riskLevel.includes('low')) return 'default';
  return 'outline';
};

const formatDateTime = (value: string): string => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const MLForecastingPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const facilityId = user?.hospital_id || '';
  const facilityName = user?.hospital_name || 'Your facility';
  const canConfigureSchedule =
    hasAnyPermission(user, ['ml:schedule.manage', 'ml:facility.settings.manage']) ||
    hasHospitalRole(user, ['HOSPITAL_ADMIN', 'HEALTHCARE_ADMIN']);

  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [partialFailure, setPartialFailure] = useState(false);

  const [schedule, setSchedule] = useState<FacilitySchedule | null>(null);
  const [frequency, setFrequency] = useState<FrequencyOption>('daily');
  const [runTime, setRunTime] = useState('02:00');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const totalPredicted = useMemo(
    () => rows.reduce((sum, row) => sum + row.predicted, 0),
    [rows]
  );

  const highRiskItems = useMemo(
    () => rows.filter((row) => row.riskLevel.includes('high') || row.riskLevel.includes('critical')).length,
    [rows]
  );

  const avgForecastBand = useMemo(() => {
    if (rows.length === 0) return 0;
    const totalBand = rows.reduce((sum, row) => sum + Math.max(0, row.upperBound - row.lowerBound), 0);
    return Math.round(totalBand / rows.length);
  }, [rows]);

  const loadPageData = async () => {
    if (!facilityId) return;

    try {
      setLoading(true);
      setPartialFailure(false);

      const [forecastResult, schedulesResult] = await Promise.allSettled([
        mlApi.getLatestForecast(facilityId),
        mlApi.listSchedules(),
      ]);

      if (forecastResult.status === 'fulfilled') {
        const parsedRows = extractForecastRows(forecastResult.value);
        setRows(parsedRows);
        setLastUpdatedAt(extractGeneratedAt(forecastResult.value));
      } else {
        setRows([]);
      }

      if (schedulesResult.status === 'fulfilled') {
        const matchedSchedule = extractForecastSchedule(schedulesResult.value, facilityId);
        setSchedule(matchedSchedule);
        if (matchedSchedule) {
          setFrequency(matchedSchedule.frequency);
          setRunTime(matchedSchedule.runTime);
          setAutoRefresh(matchedSchedule.active);
        } else {
          setFrequency('daily');
          setRunTime('02:00');
          setAutoRefresh(true);
        }
      }

      const hasFailure = [forecastResult, schedulesResult].some((result) => result.status === 'rejected');
      setPartialFailure(hasFailure);

      if (hasFailure) {
        toast({
          title: 'Some data could not be loaded',
          description: 'We are showing the forecast details that are currently available.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Unable to load forecast details',
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, [facilityId]);

  const saveSchedule = async () => {
    if (!facilityId) return;
    if (!canConfigureSchedule) {
      toast({
        title: 'Permission required',
        description: 'You need ML schedule permissions to update forecast refresh preferences.',
        variant: 'destructive',
      });
      return;
    }

    if (frequency !== 'hourly' && !runTime) {
      toast({
        title: 'Refresh time required',
        description: 'Choose a time for daily or weekly refresh.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingSchedule(true);

      if (schedule?.id) {
        await mlApi.updateSchedule(schedule.id, {
          frequency,
          run_time: frequency === 'hourly' ? undefined : runTime,
        });

        if (schedule.active !== autoRefresh) {
          if (autoRefresh) {
            await mlApi.activateSchedule(schedule.id);
          } else {
            await mlApi.deactivateSchedule(schedule.id);
          }
        }
      } else {
        await mlApi.createSchedule({
          job_type: 'forecast',
          facility_id: facilityId,
          frequency,
          run_time: frequency === 'hourly' ? undefined : runTime,
          active: autoRefresh,
          is_active: autoRefresh,
        });
      }

      toast({
        title: 'Forecast refresh preferences saved',
        description: 'Your prediction update schedule has been updated.',
      });

      await loadPageData();
    } catch (error) {
      toast({
        title: 'Unable to save schedule',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  if (!facilityId) {
    return (
      <AppLayout
        title="Forecasting"
        // subtitle="Demand projections for your facility"
      >
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Facility context missing</AlertTitle>
          <AlertDescription>
            We could not detect your facility from the current account. Contact your administrator to continue.
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Forecasting"
      // subtitle="Plan stock earlier with demand predictions tailored to your facility"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{facilityName}</CardTitle>
            {/* <CardTitle className="text-base">Facility Context</CardTitle>
            <CardDescription>
              Forecasting is automatically linked to your assigned facility.
            </CardDescription> */}
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              {/* <p className="text-sm font-medium">{facilityName}</p>
              <p className="font-mono text-xs text-muted-foreground">{facilityId}</p> */}
              <p className="text-xs text-muted-foreground">
                Last updated: {formatDateTime(lastUpdatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {partialFailure ? <Badge variant="destructive">Partial data</Badge> : null}
              <Button variant="outline" onClick={loadPageData} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Refresh Data
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forecast Refresh Preferences</CardTitle>
            <CardDescription>
              Choose how often this page receives updated predictions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Update Frequency</Label>
                <Select value={frequency} onValueChange={(value) => setFrequency(value as FrequencyOption)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Every hour</SelectItem>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="forecast-run-time">Forecast Refresh Time</Label>
                <Input
                  id="forecast-run-time"
                  type="time"
                  value={runTime}
                  onChange={(event) => setRunTime(event.target.value)}
                  disabled={frequency === 'hourly'}
                />
              </div>

              <div className="space-y-2">
                <Label>Automatic Updates</Label>
                <div className="flex h-10 items-center rounded-md border px-3">
                  <Switch
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                    disabled={!canConfigureSchedule}
                  />
                  <span className="ml-3 text-sm text-muted-foreground">
                    {autoRefresh ? 'Enabled' : 'Paused'}
                  </span>
                </div>
              </div>
            </div>

            {!canConfigureSchedule ? (
              <p className="text-xs text-muted-foreground">
                You need ML schedule permissions to change these preferences.
              </p>
            ) : null}

            <div>
              <Button onClick={saveSchedule} disabled={savingSchedule || !canConfigureSchedule}>
                {savingSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Preferences
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <div className="rounded-lg bg-primary/10 p-3">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{Math.round(totalPredicted)}</p>
                <p className="text-xs text-muted-foreground">Projected total demand</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <div className="rounded-lg bg-amber-500/10 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{highRiskItems}</p>
                <p className="text-xs text-muted-foreground">High-risk items</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <div className="rounded-lg bg-sky-500/10 p-3">
                <RefreshCcw className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{avgForecastBand}</p>
                <p className="text-xs text-muted-foreground">Average uncertainty band</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demand Trend</CardTitle>
            <CardDescription>
              Predicted demand with confidence range for upcoming periods.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[320px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No forecast rows are available yet. Predictions will appear here after your next refresh cycle.
              </p>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows.slice(0, 18)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area type="monotone" dataKey="upperBound" stroke="transparent" fill="hsl(var(--primary) / 0.15)" name="Upper" />
                    <Area type="monotone" dataKey="lowerBound" stroke="transparent" fill="hsl(var(--background))" name="Lower" />
                    <Area type="monotone" dataKey="predicted" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} name="Predicted" />
                    <Area type="monotone" dataKey="actual" stroke="hsl(var(--chart-2))" fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="Actual" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Priority Review</CardTitle>
            <CardDescription>
              Items with predicted pressure and suggested next actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recommendation rows available right now.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Predicted</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Recommendation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.itemName}</TableCell>
                      <TableCell>{row.label}</TableCell>
                      <TableCell>{Math.round(row.predicted)}</TableCell>
                      <TableCell>
                        <Badge variant={riskVariant(row.riskLevel)}>{row.riskLevel || 'unknown'}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[340px] truncate">{row.recommendation || 'Review stock and ordering cadence.'}</TableCell>
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

export default MLForecastingPage;
