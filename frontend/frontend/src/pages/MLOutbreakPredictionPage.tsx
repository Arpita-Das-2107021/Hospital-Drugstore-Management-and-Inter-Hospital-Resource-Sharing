import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { mlApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { hasAnyPermission, hasHospitalRole } from '@/lib/rbac';
import { AlertTriangle, Loader2, RefreshCcw, ShieldAlert } from 'lucide-react';

type FrequencyOption = 'hourly' | 'daily' | 'weekly';

interface OutbreakSignalRow {
  key: string;
  areaName: string;
  riskScore: number;
  riskLevel: string;
  trend: string;
  suspectedCases: number;
  recommendation: string;
}

interface SuggestionRow {
  facilityId: string;
  distanceKm: number;
  availableQuantity: number;
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

const normalizeRisk = (value: unknown): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  return raw;
};

const toPercent = (value: number): number => {
  if (value <= 1) {
    return Math.round(value * 100);
  }
  return Math.round(value);
};

const extractOutbreakRows = (payload: unknown): OutbreakSignalRow[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const nested = asRecord(data.result);

  const list = asArray(
    data.items ??
    data.results ??
      data.signals ??
      data.rows ??
      data.outbreak_rows ??
      nested.items ??
      nested.results ??
      nested.signals ??
      nested.rows ??
      root.items ??
      root.results ??
      root.signals ??
      root.rows ??
      payload
  );

  return list
    .map((item, index) => {
      const row = asRecord(item);
      const areaName = String(
        row.area_name ??
          row.zone ??
          row.ward ??
          row.department ??
          row.location ??
          row.resource_catalog_id ??
          row.name ??
          `Area ${index + 1}`
      ).trim();
      const riskScore = toNumber(row.risk_score ?? row.score ?? row.probability ?? row.risk_probability ?? 0);
      const riskLevel = normalizeRisk(row.risk_level ?? row.severity ?? row.level ?? row.alert_level ?? '');
      const trend = String(row.trend ?? row.trajectory ?? row.movement ?? 'stable').trim().toLowerCase();
      const suspectedCases = toNumber(row.suspected_cases ?? row.case_count ?? row.cases ?? 0);
      const recommendation = String(
        row.recommended_action ?? row.recommendation ?? row.action ?? row.guidance ?? ''
      ).trim();

      return {
        key: `${areaName}-${index}`,
        areaName,
        riskScore,
        riskLevel,
        trend: trend || 'stable',
        suspectedCases,
        recommendation,
      };
    })
    .filter((row) => row.areaName);
};

const extractSuggestions = (payload: unknown): SuggestionRow[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  const list = asArray(data.items ?? data.results ?? data.suggestions ?? root.items ?? root.results ?? root.suggestions ?? payload);

  return list
    .map((item) => {
      const row = asRecord(item);
      return {
        facilityId: String(row.facility_id ?? row.hospital_id ?? row.id ?? '').trim(),
        distanceKm: toNumber(row.distance_km ?? row.distance ?? 0),
        availableQuantity: toNumber(row.available_quantity ?? row.quantity ?? 0),
      };
    })
    .filter((row) => row.facilityId);
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

const extractOutbreakSchedule = (payload: unknown, facilityId: string): FacilitySchedule | null => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const list = asArray(data.results ?? root.results ?? data.items ?? root.items ?? payload);

  const matched = list
    .map((item) => asRecord(item))
    .find((item) => {
      const scheduleFacilityId = String(item.facility_id ?? item.facility ?? '').trim();
      const jobType = String(item.job_type ?? item.type ?? '').toLowerCase();
      return scheduleFacilityId === facilityId && jobType === 'outbreak';
    });

  if (!matched) return null;

  return {
    id: String(matched.id ?? matched.schedule_id ?? '').trim(),
    frequency: toFrequency(matched.frequency),
    runTime: toTime(matched.run_time ?? matched.time),
    active: Boolean(matched.active ?? matched.is_active ?? true),
  };
};

const formatDateTime = (value: string): string => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const riskVariant = (riskLevel: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (riskLevel.includes('critical') || riskLevel.includes('high')) return 'destructive';
  if (riskLevel.includes('medium') || riskLevel.includes('warning')) return 'secondary';
  if (riskLevel.includes('low')) return 'default';
  return 'outline';
};

const MLOutbreakPredictionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const facilityId = user?.hospital_id || '';
  const facilityName = user?.hospital_name || 'Your facility';
  const canConfigureSchedule =
    hasAnyPermission(user, ['ml:schedule.manage', 'ml:facility.settings.manage']) ||
    hasHospitalRole(user, ['HOSPITAL_ADMIN', 'HEALTHCARE_ADMIN']);

  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [outbreakRows, setOutbreakRows] = useState<OutbreakSignalRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [partialFailure, setPartialFailure] = useState(false);

  const [schedule, setSchedule] = useState<FacilitySchedule | null>(null);
  const [frequency, setFrequency] = useState<FrequencyOption>('daily');
  const [runTime, setRunTime] = useState('02:00');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const highRiskAreas = useMemo(
    () => outbreakRows.filter((row) => row.riskLevel.includes('high') || row.riskLevel.includes('critical')).length,
    [outbreakRows]
  );

  const averageRisk = useMemo(() => {
    if (outbreakRows.length === 0) return 0;
    const total = outbreakRows.reduce((sum, row) => sum + toPercent(row.riskScore), 0);
    return Math.round(total / outbreakRows.length);
  }, [outbreakRows]);

  const currentStatus = useMemo(() => {
    if (highRiskAreas > 0) return 'High attention required';
    if (outbreakRows.some((row) => row.riskLevel.includes('medium') || row.riskLevel.includes('warning'))) {
      return 'Monitoring advised';
    }
    if (outbreakRows.length > 0) return 'Stable';
    return 'No recent signal';
  }, [highRiskAreas, outbreakRows]);

  const loadPageData = async () => {
    if (!facilityId) return;

    try {
      setLoading(true);
      setPartialFailure(false);

      const [outbreakResult, suggestionsResult, schedulesResult] = await Promise.allSettled([
        mlApi.getLatestOutbreak(facilityId),
        mlApi.getRequestSuggestions(facilityId),
        mlApi.listSchedules(),
      ]);

      if (outbreakResult.status === 'fulfilled') {
        setOutbreakRows(extractOutbreakRows(outbreakResult.value));
        setLastUpdatedAt(extractGeneratedAt(outbreakResult.value));
      } else {
        setOutbreakRows([]);
      }

      if (suggestionsResult.status === 'fulfilled') {
        setSuggestions(extractSuggestions(suggestionsResult.value));
      } else {
        setSuggestions([]);
      }

      if (schedulesResult.status === 'fulfilled') {
        const matchedSchedule = extractOutbreakSchedule(schedulesResult.value, facilityId);
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

      const hasFailure = [outbreakResult, suggestionsResult, schedulesResult].some(
        (result) => result.status === 'rejected'
      );
      setPartialFailure(hasFailure);

      if (hasFailure) {
        toast({
          title: 'Some data could not be loaded',
          description: 'Available outbreak insights are shown below.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Unable to load outbreak details',
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
        description: 'You need ML schedule permissions to update alert refresh preferences.',
        variant: 'destructive',
      });
      return;
    }

    if (frequency !== 'hourly' && !runTime) {
      toast({
        title: 'Refresh time required',
        description: 'Choose a time for daily or weekly alert updates.',
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
          job_type: 'outbreak',
          facility_id: facilityId,
          frequency,
          run_time: frequency === 'hourly' ? undefined : runTime,
          active: autoRefresh,
          is_active: autoRefresh,
        });
      }

      toast({
        title: 'Alert schedule saved',
        description: 'Your outbreak update schedule has been updated.',
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
        title="Outbreak Prediction"
        // subtitle="Early warning insights for your facility"
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
      title="Outbreak Prediction"
      // subtitle="Receive early warning signals and response guidance for your facility"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{facilityName}</CardTitle>
            {/* <CardTitle className="text-base">Facility Context</CardTitle>
            <CardDescription>
              Outbreak monitoring is automatically linked to your assigned facility.
            </CardDescription> */}
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              {/* <p className="text-sm font-medium">{facilityName}</p> */}
              {/* <p className="font-mono text-xs text-muted-foreground">{facilityId}</p> */}
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
            <CardTitle className="text-base">Alert Update Schedule</CardTitle>
            <CardDescription>
              Choose how frequently outbreak alerts should refresh.
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
                <Label htmlFor="outbreak-run-time">Alert Refresh Time</Label>
                <Input
                  id="outbreak-run-time"
                  type="time"
                  value={runTime}
                  onChange={(event) => setRunTime(event.target.value)}
                  disabled={frequency === 'hourly'}
                />
              </div>

              <div className="space-y-2">
                <Label>Automatic Alerts</Label>
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
              <div className="rounded-lg bg-red-500/10 p-3">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current status</p>
                <p className="text-lg font-semibold">{currentStatus}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <div className="rounded-lg bg-amber-500/10 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{highRiskAreas}</p>
                <p className="text-xs text-muted-foreground">High-risk areas</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <div className="rounded-lg bg-sky-500/10 p-3">
                <RefreshCcw className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{averageRisk}%</p>
                <p className="text-xs text-muted-foreground">Average risk score</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outbreak Signals</CardTitle>
            <CardDescription>
              Areas and departments to monitor based on the latest prediction run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-56 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : outbreakRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No outbreak signal rows are available yet. This table will populate after your next update cycle.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Cases</TableHead>
                    <TableHead>Recommended Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outbreakRows.slice(0, 12).map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.areaName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={riskVariant(row.riskLevel)}>{row.riskLevel}</Badge>
                          <span className="text-xs text-muted-foreground">{toPercent(row.riskScore)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{row.trend}</TableCell>
                      <TableCell>{row.suspectedCases}</TableCell>
                      <TableCell className="max-w-[340px] truncate">
                        {row.recommendation || 'Review staffing, triage readiness, and stock buffers.'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested Support Facilities</CardTitle>
            <CardDescription>
              Recommended facilities to contact if additional supplies are needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No support suggestions are available right now.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Facility ID</TableHead>
                    <TableHead>Distance (km)</TableHead>
                    <TableHead>Available Quantity</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((row) => (
                    <TableRow key={`${row.facilityId}-${row.distanceKm}-${row.availableQuantity}`}>
                      <TableCell className="font-mono text-xs">{row.facilityId}</TableCell>
                      <TableCell>{row.distanceKm}</TableCell>
                      <TableCell>{row.availableQuantity}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(
                              `/sharing/requests/outgoing?supplying_hospital=${encodeURIComponent(row.facilityId)}&quantity_requested=${encodeURIComponent(String(row.availableQuantity))}`
                            )
                          }
                        >
                          Create Request
                        </Button>
                      </TableCell>
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

export default MLOutbreakPredictionPage;
