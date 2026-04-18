import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Globe,
  Hash,
  Calendar,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import registrationService, { type ReviewIssueType } from '@/services/registrationService';
import { findHospitalAdminDraft } from '@/services/hospitalAdminDraftStore';
import HospitalLogo from '@/components/HospitalLogo';
import RegistrationApiTestConsole from '@/components/admin/RegistrationApiTestConsole';
import ReviewEmailDialog from '@/components/admin/ReviewEmailDialog';
// ...existing code...

interface RegistrationDetail {
  id: string;
  name: string;
  logo?: string | null;
  registration_number: string;
  email: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  hospital_type?: string;
  facility_type?: string;
  facility_classification?: string;
  data_submission_type?: string;
  inventory_source_type?: string;
  has_existing_api?: boolean;
  needs_inventory_dashboard?: boolean;
  status: string;
  submitted_at: string;
  reviewed_at?: string | null;
  rejection_reason?: string;
  notes?: string;
  contact_name?: string;
  admin_name?: string;
  admin_email?: string;
  admin_phone?: string;
  // API integration fields (masked by backend)
  api_base_url?: string;
  api_auth_type?: string;
  api_key?: string;
  api_username?: string;
  api_password?: string;
  bearer_token?: string;
}

interface RegistrationActionResult {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

interface ReviewEmailHistoryItem {
  id?: string;
  event_type?: string;
  actor_email?: string;
  subject?: string;
  message?: string;
  recipient_email?: string;
  mark_changes_requested?: boolean;
  metadata?: {
    issue_type?: string;
    failed_apis?: string[];
  };
  created_at?: string;
}

type FailedApiKey = 'resources' | 'bed' | 'blood' | 'staff' | 'sales';

const REVIEW_ISSUE_TYPE_OPTIONS: Array<{ value: ReviewIssueType; label: string }> = [
  { value: 'API_VALIDATION', label: 'API Validation' },
  { value: 'ENDPOINT_CONFIGURATION', label: 'Endpoint Configuration' },
  { value: 'MISSING_REQUIRED_FIELDS', label: 'Missing Required Fields' },
  { value: 'CONTACT_INFORMATION', label: 'Contact Information' },
  { value: 'GENERAL', label: 'General' },
];

const FAILED_API_OPTIONS: Array<{ key: FailedApiKey; label: string }> = [
  { key: 'resources', label: 'Resources' },
  { key: 'bed', label: 'Bed' },
  { key: 'blood', label: 'Blood' },
  { key: 'staff', label: 'Staff' },
  { key: 'sales', label: 'Sales' },
];

const FAILED_API_LABEL_MAP: Record<FailedApiKey, string> = FAILED_API_OPTIONS.reduce(
  (acc, option) => {
    acc[option.key] = option.label;
    return acc;
  },
  {} as Record<FailedApiKey, string>,
);

const normalizeFailedApiKey = (rawKey: string): FailedApiKey | null => {
  const normalized = rawKey.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'resources' || normalized === 'resource') return 'resources';
  if (normalized === 'bed' || normalized === 'beds') return 'bed';
  if (normalized === 'blood') return 'blood';
  if (normalized === 'staff') return 'staff';
  if (normalized === 'sales' || normalized === 'sale') return 'sales';
  return null;
};

const toFailedApiLabels = (failedApis: string[]): string[] => {
  return Array.from(
    new Set(
      failedApis
        .map((apiKey) => normalizeFailedApiKey(apiKey))
        .filter((apiKey): apiKey is FailedApiKey => apiKey !== null)
        .map((apiKey) => FAILED_API_LABEL_MAP[apiKey]),
    ),
  );
};

const buildReviewMessageDraft = (facilityName: string, failedApis: FailedApiKey[]) => {
  const failedLabels = failedApis.map((api) => FAILED_API_LABEL_MAP[api]);
  const bulletList = failedLabels.map((label) => `- ${label}`).join('\n');
  return [
    `Dear ${facilityName} integration team,`,
    '',
    'During registration review, the following API checks failed:',
    bulletList || '- (No APIs selected)',
    '',
    'Please verify your endpoint configuration, credentials, and response contract, then update and resubmit.',
    '',
    'Regards,',
    'System Administration Team',
  ].join('\n');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
};

const formatFieldErrors = (errors?: Record<string, string[]>): string => {
  if (!errors) return '';
  const lines = Object.entries(errors)
    .map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages.join(' ') : String(messages || '');
      return text ? `${field}: ${text}` : '';
    })
    .filter(Boolean);

  return lines.join(' | ');
};

const parseReviewEmailHistory = (payload: unknown): ReviewEmailHistoryItem[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  const candidates = [
    root.history,
    data.history,
    root.results,
    data.results,
    Array.isArray(payload) ? payload : null,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    return candidate
      .map((item) => {
        const entry = asRecord(item);
        const metadata = asRecord(entry.metadata);

        const failedApisFromMetadata = asStringArray(metadata.failed_apis);
        const failedApis = failedApisFromMetadata.length > 0
          ? failedApisFromMetadata
          : asStringArray(entry.failed_apis);

        const issueType = asString(metadata.issue_type) || asString(entry.issue_type);
        const markChangesRequested =
          typeof entry.mark_changes_requested === 'boolean'
            ? entry.mark_changes_requested
            : typeof metadata.mark_changes_requested === 'boolean'
              ? metadata.mark_changes_requested
              : undefined;

        return {
          id: asString(entry.id),
          event_type: asString(entry.event_type) || asString(entry.type),
          actor_email: asString(entry.actor_email) || asString(entry.sent_by),
          subject: asString(entry.subject),
          message: asString(entry.message),
          recipient_email: asString(entry.recipient_email) || asString(entry.to_email),
          mark_changes_requested: markChangesRequested,
          metadata: {
            issue_type: issueType,
            failed_apis: failedApis,
          },
          created_at: asString(entry.created_at) || asString(entry.sent_at),
        } as ReviewEmailHistoryItem;
      })
      .filter((entry) => Boolean(entry.created_at || entry.subject || entry.message));
  }

  return [];
};

const normalizeStatus = (status?: string | null) => (status || '').toLowerCase();

const DetailRow = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) => (
  <div className="flex items-start gap-3 py-3 border-b last:border-0">
    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium break-words">{value || <span className="text-muted-foreground italic">—</span>}</p>
    </div>
  </div>
);

const HospitalRegistrationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const seededRegistration = (location.state as { registration?: RegistrationDetail } | null)?.registration ?? null;
  const [registration, setRegistration] = useState<RegistrationDetail | null>(seededRegistration);
  const [isLoading, setIsLoading] = useState(!seededRegistration);

  // Dialog states
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [approvalSummary, setApprovalSummary] = useState<string>('');

  const [reviewSubject, setReviewSubject] = useState('Registration Review Required');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewIssueType, setReviewIssueType] = useState<ReviewIssueType>('API_VALIDATION');
  const [selectedFailedApis, setSelectedFailedApis] = useState<FailedApiKey[]>([]);
  const [detectedFailedApis, setDetectedFailedApis] = useState<FailedApiKey[]>([]);
  const [markChangesRequested, setMarkChangesRequested] = useState(true);
  const [reviewMessageTouched, setReviewMessageTouched] = useState(false);
  const [sendReviewLoading, setSendReviewLoading] = useState(false);
  const [reviewHistoryLoading, setReviewHistoryLoading] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<ReviewEmailHistoryItem[]>([]);

  const adminDraft = registration
    ? findHospitalAdminDraft({
        registration_id: registration.id,
        registration_number: registration.registration_number,
        registration_email: registration.email,
      })
    : null;

  const adminName = registration?.admin_name || adminDraft?.admin_name;
  const adminEmail = registration?.admin_email || adminDraft?.admin_email;
  const adminPhone = registration?.admin_phone || adminDraft?.admin_phone;
  const reviewRecipientEmail = registration?.email || adminEmail || '';

  const reviewDraftMessage = useMemo(() => {
    if (!registration || detectedFailedApis.length === 0) return '';
    return buildReviewMessageDraft(registration.name, detectedFailedApis);
  }, [registration, detectedFailedApis]);

  const handleFailedApisChange = useCallback((failedApis: string[]) => {
    const normalized = Array.from(
      new Set(
        failedApis
          .map((key) => normalizeFailedApiKey(key))
          .filter((key): key is FailedApiKey => key !== null),
      ),
    );
    setDetectedFailedApis((previous) => {
      if (
        previous.length === normalized.length &&
        previous.every((value, index) => value === normalized[index])
      ) {
        return previous;
      }
      return normalized;
    });
  }, []);

  const toggleFailedApi = (apiKey: FailedApiKey, checked: boolean) => {
    setSelectedFailedApis((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, apiKey]));
      }
      return prev.filter((item) => item !== apiKey);
    });
  };

  useEffect(() => {
    if (id) loadDetail(id);
  }, [id]);

  useEffect(() => {
    if (id) {
      void loadReviewEmailHistory(id);
    }
  }, [id]);

  useEffect(() => {
    if (detectedFailedApis.length === 0) return;

    setSelectedFailedApis((prev) => Array.from(new Set([...prev, ...detectedFailedApis])));
    setReviewIssueType('API_VALIDATION');

    if (!reviewSubject.trim()) {
      setReviewSubject('Registration Review Required');
    }

    if (!reviewMessageTouched && reviewDraftMessage && reviewMessage !== reviewDraftMessage) {
      setReviewMessage(reviewDraftMessage);
    }
  }, [detectedFailedApis, reviewDraftMessage, reviewMessageTouched, reviewMessage, reviewSubject]);

  const loadDetail = async (registrationId: string) => {
    setIsLoading(true);
    try {
      const data = (await registrationService.getHospital(registrationId)) as RegistrationDetail;
      setRegistration(data);
    } catch (error) {
      if (!registration) {
        try {
          const list = await registrationService.listHospitals();
          const listRecord =
            list && typeof list === 'object'
              ? (list as Record<string, unknown>)
              : null;
          const nestedData =
            listRecord?.data && typeof listRecord.data === 'object'
              ? (listRecord.data as Record<string, unknown>)
              : null;

          const listData: RegistrationDetail[] = Array.isArray(list)
            ? list
            : Array.isArray(listRecord?.data)
              ? (listRecord.data as RegistrationDetail[])
              : Array.isArray(listRecord?.results)
                ? (listRecord.results as RegistrationDetail[])
                : Array.isArray(nestedData?.results)
                  ? (nestedData.results as RegistrationDetail[])
                  : [];
          const fallback = listData.find((item) => String(item.id) === registrationId);
          if (fallback) {
            setRegistration(fallback);
          }
        } catch {
          // Ignore fallback errors and show the original toast.
        }
      }
      toast({
        title: 'Error',
        description: 'Failed to load registration details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadReviewEmailHistory = async (registrationId: string) => {
    setReviewHistoryLoading(true);
    try {
      const historyPayload = await registrationService.getReviewEmailHistory(registrationId);
      setReviewHistory(parseReviewEmailHistory(historyPayload));
    } catch {
      setReviewHistory([]);
    } finally {
      setReviewHistoryLoading(false);
    }
  };

  const applyFailedApiDraft = () => {
    if (!registration || detectedFailedApis.length === 0) {
      toast({
        title: 'No failed APIs detected',
        description: 'Run API checks first to auto-fill review draft content.',
      });
      return;
    }

    setSelectedFailedApis(Array.from(new Set([...selectedFailedApis, ...detectedFailedApis])));
    setReviewIssueType('API_VALIDATION');
    setReviewSubject((current) => current.trim() || 'Registration Review Required');
    setReviewMessage(buildReviewMessageDraft(registration.name, detectedFailedApis));
    setReviewMessageTouched(false);
  };

  const handleSendReviewEmail = async () => {
    if (!registration) return;

    const subject = reviewSubject.trim();
    const message = reviewMessage.trim();
    if (!subject || !message) {
      toast({
        title: 'Missing review details',
        description: 'Subject and message are required before sending a review email.',
        variant: 'destructive',
      });
      return;
    }

    setSendReviewLoading(true);
    try {
      const failedApisForPayload = reviewIssueType === 'API_VALIDATION'
        ? (detectedFailedApis.length > 0 ? detectedFailedApis : undefined)
        : selectedFailedApis.length > 0
          ? selectedFailedApis
          : undefined;

      const result = (await registrationService.sendReviewEmail(registration.id, {
        subject,
        message,
        issue_type: reviewIssueType,
        failed_apis: failedApisForPayload,
        mark_changes_requested: markChangesRequested,
      })) as RegistrationActionResult;

      if (result?.success === false) {
        const validationMessage = formatFieldErrors(result?.errors);
        toast({
          title: 'Send failed',
          description: validationMessage
            ? `${result?.message || 'Unable to send review email.'} ${validationMessage}`
            : result?.message || 'Unable to send review email.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Review email sent',
        description: `Feedback email has been sent to ${reviewRecipientEmail || 'the registration contact'}.`,
      });

      setReviewMessageTouched(false);
      await loadReviewEmailHistory(registration.id);
      await loadDetail(registration.id);
    } catch {
      toast({
        title: 'Send failed',
        description: 'Unexpected error while sending review email.',
        variant: 'destructive',
      });
    } finally {
      setSendReviewLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!registration) return;
    setActionLoading(true);
    setApprovalSummary('');
    try {
      const result = (await registrationService.approveHospital(
        registration.id,
        approvalNotes || undefined
      )) as RegistrationActionResult;
      if (result.success) {
        const postApprovalSummary = adminEmail
          ? `Facility approved. Backend will provision the facility admin account and send setup email to ${adminEmail}.`
          : 'Facility approved. Backend will provision the facility admin account and send setup email as defined by the approval workflow.';

        toast({
          title: 'Facility Approved',
          description: `${registration.name} has been approved and is now active on the platform.`,
        });
        setApprovalSummary(postApprovalSummary);
        setApproveOpen(false);
        // Refresh to show updated status
        await loadDetail(registration.id);
      } else {
        toast({
          title: 'Approval Failed',
          description: result?.message || 'Could not approve the registration.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Unexpected error during approval.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!registration) return;
    setActionLoading(true);
    try {
      const result = (await registrationService.rejectHospital(
        registration.id,
        rejectionReason
      )) as RegistrationActionResult;
      if (result.success) {
        toast({
          title: 'Facility Rejected',
          description: `${registration.name} registration has been rejected.`,
        });
        setRejectOpen(false);
        setRejectionReason('');
        await loadDetail(registration.id);
      } else {
        toast({
          title: 'Rejection Failed',
          description: result?.message || 'Could not reject the registration.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Unexpected error during rejection.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    const map: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; icon: typeof Clock }> = {
      pending_approval: { label: 'Pending Approval', variant: 'secondary', icon: Clock },
      pending: { label: 'Pending', variant: 'secondary', icon: Clock },
      active: { label: 'Approved / Active', variant: 'default', icon: CheckCircle },
      approved: { label: 'Approved', variant: 'default', icon: CheckCircle },
      rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
    };
    const cfg = map[normalized] ?? { label: status, variant: 'outline' as const, icon: Clock };
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="flex items-center gap-1 text-sm px-3 py-1">
        <Icon className="h-4 w-4" />
        {cfg.label}
      </Badge>
    );
  };

  const isPending = ['pending_approval', 'pending'].includes(
    normalizeStatus(registration?.status)
  );

  if (isLoading && !registration) {
    return (
      <AppLayout title="Registration Details">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!registration) {
    return (
      <AppLayout title="Registration Details">
        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground gap-3">
          <Building2 className="h-14 w-14 opacity-40" />
          <p>Registration not found.</p>
          <Button variant="outline" onClick={() => navigate('/admin/hospital-registrations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </div>
      </AppLayout>
    );
  }

  const normalizedDataSubmissionType = (registration.data_submission_type || '').trim().toLowerCase();
  const normalizedInventorySourceType = (registration.inventory_source_type || '').trim().toUpperCase();
  const normalizedApiAuthType = (registration.api_auth_type || '').trim().toLowerCase();
  const hasConfiguredAuthType = normalizedApiAuthType !== '' && normalizedApiAuthType !== 'none';
  const hasSubmittedApiBaseUrl = Boolean((registration.api_base_url || '').trim());
  const hasSubmittedApiCredentials = Boolean(
    (registration.api_key || '').trim() ||
      (registration.api_username || '').trim() ||
      (registration.api_password || '').trim() ||
      (registration.bearer_token || '').trim()
  );
  const hasApiConfig = hasSubmittedApiBaseUrl || hasConfiguredAuthType || hasSubmittedApiCredentials;
  const shouldShowApiVerificationConsole =
    registration.has_existing_api === true ||
    normalizedDataSubmissionType === 'api' ||
    normalizedInventorySourceType === 'API' ||
    hasApiConfig;

  return (
    <AppLayout
      title="Registration Details"
      // subtitle="Platform Admin — Healthcare onboarding review"
    >
      <div className="space-y-6 max-w-4xl">
        {/* Back + status header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/hospital-registrations')}
            className="-ml-2 w-fit"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Registration Requests
          </Button>

          <div className="flex items-center gap-3">
            {getStatusBadge(registration.status)}
            <Button variant="outline" onClick={() => setReviewDialogOpen(true)}>
              <Mail className="h-4 w-4 mr-2" />
              Review Email
            </Button>
            {isPending && (
              <>
                <Button
                  onClick={() => setApproveOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Facility
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Facility
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Platform admin banner */}
        {/* <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Only <strong>Platform Admins</strong> can approve or reject healthcare registrations.
          </span>
        </div> */}

        {/* Details grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Healthcare info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Facility Information</CardTitle>
              <CardDescription>Core registration data submitted by the applicant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="pb-3 border-b mb-1">
                <HospitalLogo name={registration.name} logo={registration.logo} className="h-16 w-16" />
              </div>
              <DetailRow icon={Building2} label="Facility Name" value={registration.name} />
              <DetailRow
                icon={Hash}
                label="Registration Number"
                value={registration.registration_number}
              />
              <DetailRow
                icon={Building2}
                label="Facility Type"
                value={(registration.facility_type || registration.hospital_type)?.replace(/_/g, ' ')}
              />
              <DetailRow icon={Building2} label="Facility Classification" value={registration.facility_classification} />
              {(registration.contact_name || registration.admin_name) && (
                <DetailRow
                  icon={Building2}
                  label="Contact / Admin Name"
                  value={registration.contact_name ?? registration.admin_name}
                />
              )}
            </CardContent>
          </Card>

          {/* Contact info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Information</CardTitle>
              <CardDescription>How to reach the healthcare representative</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <DetailRow icon={Mail} label="Email" value={registration.email} />
              <DetailRow icon={Phone} label="Phone" value={registration.phone} />
              <DetailRow icon={Globe} label="Website" value={registration.website} />
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DetailRow icon={MapPin} label="Address" value={registration.address} />
              <DetailRow icon={MapPin} label="City" value={registration.city} />
              <DetailRow icon={MapPin} label="State / Province" value={registration.state} />
              <DetailRow icon={MapPin} label="Country" value={registration.country} />
            </CardContent>
          </Card>

          {/* Review status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DetailRow
                icon={Calendar}
                label="Submitted At"
                value={
                  registration.submitted_at
                    ? new Date(registration.submitted_at).toLocaleString()
                    : undefined
                }
              />
              <DetailRow
                icon={Calendar}
                label="Reviewed At"
                value={
                  registration.reviewed_at
                    ? new Date(registration.reviewed_at).toLocaleString()
                    : undefined
                }
              />
              {registration.rejection_reason && (
                <DetailRow
                  icon={XCircle}
                  label="Rejection Reason"
                  value={registration.rejection_reason}
                />
              )}
              {registration.notes && (
                <DetailRow
                  icon={CheckCircle}
                  label="Approval Notes"
                  value={registration.notes}
                />
              )}
            </CardContent>
          </Card>

   
          {/* Frontend-only onboarding admin draft */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Facility Admin Details</CardTitle>
              <CardDescription>
                Admin contact details used for onboarding and account provisioning
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <DetailRow icon={Building2} label="Admin Name" value={adminName || undefined} />
              <DetailRow icon={Mail} label="Admin Email" value={adminEmail || undefined} />
              <DetailRow icon={Phone} label="Admin Phone" value={adminPhone || undefined} />
              {!registration?.admin_email && adminDraft?.admin_email ? (
                <p className="text-xs text-muted-foreground pt-2">
                  Showing locally saved draft values because backend admin fields were not returned.
                </p>
              ) : null}
            </CardContent>
          </Card>       

          {/* API integration (if present) */}
          {(registration.api_base_url || registration.api_auth_type || registration.inventory_source_type || registration.data_submission_type) && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Source and Integration Config</CardTitle>
                <CardDescription>
                  Submitted source mode and optional external API details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow icon={Hash} label="Inventory Source Type" value={registration.inventory_source_type} />
                <DetailRow icon={Hash} label="Data Submission Type" value={registration.data_submission_type} />
                <DetailRow
                  icon={CheckCircle}
                  label="Needs Inventory Dashboard"
                  value={typeof registration.needs_inventory_dashboard === 'boolean' ? String(registration.needs_inventory_dashboard) : undefined}
                />
                {shouldShowApiVerificationConsole ? (
                  <>
                    <DetailRow icon={Globe} label="API Base URL" value={registration.api_base_url} />
                    <DetailRow
                      icon={Hash}
                      label="Auth Type"
                      value={registration.api_auth_type}
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Optional API verification checks for submitted integration */}
          {shouldShowApiVerificationConsole ? (
            <RegistrationApiTestConsole
              registrationId={registration.id}
              registration={registration}
              onFailedApisChange={handleFailedApisChange}
            />
          ) : null}

        </div>

        <ReviewEmailDialog
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          title="Review / Send Feedback to Healthcare"
          description="Send a formal review email to the registration contact without changing approval or rejection workflow."
          recipientEmail={reviewRecipientEmail}
          subject={reviewSubject}
          message={reviewMessage}
          onSubjectChange={setReviewSubject}
          onMessageChange={(value) => {
            setReviewMessage(value);
            setReviewMessageTouched(true);
          }}
          onSend={handleSendReviewEmail}
          sending={sendReviewLoading}
          disableSend={!reviewRecipientEmail}
          messagePlaceholder="Describe what should be corrected before approval."
          sendLabel="Send Review Email"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="review-issue-type">Issue Type</Label>
              <Select
                value={reviewIssueType}
                onValueChange={(value) => setReviewIssueType(value as ReviewIssueType)}
              >
                <SelectTrigger id="review-issue-type">
                  <SelectValue placeholder="Select issue type" />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_ISSUE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Failed APIs</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyFailedApiDraft}
                disabled={detectedFailedApis.length === 0}
              >
                Use Failed API Results
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FAILED_API_OPTIONS.map((option) => {
                const checked = selectedFailedApis.includes(option.key);
                const recentlyFailed = detectedFailedApis.includes(option.key);

                return (
                  <label
                    key={option.key}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleFailedApi(option.key, Boolean(value))}
                      />
                      <span>{option.label}</span>
                    </span>
                    {recentlyFailed ? (
                      <Badge variant="destructive" className="text-[10px] uppercase">
                        Failed
                      </Badge>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={markChangesRequested}
              onCheckedChange={(value) => setMarkChangesRequested(Boolean(value))}
            />
            <span>Mark changes requested while keeping status as pending approval</span>
          </label>

          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <p className="text-sm font-medium">Review Email History</p>
            {reviewHistoryLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading review history...
              </div>
            ) : reviewHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">No review emails have been sent yet.</p>
            ) : (
              <div className="space-y-2">
                {reviewHistory.map((entry) => {
                  const historyFailedApis = Array.isArray(entry.metadata?.failed_apis)
                    ? entry.metadata?.failed_apis
                    : [];
                  const historyFailedApiLabels = toFailedApiLabels(historyFailedApis);
                  const issueType = entry.metadata?.issue_type || 'GENERAL';

                  return (
                    <div key={entry.id || `${entry.actor_email}-${entry.created_at}`} className="rounded-md border bg-background px-3 py-2 text-xs space-y-1">
                      <p>
                        <span className="font-medium">Sent At:</span>{' '}
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A'}
                      </p>
                      <p>
                        <span className="font-medium">Actor:</span> {entry.actor_email || 'Unknown'}
                      </p>
                      <p>
                        <span className="font-medium">Issue Type:</span>{' '}
                        {issueType}
                      </p>
                      <p>
                        <span className="font-medium">Recipient:</span>{' '}
                        {entry.recipient_email || 'N/A'}
                      </p>
                      <p>
                        <span className="font-medium">Subject:</span>{' '}
                        {entry.subject || 'N/A'}
                      </p>
                      <p>
                        <span className="font-medium">Changes Requested:</span>{' '}
                        {typeof entry.mark_changes_requested === 'boolean'
                          ? entry.mark_changes_requested ? 'Yes' : 'No'
                          : 'N/A'}
                      </p>
                      <p>
                        <span className="font-medium">Failed APIs:</span>{' '}
                        {historyFailedApiLabels.length > 0 ? historyFailedApiLabels.join(', ') : 'None'}
                      </p>
                      {entry.message ? (
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          <span className="font-medium text-foreground">Message:</span>{' '}
                          {entry.message}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ReviewEmailDialog>

        {approvalSummary && (
          <div className="rounded-lg border px-4 py-3 text-sm bg-muted/40">
            {approvalSummary}
          </div>
        )}
      </div>

      {/* ── Approve dialog ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Approve Facility Registration
            </DialogTitle>
            <DialogDescription>
              This will create a facility record and grant the applicant access to the platform.
              This action will notify the applicant.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Healthcare:</span>
              <span className="font-medium">{registration.name}</span>
              <span className="text-muted-foreground">Reg. Number:</span>
              <span className="font-mono">{registration.registration_number}</span>
              <span className="text-muted-foreground">Email:</span>
              <span>{registration.email}</span>
            </div>

            <div className="pt-2">
              <Label htmlFor="approve-notes">Approval Notes (optional)</Label>
              <Textarea
                id="approve-notes"
                placeholder="Any notes to include with the approval…"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveOpen(false);
                setApprovalNotes('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve Facility
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject Facility Registration
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this registration. The applicant will be
              notified.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Healthcare:</span>
              <span className="font-medium">{registration.name}</span>
              <span className="text-muted-foreground">Reg. Number:</span>
              <span className="font-mono">{registration.registration_number}</span>
            </div>

            <div className="pt-2">
              <Label htmlFor="reject-reason">Reason for Rejection *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Explain why this registration is being rejected…"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectOpen(false);
                setRejectionReason('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting…
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject Healthcare
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default HospitalRegistrationDetail;
