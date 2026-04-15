import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { badgesApi, hospitalsApi, hospitalUpdateRequestsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessErrorMessage } from '@/lib/accessResolver';
import { resolveMediaUrl } from '@/utils/media';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  GitCompareArrows,
  History,
  ImagePlus,
  Info,
  Loader2,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { refreshBadgeCounters } from '@/store/badgeStore';

/*   Types & Interfaces   */
type UnknownRecord = Record<string, unknown>;
type HospitalFieldKey =
  | 'name'
  | 'hospital_type'
  | 'address'
  | 'city'
  | 'phone'
  | 'email'
  | 'api_base_url'
  | 'api_version'
  | 'registration_number'
  | 'description';

interface HospitalFieldConfig {
  key: HospitalFieldKey;
  label: string;
  sourceKeys: string[];
  group: 'identity' | 'integration';
  payloadKey?: string;
  multiline?: boolean;
  approvalRequired?: boolean;
}

interface HospitalUpdateRequestRecord {
  id: string;
  status: string;
  hospitalName?: string;
  requestedAt?: string;
  reviewedAt?: string;
  updatedAt?: string;
  requestedByName?: string;
  reviewedByName?: string;
  reason?: string;
  reviewComment?: string;
  requestedChanges: UnknownRecord;
  sensitiveChanges: UnknownRecord;
}

interface ChangedField {
  key: HospitalFieldKey;
  payloadKey: string;
  label: string;
  oldValue: string;
  newValue: string;
  approvalRequired: boolean;
}

/*   Constants   */
const PLACEHOLDER_TOKENS = new Set([
  'n/a', 'na', 'not available', 'none', 'null', 'undefined', '-', '--', '0',
]);

const HOSPITAL_FIELDS: HospitalFieldConfig[] = [
  { key: 'name', label: 'Hospital Name', sourceKeys: ['name'], group: 'identity', approvalRequired: true },
  { key: 'hospital_type', label: 'Hospital Type', sourceKeys: ['hospital_type'], group: 'identity', approvalRequired: true },
  { key: 'address', label: 'Location / Address', sourceKeys: ['address'], group: 'identity' },
  { key: 'city', label: 'City / District', sourceKeys: ['city', 'district', 'state'], group: 'identity', payloadKey: 'city' },
  { key: 'phone', label: 'Phone', sourceKeys: ['phone'], group: 'identity' },
  { key: 'email', label: 'Email', sourceKeys: ['email'], group: 'identity', approvalRequired: true },
  { key: 'registration_number', label: 'License / Registration ID', sourceKeys: ['registration_number', 'license_number'], group: 'identity', payloadKey: 'registration_number', approvalRequired: true },
  { key: 'description', label: 'Public Profile Description', sourceKeys: ['public_profile_description', 'description'], group: 'identity', payloadKey: 'description', multiline: true },
  { key: 'api_base_url', label: 'API Endpoint', sourceKeys: ['api_base_url', 'api_endpoint'], group: 'integration', payloadKey: 'api_base_url', approvalRequired: true },
  { key: 'api_version', label: 'API Version', sourceKeys: ['api_version'], group: 'integration', approvalRequired: true },
];

const HOSPITAL_LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const HOSPITAL_LOGO_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const FIELD_LABEL_BY_KEY = HOSPITAL_FIELDS.reduce<Record<string, string>>((acc, field) => {
  acc[field.key] = field.label;
  field.sourceKeys.forEach((sourceKey) => { acc[sourceKey] = field.label; });
  if (field.payloadKey) acc[field.payloadKey] = field.label;
  return acc;
}, {});

/*   Utility helpers (unchanged logic)   */
const createEmptyFormValues = (): Record<HospitalFieldKey, string> => ({
  name: '', hospital_type: '', address: '', city: '', phone: '', email: '',
  api_base_url: '', api_version: '', registration_number: '', description: '',
});

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord => isRecord(value) ? value : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const toMeaningfulString = (value: unknown, allowZero = false): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const normalized = trimmed.toLowerCase();
    if (!allowZero && PLACEHOLDER_TOKENS.has(normalized)) return undefined;
    if (!allowZero && normalized === '0') return undefined;
    return trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!allowZero && value === 0) return undefined;
    return String(value);
  }
  return undefined;
};

const toEditableString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const hasMeaningfulBackendValue = (value: unknown): boolean => toMeaningfulString(value) !== undefined;

const getHospitalLogoUrl = (record: UnknownRecord | null): string | null => {
  if (!record) return null;
  const logoValue = toMeaningfulString(record.logo, true) || toMeaningfulString(record.logo_url, true);
  return resolveMediaUrl(logoValue || null);
};

const validateHospitalLogoFile = (file: File): string | null => {
  if (!HOSPITAL_LOGO_ACCEPTED_TYPES.includes(file.type as (typeof HOSPITAL_LOGO_ACCEPTED_TYPES)[number]))
    return 'Unsupported file type. Use JPG, PNG, WEBP, or GIF images only.';
  if (file.size > HOSPITAL_LOGO_MAX_SIZE_BYTES)
    return 'Image file is too large. Maximum upload size is 5 MB.';
  return null;
};

const extractResponseData = (response: unknown): unknown => {
  const responseRecord = asRecord(response);
  if (Object.prototype.hasOwnProperty.call(responseRecord, 'data')) return responseRecord.data;
  return response;
};

const extractListPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(root.items)) return root.items;
  const nestedData = asRecord(root.data);
  if (Array.isArray(nestedData.results)) return nestedData.results;
  if (Array.isArray(nestedData.data)) return nestedData.data;
  return [];
};

const pickValueByKeys = (record: UnknownRecord, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
};

const normalizeRequestStatus = (status: string): 'pending' | 'approved' | 'rejected' | 'unknown' => {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'pending') return 'pending';
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  return 'unknown';
};

const formatStatusLabel = (status: string): string => {
  const normalized = normalizeRequestStatus(status);
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  return status || 'Unknown';
};

const formatDateTime = (value: string | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

const normalizeRequestRecord = (raw: unknown): HospitalUpdateRequestRecord | null => {
  const record = asRecord(raw);
  const hospital = asRecord(record.hospital);
  const requestedBy = asRecord(record.requested_by);
  const reviewedBy = asRecord(record.reviewed_by);
  const id = toMeaningfulString(record.id, true) || '';
  const requestedChanges = asRecord(record.requested_changes ?? record.requestedChanges ?? record.changes ?? record.request_payload);
  const sensitiveChanges = asRecord(record.sensitive_changes ?? record.sensitiveChanges ?? record.sensitive_payload);
  const statusFromPayload = toMeaningfulString(record.status, true) || toMeaningfulString(record.workflow_state, true) || '';
  const hasRequestData = Boolean(
    id || statusFromPayload ||
    toMeaningfulString(record.requested_at, true) || toMeaningfulString(record.created_at, true) ||
    toMeaningfulString(record.submitted_at, true) || toMeaningfulString(record.updated_at, true) ||
    toMeaningfulString(record.reviewed_at, true) || toMeaningfulString(record.decision_at, true) ||
    toMeaningfulString(record.reason) || toMeaningfulString(record.request_reason) ||
    toMeaningfulString(record.submission_reason) || toMeaningfulString(record.rejection_reason) ||
    toMeaningfulString(record.review_comment) || toMeaningfulString(record.admin_notes) ||
    toMeaningfulString(record.hospital_name) || toMeaningfulString(hospital.name) ||
    Object.keys(requestedChanges).length > 0 || Object.keys(sensitiveChanges).length > 0,
  );
  if (!hasRequestData) return null;
  return {
    id, status: statusFromPayload || 'pending',
    hospitalName: toMeaningfulString(record.hospital_name) || toMeaningfulString(hospital.name),
    requestedAt: toMeaningfulString(record.requested_at, true) || toMeaningfulString(record.created_at, true) || toMeaningfulString(record.submitted_at, true),
    reviewedAt: toMeaningfulString(record.reviewed_at, true) || toMeaningfulString(record.decision_at, true),
    updatedAt: toMeaningfulString(record.updated_at, true),
    requestedByName: toMeaningfulString(record.requested_by_name) || toMeaningfulString(requestedBy.full_name) || toMeaningfulString(record.submitted_by_name),
    reviewedByName: toMeaningfulString(record.reviewed_by_name) || toMeaningfulString(reviewedBy.full_name) || toMeaningfulString(record.admin_name),
    reason: toMeaningfulString(record.reason) || toMeaningfulString(record.request_reason) || toMeaningfulString(record.submission_reason),
    reviewComment: toMeaningfulString(record.rejection_reason) || toMeaningfulString(record.review_comment) || toMeaningfulString(record.admin_notes),
    requestedChanges, sensitiveChanges,
  };
};

const extractRequestHistoryFromHospital = (hospitalRecord: UnknownRecord): HospitalUpdateRequestRecord[] => {
  const candidates = [hospitalRecord.hospital_update_requests, hospitalRecord.update_request_history, hospitalRecord.hospital_update_request_history, hospitalRecord.update_requests];
  const collected = candidates.flatMap((candidate) => asArray(candidate).map(normalizeRequestRecord).filter((e): e is HospitalUpdateRequestRecord => Boolean(e)));
  const pendingRecord = normalizeRequestRecord(hospitalRecord.pending_update_request ?? hospitalRecord.pendingHospitalUpdateRequest);
  if (pendingRecord) collected.unshift(pendingRecord);
  return collected;
};

const mergeRequestHistory = (localHistory: HospitalUpdateRequestRecord[], remoteHistory: HospitalUpdateRequestRecord[]): HospitalUpdateRequestRecord[] => {
  const mergedMap = new Map<string, HospitalUpdateRequestRecord>();
  [...localHistory, ...remoteHistory].forEach((entry) => {
    const fallbackKey = `${entry.requestedAt || entry.updatedAt || 'no-date'}:${entry.status}:${JSON.stringify(entry.requestedChanges)}`;
    const key = entry.id || fallbackKey;
    if (!mergedMap.has(key)) { mergedMap.set(key, entry); return; }
    const existing = mergedMap.get(key);
    if (!existing) { mergedMap.set(key, entry); return; }
    const existingStamp = new Date(existing.updatedAt || existing.requestedAt || 0).getTime();
    const currentStamp = new Date(entry.updatedAt || entry.requestedAt || 0).getTime();
    if (currentStamp >= existingStamp) mergedMap.set(key, entry);
  });
  return Array.from(mergedMap.values()).sort((left, right) => {
    const leftStamp = new Date(left.requestedAt || left.updatedAt || 0).getTime();
    const rightStamp = new Date(right.requestedAt || right.updatedAt || 0).getTime();
    return rightStamp - leftStamp;
  });
};

const resolveChangedFieldsText = (entry: HospitalUpdateRequestRecord): string => {
  const keys = Array.from(new Set([...Object.keys(entry.requestedChanges), ...Object.keys(entry.sensitiveChanges)]));
  if (keys.length === 0) return 'No changed fields';
  return keys.map((key) => FIELD_LABEL_BY_KEY[key] || key).join(', ');
};

/*   Sub-components   */

const StatusBadge = ({ status }: { status: string }) => {
  const normalized = normalizeRequestStatus(status);
  const config = {
    pending: { icon: Clock3, className: 'border-amber-200 bg-amber-50 text-amber-700', dotColor: 'bg-amber-500' },
    approved: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dotColor: 'bg-emerald-500' },
    rejected: { icon: XCircle, className: 'border-rose-200 bg-rose-50 text-rose-700', dotColor: 'bg-rose-500' },
    unknown: { icon: Info, className: 'border-muted bg-muted/50 text-muted-foreground', dotColor: 'bg-muted-foreground' },
  }[normalized];

  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', config.className)}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', config.dotColor)} />
      {formatStatusLabel(status)}
    </Badge>
  );
};

const StatCard = ({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) => (
  <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-colors hover:bg-accent/30">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground truncate">{value}</p>
    </div>
  </div>
);

/*   Main Component   */

const HospitalUpdateRequests = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [hospitalRecord, setHospitalRecord] = useState<UnknownRecord | null>(null);
  const [initialValues, setInitialValues] = useState<Record<HospitalFieldKey, string>>(createEmptyFormValues());
  const [formValues, setFormValues] = useState<Record<HospitalFieldKey, string>>(createEmptyFormValues());
  const [reason, setReason] = useState('');
  const [requestHistory, setRequestHistory] = useState<HospitalUpdateRequestRecord[]>([]);
  const [pendingRequest, setPendingRequest] = useState<HospitalUpdateRequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyNotice, setHistoryNotice] = useState('');
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoValidationMessage, setLogoValidationMessage] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoInputVersion, setLogoInputVersion] = useState(0);
  const hasAcknowledgedBadgesRef = useRef(false);

  const visibleFields = useMemo(() => {
    if (!hospitalRecord) return [];
    return HOSPITAL_FIELDS.filter((field) => field.sourceKeys.some((sk) => hasMeaningfulBackendValue(hospitalRecord[sk])));
  }, [hospitalRecord]);

  const changedFields = useMemo(() => {
    return visibleFields
      .map((field) => {
        const oldValue = initialValues[field.key].trim();
        const newValue = formValues[field.key].trim();
        if (oldValue === newValue) return null;
        return { key: field.key, payloadKey: field.payloadKey || field.key, label: field.label, oldValue, newValue, approvalRequired: Boolean(field.approvalRequired) };
      })
      .filter((e): e is ChangedField => Boolean(e));
  }, [formValues, initialValues, visibleFields]);

  const isPending = useMemo(() => {
    if (!pendingRequest) return false;
    return normalizeRequestStatus(pendingRequest.status) === 'pending';
  }, [pendingRequest]);

  const fetchRequestHistory = useCallback(async (hospitalId: string): Promise<HospitalUpdateRequestRecord[]> => {
    if (!hospitalId) return [];
    setHistoryLoading(true);
    setHistoryNotice('');
    try {
      const response = await hospitalUpdateRequestsApi.getAll({ hospital: hospitalId, ordering: '-requested_at', limit: '50' });
      return extractListPayload(extractResponseData(response)).map(normalizeRequestRecord).filter((e): e is HospitalUpdateRequestRecord => Boolean(e));
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status === 401 || status === 403) { setHistoryNotice('Request history metadata is currently restricted for your account.'); return []; }
      setHistoryNotice('Could not refresh request history metadata from backend endpoints.');
      return [];
    } finally { setHistoryLoading(false); }
  }, []);

  const loadPageData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hospitalsApi.getMyHospital();
      const record = asRecord(extractResponseData(response));
      if (Object.keys(record).length === 0) throw new Error('Hospital profile payload is empty.');
      setHospitalRecord(record);
      const nextValues = createEmptyFormValues();
      HOSPITAL_FIELDS.forEach((field) => { nextValues[field.key] = toEditableString(pickValueByKeys(record, field.sourceKeys)); });
      setInitialValues(nextValues);
      setFormValues(nextValues);
      const localHistory = extractRequestHistoryFromHospital(record);
      const hospitalId = toMeaningfulString(record.id, true) || toMeaningfulString(user?.hospital_id, true) || '';
      const remoteHistory = await fetchRequestHistory(hospitalId);
      const mergedHistory = mergeRequestHistory(localHistory, remoteHistory);
      setRequestHistory(mergedHistory);
      const pendingFromHistory = mergedHistory.find((e) => normalizeRequestStatus(e.status) === 'pending') || null;
      const pendingFromHospital = normalizeRequestRecord(record.pending_update_request ?? record.pendingHospitalUpdateRequest);
      setPendingRequest(pendingFromHistory || pendingFromHospital);
    } catch (error) {
      toast({ title: 'Failed to load hospital update workflow', description: getAccessErrorMessage(error, { forbiddenMessage: 'You are not authorized to access hospital update workflows.', fallbackMessage: 'Please retry shortly.' }), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [fetchRequestHistory, toast, user?.hospital_id]);

  useEffect(() => {
    if (hasAcknowledgedBadgesRef.current) return;
    hasAcknowledgedBadgesRef.current = true;
    const acknowledgeBadges = async () => { try { await badgesApi.acknowledgeHealthcareBadges(); await refreshBadgeCounters(); } catch {} };
    void acknowledgeBadges();
  }, []);

  useEffect(() => { void loadPageData(); }, [loadPageData]);

  useEffect(() => {
    if (!selectedLogoFile) { setLogoPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(selectedLogoFile);
    setLogoPreviewUrl(objectUrl);
    return () => { URL.revokeObjectURL(objectUrl); };
  }, [selectedLogoFile]);

  const handleFieldChange = (fieldKey: HospitalFieldKey, value: string) => {
    setFormValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    const validationError = validateHospitalLogoFile(nextFile);
    if (validationError) { setSelectedLogoFile(null); setLogoValidationMessage(validationError); setLogoInputVersion((p) => p + 1); return; }
    setLogoValidationMessage('');
    setSelectedLogoFile(nextFile);
  };

  const clearSelectedLogo = () => { setSelectedLogoFile(null); setLogoValidationMessage(''); setLogoInputVersion((p) => p + 1); };

  const handleUploadHospitalLogo = async () => {
    if (!selectedLogoFile) { toast({ title: 'No image selected', description: 'Choose an image file before uploading.' }); return; }
    setUploadingLogo(true);
    try {
      await hospitalsApi.uploadMyHospitalLogo(selectedLogoFile);
      toast({ title: 'Hospital image updated', description: 'The new hospital image has been applied immediately.' });
      setSelectedLogoFile(null); setLogoValidationMessage(''); setLogoInputVersion((p) => p + 1);
      await loadPageData();
    } catch (error) {
      toast({ title: 'Image upload failed', description: getAccessErrorMessage(error, { forbiddenMessage: 'You are not authorized to update the hospital image.', fallbackMessage: 'Please try again with another image file.' }), variant: 'destructive' });
    } finally { setUploadingLogo(false); }
  };

  const handleSubmitUpdateRequest = async () => {
    if (isPending) { toast({ title: 'A request is already pending approval', description: 'Wait for the current request decision before submitting another update.' }); return; }
    if (changedFields.length === 0) { toast({ title: 'No profile changes detected', description: 'Update at least one field to submit an approval request.' }); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      changedFields.forEach((change) => { payload[change.payloadKey] = change.newValue.length > 0 ? change.newValue : null; });
      if (reason.trim()) payload.reason = reason.trim();
      const response = await hospitalsApi.updateMyHospital(payload);
      const responseData = asRecord(extractResponseData(response));
      const nestedData = asRecord(responseData.data);
      const pendingFromResponse = normalizeRequestRecord(responseData.pending_update_request ?? nestedData.pending_update_request ?? responseData.pendingHospitalUpdateRequest);
      const requiresApproval = Boolean(responseData.requiresApproval ?? responseData.requires_approval ?? nestedData.requiresApproval ?? nestedData.requires_approval);
      const responseMessage = toMeaningfulString(responseData.message, true) || toMeaningfulString(responseData.detail, true) || toMeaningfulString(nestedData.message, true) || toMeaningfulString(nestedData.detail, true);
      const shouldTreatAsApproval = requiresApproval || Boolean(pendingFromResponse) || changedFields.some((c) => c.approvalRequired);
      if (shouldTreatAsApproval) {
        toast({ title: 'Update request submitted', description: responseMessage || 'Changes submitted for system admin approval. A pending request is now active.' });
      } else {
        toast({ title: 'Hospital profile updated', description: responseMessage || 'Operational profile changes were saved successfully.' });
      }
      setReason('');
      await loadPageData();
    } catch (error) {
      toast({ title: 'Failed to submit hospital update', description: getAccessErrorMessage(error, { forbiddenMessage: 'You are not authorized to submit hospital update requests.', fallbackMessage: 'Please review your changes and try again.' }), variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const identityFields = visibleFields.filter((f) => f.group === 'identity');
  const integrationFields = visibleFields.filter((f) => f.group === 'integration');
  const timelineEntries = requestHistory.slice(0, 5);
  const requestedBy = pendingRequest?.requestedByName || user?.full_name || user?.email || 'Current User';
  const currentLogoUrl = useMemo(() => getHospitalLogoUrl(hospitalRecord), [hospitalRecord]);
  const activeLogoUrl = logoPreviewUrl || currentLogoUrl;

  const renderFormField = (field: HospitalFieldConfig) => {
    const disabled = submitting || (isPending && Boolean(field.approvalRequired));
    return (
      <div key={field.key} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={field.key} className="text-xs font-medium text-foreground">
            {field.label}
          </Label>
          {field.approvalRequired && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              <ShieldCheck className="h-2.5 w-2.5" />
              Approval
            </span>
          )}
        </div>
        {field.multiline ? (
          <Textarea
            id={field.key}
            rows={3}
            value={formValues[field.key]}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={disabled}
            className="resize-none text-sm"
          />
        ) : (
          <Input
            id={field.key}
            value={formValues[field.key]}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={disabled}
            className="text-sm"
          />
        )}
      </div>
    );
  };

  /*   Render   */

  return (
    <AppLayout title="Healthcare Update Requests">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-10 pt-2 sm:px-6">

        {/*   Page Header   */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {/* <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Profile Update Workspace
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Manage healthcare identity details, upload images, and track approval workflows - all in one place.
            </p>
          </div> */}
          {isPending && (
            <Badge variant="outline" className="w-fit gap-1.5 border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
              <Clock3 className="h-3.5 w-3.5" />
              Approval pending
            </Badge>
          )}
        </div>

        {/*   Stats Row   */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Pending Status"
            value={isPending ? 'Awaiting approval' : 'No pending request'}
            icon={Clock3}
          />
          <StatCard
            label="Draft Changes"
            value={`${changedFields.length} field(s) modified`}
            icon={Pencil}
          />
          <StatCard
            label="History"
            value={`${requestHistory.length} total requests`}
            icon={History}
          />
        </div>

        {/*   Info Banner   */}
        <Alert className="border-primary/20 bg-primary/5 [&>svg]:text-primary">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Admin approval required</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            Identity and integration changes are reviewed by an administrator before activation. Image uploads apply instantly.
          </AlertDescription>
        </Alert>

        {/*   Loading State   */}
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-card">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading profile data</p>
            </div>
          </div>
        ) : hospitalRecord ? (
          <>
            {/*   Tabbed Content   */}
            <Tabs defaultValue="edit" className="space-y-5">
              <TabsList className="w-full justify-start rounded-lg bg-muted/60 p-1 sm:w-auto">
                <TabsTrigger value="edit" className="gap-1.5 text-xs sm:text-sm">
                  <Pencil className="h-3.5 w-3.5" /> Edit Profile
                </TabsTrigger>
                <TabsTrigger value="current" className="gap-1.5 text-xs sm:text-sm">
                  <Building2 className="h-3.5 w-3.5" /> Current Profile
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
                  <History className="h-3.5 w-3.5" /> History
                </TabsTrigger>
              </TabsList>

              {/*   Edit Tab   */}
              <TabsContent value="edit" className="space-y-6">

                {/* Image Upload Card */}
                <Card className="overflow-hidden border-border/60 shadow-sm">
                  <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <ImagePlus className="h-4 w-4 text-primary" />
                          Healthcare Image
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Image changes are applied immediately - no admin approval needed.
                        </CardDescription>
                      </div>
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
                        Instant apply
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
                      <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border/60 bg-muted/20">
                        {activeLogoUrl ? (
                          <img src={activeLogoUrl} alt="Healthcare logo" className="h-full w-full object-cover rounded-xl" />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                            <ImagePlus className="h-5 w-5" />
                            <p className="text-[11px]">No image</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <Input
                            key={logoInputVersion}
                            type="file"
                            accept={HOSPITAL_LOGO_ACCEPTED_TYPES.join(',')}
                            onChange={handleLogoFileChange}
                            disabled={uploadingLogo}
                            className="cursor-pointer text-sm"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            JPG, PNG, WEBP, GIF - max 5 MB
                          </p>
                          {logoValidationMessage && (
                            <p className="text-xs font-medium text-destructive">{logoValidationMessage}</p>
                          )}
                          {selectedLogoFile && (
                            <p className="text-xs text-foreground/80">
                              {selectedLogoFile.name} ({(selectedLogoFile.size / (1024 * 1024)).toFixed(2)} MB)
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={clearSelectedLogo} disabled={uploadingLogo || !selectedLogoFile}>
                            Clear
                          </Button>
                          <Button size="sm" onClick={handleUploadHospitalLogo} disabled={uploadingLogo || !selectedLogoFile}>
                            {uploadingLogo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                            Upload
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Pending Alert */}
                {isPending && (
                  <Alert className="border-amber-200 bg-amber-50/80 text-amber-800 [&>svg]:text-amber-600">
                    <Clock3 className="h-4 w-4" />
                    <AlertTitle className="text-sm font-semibold">Pending request active</AlertTitle>
                    <AlertDescription className="text-xs">
                      Submission is locked until the current request is approved or rejected.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Profile Fields */}
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base">Profile Information</CardTitle>
                    <CardDescription>Edit fields below. Sensitive fields require admin approval.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {identityFields.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Identity
                          </h3>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {identityFields.map(renderFormField)}
                        </div>
                      </div>
                    )}

                    {integrationFields.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Integration
                            </h3>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {integrationFields.map(renderFormField)}
                          </div>
                        </div>
                      </>
                    )}

                    <Separator />

                    {/* Reason + Submit */}
                    <div className="space-y-3">
                      <Label htmlFor="update-reason" className="text-xs font-medium">
                        Change summary <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Textarea
                        id="update-reason"
                        rows={2}
                        placeholder="Provide context for reviewers"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={submitting || isPending}
                        className="resize-none text-sm"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSubmitUpdateRequest}
                          disabled={submitting || isPending || changedFields.length === 0}
                          className="gap-1.5"
                        >
                          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                          Submit for Approval
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Diff Preview */}
                {changedFields.length > 0 && (
                  <Card className="border-border/60 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <GitCompareArrows className="h-4 w-4 text-primary" />
                        Change Preview
                      </CardTitle>
                      <CardDescription>Review changes before submission.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="divide-y divide-border/50 rounded-lg border border-border/60 overflow-hidden">
                        {changedFields.map((field) => (
                          <div key={field.key} className="grid gap-1 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {field.label} - Before
                              </p>
                              <p className="mt-1 text-sm text-foreground/70 line-through break-words">
                                {field.oldValue || '(empty)'}
                              </p>
                            </div>
                            <div className="hidden sm:flex sm:items-center sm:pt-4">
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                After
                              </p>
                              <p className="mt-1 text-sm font-medium text-primary break-words">
                                {field.newValue || '(empty)'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/*   Current Profile Tab   */}
              <TabsContent value="current">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="h-4 w-4 text-primary" />
                      Current Healthcare Profile
                    </CardTitle>
                    <CardDescription>Read-only snapshot from the backend.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {visibleFields.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No profile fields returned from backend.
                      </p>
                    ) : (
                      <div className="divide-y divide-border/50 rounded-lg border border-border/60 overflow-hidden">
                        {visibleFields.map((field) => (
                          <div key={field.key} className="grid gap-1 p-3.5 sm:grid-cols-[200px_1fr] sm:items-baseline">
                            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {field.label}
                            </dt>
                            <dd className="text-sm text-foreground break-words">
                              {initialValues[field.key] || '-'}
                            </dd>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/*   History Tab   */}
              <TabsContent value="history" className="space-y-5">

                {/* Pending Request Card */}
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Pending Request</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pendingRequest ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          { label: 'Status', content: <StatusBadge status={pendingRequest.status} /> },
                          { label: 'Requested At', content: <span className="text-sm font-medium">{formatDateTime(pendingRequest.requestedAt)}</span> },
                          { label: 'Submitted By', content: <span className="text-sm font-medium break-words">{requestedBy}</span> },
                          { label: 'Reason', content: <span className="text-sm font-medium break-words">{pendingRequest.reason || '-'}</span> },
                        ].map((item) => (
                          <div key={item.label} className="rounded-lg border border-border/50 bg-muted/10 p-3.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                            <div className="mt-1.5">{item.content}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No pending request is active.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* History List */}
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4 text-primary" />
                      Request History
                    </CardTitle>
                    <CardDescription>Approval timeline and review feedback.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {historyNotice && (
                      <p className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                        {historyNotice}
                      </p>
                    )}

                    {historyLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : requestHistory.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No request history available.
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {/* Timeline */}
                        <div className="rounded-lg border border-border/50 bg-muted/10 p-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</p>
                          <div className="relative space-y-0">
                            {timelineEntries.map((entry, idx) => (
                              <div key={entry.id || `${entry.requestedAt}-${entry.status}`} className="relative flex gap-3 pb-4 last:pb-0">
                                {/* Vertical line */}
                                {idx < timelineEntries.length - 1 && (
                                  <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
                                )}
                                {/* Dot */}
                                <div className={cn(
                                  'relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background',
                                  normalizeRequestStatus(entry.status) === 'approved' ? 'bg-emerald-500' :
                                  normalizeRequestStatus(entry.status) === 'rejected' ? 'bg-rose-500' :
                                  normalizeRequestStatus(entry.status) === 'pending' ? 'bg-amber-500' : 'bg-muted-foreground',
                                )} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{formatStatusLabel(entry.status)}</span>
                                    <span className="text-[11px] text-muted-foreground">{formatDateTime(entry.requestedAt)}</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground break-words">
                                    {resolveChangedFieldsText(entry)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-hidden rounded-lg border border-border/50">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Date</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Changed Fields</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Reviewed By</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Comment</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {requestHistory.map((entry) => (
                                  <TableRow key={entry.id || `${entry.requestedAt}-${entry.status}`}>
                                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(entry.requestedAt)}</TableCell>
                                    <TableCell className="max-w-[220px] text-xs break-words">{resolveChangedFieldsText(entry)}</TableCell>
                                    <TableCell><StatusBadge status={entry.status} /></TableCell>
                                    <TableCell className="text-xs">{entry.reviewedByName || '-'}</TableCell>
                                    <TableCell className="max-w-[200px] text-xs break-words">{entry.reviewComment || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card className="border-border/60">
            <CardContent className="py-10">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Healthcare profile unavailable</h3>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Unable to resolve your healthcare context for update workflow operations.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default HospitalUpdateRequests;