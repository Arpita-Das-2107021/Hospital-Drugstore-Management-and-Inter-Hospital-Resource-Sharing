import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mlApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasAnyPermission } from '@/lib/rbac';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCcw } from 'lucide-react';

interface MlJobRow {
  id: string;
  jobType: string;
  status: string;
  facilityId: string;
  createdAt: string;
}

interface MlScheduleRow {
  id: string;
  jobType: string;
  facilityId: string;
  frequency: string;
  runTime: string;
  cron: string;
  active: boolean;
}

interface MlDatasetRow {
  id: string;
  modelType: string;
  approvalStatus: string;
  dateFrom: string;
  dateTo: string;
  rowCount: number;
  schemaVersion: string;
}

interface MlTrainingJobRow {
  id: string;
  datasetId: string;
  status: string;
  versionName: string;
  createdAt: string;
}

interface MlModelVersionRow {
  id: string;
  modelType: string;
  versionName: string;
  status: string;
  isActive: boolean;
  createdAt: string;
}

const TRAINING_LIFECYCLE_PERMISSION_CODES = ['ml:training.manage', 'ml:dataset.review'];
const MODEL_GOVERNANCE_PERMISSION_CODES = ['ml:model_version.manage', 'ml:model_version.activate', 'ml:model_version.rollback'];
const MODEL_ROLLBACK_PERMISSION_CODES = ['ml:model_version.rollback'];
const JOB_MANAGE_PERMISSION_CODES = ['ml:job.manage'];
const SCHEDULE_MANAGE_PERMISSION_CODES = ['ml:schedule.manage'];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractList = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.items)) return root.items;

  const data = asRecord(root.data);
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;

  return [];
};

const mapJob = (value: unknown): MlJobRow => {
  const row = asRecord(value);
  return {
    id: String(row.id ?? ''),
    jobType: String(row.job_type ?? row.type ?? 'unknown'),
    status: String(row.status ?? 'unknown'),
    facilityId: String(row.facility_id ?? row.facility ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
};

const mapSchedule = (value: unknown): MlScheduleRow => {
  const row = asRecord(value);
  return {
    id: String(row.id ?? row.schedule_id ?? ''),
    jobType: String(row.job_type ?? row.type ?? 'unknown'),
    facilityId: String(row.facility_id ?? row.facility ?? ''),
    frequency: String(row.frequency ?? 'unknown'),
    runTime: String(row.run_time ?? ''),
    cron: String(row.cron ?? ''),
    active: Boolean(row.active ?? row.is_active),
  };
};

const mapDataset = (value: unknown): MlDatasetRow => {
  const row = asRecord(value);
  return {
    id: String(row.id ?? row.dataset_id ?? ''),
    modelType: String(row.model_type ?? 'model1'),
    approvalStatus: String(row.approval_status ?? row.status ?? 'pending'),
    dateFrom: String(row.date_from ?? row.start_date ?? ''),
    dateTo: String(row.date_to ?? row.end_date ?? ''),
    rowCount: toNumber(row.row_count ?? row.total_rows ?? row.records ?? 0),
    schemaVersion: String(row.schema_version ?? '-'),
  };
};

const mapTrainingJob = (value: unknown): MlTrainingJobRow => {
  const row = asRecord(value);
  const metrics = asRecord(row.metrics);
  return {
    id: String(row.id ?? row.training_job_id ?? ''),
    datasetId: String(row.dataset_id ?? row.dataset ?? ''),
    status: String(row.status ?? 'pending'),
    versionName: String(
      row.version_name ?? row.model_version ?? row.created_version_name ?? metrics.model_version ?? '-',
    ),
    createdAt: String(row.created_at ?? ''),
  };
};

const mapModelVersion = (value: unknown): MlModelVersionRow => {
  const row = asRecord(value);
  return {
    id: String(row.id ?? row.version_id ?? ''),
    modelType: String(row.model_type ?? '-'),
    versionName: String(row.version_name ?? row.model_version ?? '-'),
    status: String(row.status ?? '-'),
    isActive: Boolean(row.is_active ?? (String(row.status ?? '').toLowerCase() === 'active')),
    createdAt: String(row.created_at ?? ''),
  };
};

const parseJsonObject = (value: string, label: string): Record<string, unknown> => {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallthrough
  }
  throw new Error(`${label} must be a valid JSON object.`);
};

const formatDateTime = (value: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' => {
  const normalized = status.toLowerCase();
  if (['completed', 'trained', 'active', 'approved', 'success'].includes(normalized)) return 'default';
  if (['failed', 'rejected', 'cancelled'].includes(normalized)) return 'destructive';
  return 'secondary';
};

const MLOperations = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [jobs, setJobs] = useState<MlJobRow[]>([]);
  const [schedules, setSchedules] = useState<MlScheduleRow[]>([]);
  const [datasets, setDatasets] = useState<MlDatasetRow[]>([]);
  const [trainingJobs, setTrainingJobs] = useState<MlTrainingJobRow[]>([]);
  const [modelVersions, setModelVersions] = useState<MlModelVersionRow[]>([]);
  const [activeModels, setActiveModels] = useState<Record<string, unknown>>({});

  const [inferenceModel, setInferenceModel] = useState<'model1' | 'model2'>('model1');
  const [inferenceFacilityId, setInferenceFacilityId] = useState('');
  const [inferencePayloadText, setInferencePayloadText] = useState(`{
  "forecast_horizon_days": 14,
  "request_suggestions": true
}`);

  const [scheduleJobType, setScheduleJobType] = useState<'forecast' | 'outbreak'>('forecast');
  const [scheduleFacilityId, setScheduleFacilityId] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [runTime, setRunTime] = useState('02:00');
  const [cron, setCron] = useState('');

  const [datasetModelType, setDatasetModelType] = useState<'model1' | 'model2'>('model1');
  const [datasetDateFrom, setDatasetDateFrom] = useState('');
  const [datasetDateTo, setDatasetDateTo] = useState('');
  const [datasetSchemaVersion, setDatasetSchemaVersion] = useState('v1');
  const [datasetMinRows, setDatasetMinRows] = useState('500');

  const [trainingDatasetId, setTrainingDatasetId] = useState('');
  const [trainingParamsText, setTrainingParamsText] = useState(`{
  "epochs": 40,
  "learning_rate": 0.001
}`);

  const [versionActionNote, setVersionActionNote] = useState('');

  const canTrainingLifecycle = hasAnyPermission(user, TRAINING_LIFECYCLE_PERMISSION_CODES);
  const canModelGovernance = hasAnyPermission(user, MODEL_GOVERNANCE_PERMISSION_CODES);
  const canRollbackModelVersion = hasAnyPermission(user, MODEL_ROLLBACK_PERMISSION_CODES);
  const canManageJobs = hasAnyPermission(user, JOB_MANAGE_PERMISSION_CODES);
  const canManageSchedules = hasAnyPermission(user, SCHEDULE_MANAGE_PERMISSION_CODES);

  const loadData = async () => {
    try {
      setLoading(true);

      const [
        jobsResponse,
        schedulesResponse,
        datasetsResponse,
        trainingJobsResponse,
        modelVersionsResponse,
        activeModelsResponse,
      ] = await Promise.allSettled([
        mlApi.listJobs(),
        mlApi.listSchedules(),
        mlApi.listTrainingDatasets(),
        mlApi.listTrainingJobs(),
        mlApi.listModelVersions(),
        mlApi.getActiveModels(),
      ]);

      if (jobsResponse.status === 'fulfilled') {
        setJobs(extractList(jobsResponse.value).map(mapJob).filter((row) => row.id));
      }

      if (schedulesResponse.status === 'fulfilled') {
        setSchedules(extractList(schedulesResponse.value).map(mapSchedule).filter((row) => row.id));
      }

      if (datasetsResponse.status === 'fulfilled') {
        const mappedDatasets = extractList(datasetsResponse.value).map(mapDataset).filter((row) => row.id);
        setDatasets(mappedDatasets);
        if (!trainingDatasetId && mappedDatasets.length > 0) {
          setTrainingDatasetId(mappedDatasets[0].id);
        }
      }

      if (trainingJobsResponse.status === 'fulfilled') {
        setTrainingJobs(extractList(trainingJobsResponse.value).map(mapTrainingJob).filter((row) => row.id));
      }

      if (modelVersionsResponse.status === 'fulfilled') {
        setModelVersions(extractList(modelVersionsResponse.value).map(mapModelVersion).filter((row) => row.id));
      }

      if (activeModelsResponse.status === 'fulfilled') {
        const root = asRecord(activeModelsResponse.value);
        const data = asRecord(root.data);
        setActiveModels(Object.keys(data).length > 0 ? data : root);
      }
    } catch (error) {
      toast({
        title: 'ML data load failed',
        description: error instanceof Error ? error.message : 'Unable to load ML lifecycle data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const triggerInference = async () => {
    if (!canManageJobs) {
      toast({
        title: 'Permission required',
        description: 'Creating inference jobs requires ml:job.manage.',
        variant: 'destructive',
      });
      return;
    }

    if (!inferenceFacilityId.trim()) {
      toast({ title: 'Facility id required', description: 'Enter facility id before triggering inference.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = parseJsonObject(inferencePayloadText, 'Inference payload');
      if (!payload.facility_id) {
        payload.facility_id = inferenceFacilityId.trim();
      }

      if (inferenceModel === 'model1') {
        await mlApi.createModel1Prediction(payload);
      } else {
        await mlApi.createModel2Prediction(payload);
      }

      toast({ title: 'Inference job created', description: `${inferenceModel.toUpperCase()} request submitted.` });
      await loadData();
    } catch (error) {
      toast({
        title: 'Inference request failed',
        description: error instanceof Error ? error.message : 'Unable to create inference request.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const createSchedule = async () => {
    if (!canManageSchedules) {
      toast({
        title: 'Permission required',
        description: 'Managing schedules requires ml:schedule.manage.',
        variant: 'destructive',
      });
      return;
    }

    if (!scheduleFacilityId.trim()) {
      toast({ title: 'Facility id required', description: 'Enter facility id before creating schedule.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      await mlApi.createSchedule({
        job_type: scheduleJobType,
        facility_id: scheduleFacilityId.trim(),
        frequency,
        run_time: runTime || undefined,
        cron: cron || undefined,
      });
      toast({ title: 'Schedule created' });
      await loadData();
    } catch (error) {
      toast({
        title: 'Create schedule failed',
        description: error instanceof Error ? error.message : 'Unable to create schedule.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSchedule = async (schedule: MlScheduleRow) => {
    if (!canManageSchedules) {
      toast({
        title: 'Permission required',
        description: 'Managing schedules requires ml:schedule.manage.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      if (schedule.active) {
        await mlApi.deactivateSchedule(schedule.id);
      } else {
        await mlApi.activateSchedule(schedule.id);
      }
      toast({ title: schedule.active ? 'Schedule deactivated' : 'Schedule activated' });
      await loadData();
    } catch (error) {
      toast({
        title: 'Schedule update failed',
        description: error instanceof Error ? error.message : 'Unable to update schedule.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const generateDataset = async () => {
    if (!canTrainingLifecycle) {
      toast({ title: 'Unauthorized', description: 'Training lifecycle actions require ml:training.manage or ml:dataset.review.', variant: 'destructive' });
      return;
    }

    if (!datasetDateFrom || !datasetDateTo) {
      toast({ title: 'Date range required', description: 'Provide both date_from and date_to.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      await mlApi.generateTrainingDataset({
        model_type: datasetModelType,
        date_from: datasetDateFrom,
        date_to: datasetDateTo,
        schema_version: datasetSchemaVersion,
        parameters: {
          min_rows: toNumber(datasetMinRows),
        },
      });
      toast({ title: 'Dataset generation submitted' });
      await loadData();
    } catch (error) {
      toast({
        title: 'Dataset generation failed',
        description: error instanceof Error ? error.message : 'Unable to generate training dataset.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reviewDataset = async (datasetId: string, decision: 'approve' | 'reject') => {
    if (!canTrainingLifecycle) {
      toast({ title: 'Unauthorized', description: 'Training lifecycle actions require ml:training.manage or ml:dataset.review.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      if (decision === 'approve') {
        await mlApi.approveTrainingDataset(datasetId, { notes: 'Approved from frontend workflow.' });
      } else {
        await mlApi.rejectTrainingDataset(datasetId, { reason: 'Rejected from frontend workflow.' });
      }
      toast({ title: decision === 'approve' ? 'Dataset approved' : 'Dataset rejected' });
      await loadData();
    } catch (error) {
      toast({
        title: 'Dataset review failed',
        description: error instanceof Error ? error.message : 'Unable to review dataset.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const createTrainingJob = async () => {
    if (!canTrainingLifecycle) {
      toast({ title: 'Unauthorized', description: 'Training lifecycle actions require ml:training.manage or ml:dataset.review.', variant: 'destructive' });
      return;
    }

    if (!trainingDatasetId.trim()) {
      toast({ title: 'Dataset id required', description: 'Select a dataset before creating a training job.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const trainingParameters = parseJsonObject(trainingParamsText, 'Training parameters');
      await mlApi.createTrainingJob({
        dataset_id: trainingDatasetId.trim(),
        training_parameters: trainingParameters,
      });
      toast({ title: 'Training job submitted' });
      await loadData();
    } catch (error) {
      toast({
        title: 'Training job creation failed',
        description: error instanceof Error ? error.message : 'Unable to create training job.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateModelVersion = async (
    versionId: string,
    action: 'review' | 'approve' | 'activate' | 'deactivate' | 'rollback',
  ) => {
    if (!canTrainingLifecycle) {
      toast({ title: 'Unauthorized', description: 'Model lifecycle actions require ml:training.manage or ml:dataset.review.', variant: 'destructive' });
      return;
    }

    if (['activate', 'deactivate', 'rollback'].includes(action) && !canModelGovernance) {
      toast({
        title: 'Governance permission required',
        description: 'Activate/deactivate/rollback requires model governance permissions.',
        variant: 'destructive',
      });
      return;
    }

    if (action === 'rollback' && !canRollbackModelVersion) {
      toast({
        title: 'Rollback permission required',
        description: 'Rollback requires ml:model_version.rollback.',
        variant: 'destructive',
      });
      return;
    }

    const payload = versionActionNote.trim()
      ? { notes: versionActionNote.trim(), reason: versionActionNote.trim() }
      : {};

    try {
      setSubmitting(true);

      if (action === 'review') {
        await mlApi.reviewModelVersion(versionId, payload);
      } else if (action === 'approve') {
        await mlApi.approveModelVersion(versionId, payload);
      } else if (action === 'activate') {
        await mlApi.activateModelVersion(versionId, payload);
      } else if (action === 'deactivate') {
        await mlApi.deactivateModelVersion(versionId, payload);
      } else {
        await mlApi.rollbackModelVersion(versionId, payload);
      }

      toast({ title: `Model version ${action} submitted` });
      await loadData();
    } catch (error) {
      toast({
        title: 'Model version update failed',
        description: error instanceof Error ? error.message : 'Unable to update model version.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const activeModelRows = useMemo(() => {
    return Object.entries(activeModels).map(([modelName, value]) => {
      const row = asRecord(value);
      return {
        modelName,
        versionId: String(row.active_version_id ?? row.version_id ?? '-'),
        versionName: String(row.version_name ?? row.model_version ?? '-'),
      };
    });
  }, [activeModels]);

  return (
    <AppLayout title="ML Operations"
      // subtitle="Inference, training lifecycle, and model governance"
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="inference" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="inference">Inference</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="registry">Model Registry</TabsTrigger>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
          </TabsList>

          <TabsContent value="inference" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create Inference Job</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={inferenceModel} onValueChange={(value) => setInferenceModel(value as 'model1' | 'model2')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="model1">model1</SelectItem>
                        <SelectItem value="model2">model2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inference-facility">Facility ID</Label>
                    <Input
                      id="inference-facility"
                      value={inferenceFacilityId}
                      onChange={(event) => setInferenceFacilityId(event.target.value)}
                      placeholder="facility-uuid"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inference-payload">Payload (JSON)</Label>
                  <Textarea
                    id="inference-payload"
                    rows={8}
                    value={inferencePayloadText}
                    onChange={(event) => setInferencePayloadText(event.target.value)}
                  />
                </div>

                <Button onClick={triggerInference} disabled={submitting || !canManageJobs}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Trigger Inference
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inference Job Queue</CardTitle>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No jobs found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Facility</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-xs">{job.id}</TableCell>
                          <TableCell>{job.jobType}</TableCell>
                          <TableCell><Badge variant={statusVariant(job.status)}>{job.status}</Badge></TableCell>
                          <TableCell>{job.facilityId || '-'}</TableCell>
                          <TableCell>{formatDateTime(job.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="training" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Generate Training Dataset</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={datasetModelType} onValueChange={(value) => setDatasetModelType(value as 'model1' | 'model2')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="model1">model1</SelectItem>
                        <SelectItem value="model2">model2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataset-date-from">Date From</Label>
                    <Input id="dataset-date-from" type="date" value={datasetDateFrom} onChange={(event) => setDatasetDateFrom(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataset-date-to">Date To</Label>
                    <Input id="dataset-date-to" type="date" value={datasetDateTo} onChange={(event) => setDatasetDateTo(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataset-min-rows">Min Rows</Label>
                    <Input id="dataset-min-rows" value={datasetMinRows} onChange={(event) => setDatasetMinRows(event.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dataset-schema">Schema Version</Label>
                  <Input id="dataset-schema" value={datasetSchemaVersion} onChange={(event) => setDatasetSchemaVersion(event.target.value)} />
                </div>

                <Button onClick={generateDataset} disabled={submitting || !canTrainingLifecycle}>Generate Dataset</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Training Datasets</CardTitle>
              </CardHeader>
              <CardContent>
                {datasets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No training datasets found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dataset ID</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>Schema</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datasets.map((dataset) => (
                        <TableRow key={dataset.id}>
                          <TableCell className="font-mono text-xs">{dataset.id}</TableCell>
                          <TableCell>{dataset.modelType}</TableCell>
                          <TableCell><Badge variant={statusVariant(dataset.approvalStatus)}>{dataset.approvalStatus}</Badge></TableCell>
                          <TableCell>{dataset.dateFrom || '-'} to {dataset.dateTo || '-'}</TableCell>
                          <TableCell>{dataset.rowCount}</TableCell>
                          <TableCell>{dataset.schemaVersion}</TableCell>
                          <TableCell className="space-x-2">
                            <Button size="sm" variant="outline" onClick={() => reviewDataset(dataset.id, 'approve')} disabled={submitting || !canTrainingLifecycle}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => reviewDataset(dataset.id, 'reject')} disabled={submitting || !canTrainingLifecycle}>Reject</Button>
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
                <CardTitle className="text-base">Create Training Job</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Dataset ID</Label>
                  <Select value={trainingDatasetId} onValueChange={setTrainingDatasetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>{dataset.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="training-params">Training Parameters (JSON)</Label>
                  <Textarea
                    id="training-params"
                    rows={6}
                    value={trainingParamsText}
                    onChange={(event) => setTrainingParamsText(event.target.value)}
                  />
                </div>

                <Button onClick={createTrainingJob} disabled={submitting || !canTrainingLifecycle}>Create Training Job</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Training Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                {trainingJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No training jobs found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Training Job ID</TableHead>
                        <TableHead>Dataset ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainingJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-xs">{job.id}</TableCell>
                          <TableCell className="font-mono text-xs">{job.datasetId || '-'}</TableCell>
                          <TableCell><Badge variant={statusVariant(job.status)}>{job.status}</Badge></TableCell>
                          <TableCell className="max-w-[28rem] whitespace-normal break-all" title={job.versionName}>{job.versionName}</TableCell>
                          <TableCell>{formatDateTime(job.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registry" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Model Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                {activeModelRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active model metadata available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Active Version ID</TableHead>
                        <TableHead>Version Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeModelRows.map((row) => (
                        <TableRow key={row.modelName}>
                          <TableCell>{row.modelName}</TableCell>
                          <TableCell className="font-mono text-xs">{row.versionId}</TableCell>
                          <TableCell className="max-w-[36rem] whitespace-normal break-all" title={row.versionName}>{row.versionName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model Versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="version-note">Action Note</Label>
                  <Input
                    id="version-note"
                    value={versionActionNote}
                    onChange={(event) => setVersionActionNote(event.target.value)}
                    placeholder="Optional note/reason for review, approval, activation, or rollback"
                  />
                </div>

                {modelVersions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No model versions found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version ID</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Version Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modelVersions.map((version) => (
                        <TableRow key={version.id}>
                          <TableCell className="font-mono text-xs">{version.id}</TableCell>
                          <TableCell>{version.modelType}</TableCell>
                          <TableCell className="max-w-[42rem] whitespace-normal break-all" title={version.versionName}>{version.versionName}</TableCell>
                          <TableCell><Badge variant={statusVariant(version.status)}>{version.status}</Badge></TableCell>
                          <TableCell>{version.isActive ? <Badge>active</Badge> : <Badge variant="outline">inactive</Badge>}</TableCell>
                          <TableCell>{formatDateTime(version.createdAt)}</TableCell>
                          <TableCell className="space-x-2 whitespace-nowrap">
                            <Button size="sm" variant="outline" onClick={() => updateModelVersion(version.id, 'review')} disabled={submitting || !canTrainingLifecycle}>Review</Button>
                            <Button size="sm" variant="outline" onClick={() => updateModelVersion(version.id, 'approve')} disabled={submitting || !canTrainingLifecycle}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => updateModelVersion(version.id, 'activate')} disabled={submitting || !canModelGovernance}>Activate</Button>
                            <Button size="sm" variant="outline" onClick={() => updateModelVersion(version.id, 'deactivate')} disabled={submitting || !canModelGovernance}>Deactivate</Button>
                            <Button size="sm" variant="outline" onClick={() => updateModelVersion(version.id, 'rollback')} disabled={submitting || !canRollbackModelVersion}>Rollback</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedules" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configure Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Job Type</Label>
                    <Select value={scheduleJobType} onValueChange={(value) => setScheduleJobType(value as 'forecast' | 'outbreak')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="forecast">forecast</SelectItem>
                        <SelectItem value="outbreak">outbreak</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="schedule-facility">Facility ID</Label>
                    <Input
                      id="schedule-facility"
                      value={scheduleFacilityId}
                      onChange={(event) => setScheduleFacilityId(event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">hourly</SelectItem>
                        <SelectItem value="daily">daily</SelectItem>
                        <SelectItem value="weekly">weekly</SelectItem>
                        <SelectItem value="cron">cron</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="schedule-run-time">Run Time</Label>
                    <Input id="schedule-run-time" type="time" value={runTime} onChange={(event) => setRunTime(event.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="schedule-cron">Cron</Label>
                    <Input id="schedule-cron" value={cron} onChange={(event) => setCron(event.target.value)} placeholder="0 2 * * *" />
                  </div>
                </div>

                <Button variant="secondary" onClick={createSchedule} disabled={submitting || !canManageSchedules}>Save Schedule</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Schedules</CardTitle>
              </CardHeader>
              <CardContent>
                {schedules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No schedules configured.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Facility</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Run Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules.map((schedule) => (
                        <TableRow key={schedule.id}>
                          <TableCell className="font-mono text-xs">{schedule.id}</TableCell>
                          <TableCell>{schedule.jobType}</TableCell>
                          <TableCell>{schedule.facilityId || '-'}</TableCell>
                          <TableCell>{schedule.frequency}</TableCell>
                          <TableCell>{schedule.runTime || schedule.cron || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={schedule.active ? 'default' : 'secondary'}>
                              {schedule.active ? 'active' : 'inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => toggleSchedule(schedule)} disabled={submitting || !canManageSchedules}>
                              {schedule.active ? 'Deactivate' : 'Activate'}
                            </Button>
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
      </div>
    </AppLayout>
  );
};

export default MLOperations;
