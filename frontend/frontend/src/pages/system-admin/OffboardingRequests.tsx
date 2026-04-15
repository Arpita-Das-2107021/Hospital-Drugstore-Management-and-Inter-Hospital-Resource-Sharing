import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hospitalsApi, offboardingApi } from '@/services/api';
import ReviewEmailDialog from '@/components/admin/ReviewEmailDialog';

interface OffboardingRequestItem {
  id: string;
  hospital?: string;
  hospital_name: string;
  requested_by_name?: string;
  requested_by_email?: string;
  hospital_email?: string;
  admin_email?: string;
  reason: string;
  status: string;
  created_at?: string;
  admin_notes?: string;
  unresolved_blockers?: string[];
}

type UnknownRecord = Record<string, unknown>;
type ApiErrorWithPayload = Error & {
  payload?: unknown;
};

const BLOCKER_KEYS = [
  'blocker',
  'unresolved',
  'active_shipments',
  'pending_resource_requests',
  'operations_blockers',
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function toReadableKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').trim();
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function normalizeResponseList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (isRecord(data) && Array.isArray(data.results)) {
    return data.results;
  }
  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  return [];
}

function flattenMessages(value: unknown, keyHint?: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenMessages(entry, keyHint));
  }

  if (isRecord(value)) {
    const direct = [
      toText(value.message),
      toText(value.detail),
      toText(value.reason),
      toText(value.description),
      toText(value.code),
    ].filter(Boolean);

    if (direct.length > 0) {
      return direct;
    }

    return Object.entries(value).flatMap(([nestedKey, nestedValue]) =>
      flattenMessages(nestedValue, nestedKey)
    );
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n;]+/)
      .map((part) => part.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'number') {
    if (!keyHint || value <= 0) {
      return [];
    }
    return [`${toReadableKey(keyHint)}: ${value}`];
  }

  if (typeof value === 'boolean') {
    return value && keyHint ? [toReadableKey(keyHint)] : [];
  }

  return [];
}

function extractBlockersFromPayload(payload: unknown): string[] {
  const blockers: string[] = [];

  const visit = (value: unknown, keyHint = '') => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, keyHint));
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    Object.entries(value).forEach(([key, nestedValue]) => {
      const lower = key.toLowerCase();
      const looksLikeBlocker = BLOCKER_KEYS.some((candidate) => lower.includes(candidate));

      if (looksLikeBlocker) {
        blockers.push(...flattenMessages(nestedValue, key));
      }

      if (
        lower === 'error' ||
        lower === 'errors' ||
        lower === 'detail' ||
        lower === 'details' ||
        lower.includes('blocker')
      ) {
        visit(nestedValue, key);
      }
    });
  };

  visit(payload);

  return [...new Set(blockers.map((entry) => entry.trim()).filter(Boolean))];
}

function extractBlockersFromMessage(message: string): string[] {
  const normalized = message.toLowerCase();
  const matches: string[] = [];

  if (normalized.includes('active_shipments')) {
    matches.push('active shipments');
  }
  if (normalized.includes('pending_resource_requests')) {
    matches.push('pending resource requests');
  }

  if (matches.length === 0 && normalized.includes('blocker')) {
    matches.push(...flattenMessages(message));
  }

  return [...new Set(matches.filter(Boolean))];
}

function extractBlockersFromError(error: unknown): string[] {
  if (error instanceof Error) {
    const apiError = error as ApiErrorWithPayload;
    const payloadBlockers = extractBlockersFromPayload(apiError.payload);
    if (payloadBlockers.length > 0) {
      return payloadBlockers;
    }
    return extractBlockersFromMessage(error.message);
  }

  if (isRecord(error)) {
    return extractBlockersFromPayload(error);
  }

  return [];
}

function buildReviewSubject(item: OffboardingRequestItem): string {
  return `Offboarding Review Required - ${item.hospital_name}`;
}

function buildReviewMessageDraft(item: OffboardingRequestItem): string {
  const requestedBy = item.requested_by_name || 'healthcare team';

  return [
    `Hello ${requestedBy},`,
    '',
    `Your offboarding request for ${item.hospital_name} needs additional review updates.`,
    '',
    'Submitted reason:',
    item.reason || '(No reason provided)',
    '',
    'Please review the feedback and update your request details as needed.',
    '',
    'Regards,',
    'System Administration Team',
  ].join('\n');
}

function extractRecipientFromRequest(item: OffboardingRequestItem): string {
  return (
    toText(item.hospital_email) ||
    toText(item.admin_email) ||
    toText(item.requested_by_email)
  );
}

function mapRequestItem(payload: unknown): OffboardingRequestItem {
  const item = isRecord(payload) ? payload : {};
  const hospital = isRecord(item.hospital) ? item.hospital : {};
  const requestedBy = isRecord(item.requested_by) ? item.requested_by : {};

  return {
    id: toText(item.id),
    hospital: toText(item.hospital) || toText(hospital.id),
    hospital_name: toText(item.hospital_name) || toText(hospital.name) || 'Healthcare',
    requested_by_name: toText(item.requested_by_name) || toText(requestedBy.full_name) || undefined,
    requested_by_email: toText(item.requested_by_email) || toText(requestedBy.email) || undefined,
    hospital_email: toText(item.hospital_email) || toText(hospital.email) || undefined,
    admin_email: toText(item.admin_email) || toText(hospital.admin_email) || undefined,
    reason: toText(item.reason),
    status: toText(item.status) || 'pending',
    created_at: toText(item.created_at) || toText(item.requested_at) || undefined,
    admin_notes: toText(item.admin_notes) || undefined,
    unresolved_blockers: extractBlockersFromPayload(item),
  };
}

export default function OffboardingRequests() {
  const { toast } = useToast();
  const [items, setItems] = useState<OffboardingRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [approvalBlockers, setApprovalBlockers] = useState<Record<string, string[]>>({});
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingItem, setReviewingItem] = useState<OffboardingRequestItem | null>(null);
  const [reviewRecipientEmail, setReviewRecipientEmail] = useState('');
  const [reviewSubject, setReviewSubject] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewRecipientLoading, setReviewRecipientLoading] = useState(false);
  const [sendReviewLoading, setSendReviewLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const statusOptions = useMemo(() => {
    const uniqueStatuses = Array.from(
      new Set(items.map((item) => String(item.status || 'pending').toLowerCase()).filter(Boolean)),
    );

    return ['all', ...uniqueStatuses];
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      const normalizedStatus = String(item.status || 'pending').toLowerCase();
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        item.hospital_name,
        item.requested_by_name,
        item.requested_by_email,
        item.reason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [items, searchTerm, statusFilter]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response: unknown = await offboardingApi.listAdminRequests();
      const raw = normalizeResponseList(response);
      const mapped = raw.map(mapRequestItem).filter((item) => Boolean(item.id));
      const blockersById: Record<string, string[]> = {};

      mapped.forEach((item) => {
        if (item.unresolved_blockers && item.unresolved_blockers.length > 0) {
          blockersById[item.id] = item.unresolved_blockers;
        }
      });

      setItems(mapped);
      setApprovalBlockers(blockersById);
    } catch (err: unknown) {
      toast({
        title: 'Failed to load offboarding requests',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'destructive',
      });
      setItems([]);
      setApprovalBlockers({});
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const decide = async (item: OffboardingRequestItem, decision: 'approve' | 'reject') => {
    setProcessingId(item.id);
    try {
      if (decision === 'approve') {
        await offboardingApi.approve(item.id, decisionReason[item.id] || undefined);
        setApprovalBlockers((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        toast({
          title: 'Offboarding approved',
          description: 'Request approved. Notification email should be sent by backend workflow.',
        });
      } else {
        await offboardingApi.reject(item.id, decisionReason[item.id] || 'Rejected by system administrator');
        setApprovalBlockers((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        toast({
          title: 'Offboarding rejected',
          description: 'Request rejected. Notification email should be sent by backend workflow.',
        });
      }
      await loadRequests();
    } catch (err: unknown) {
      if (decision === 'approve') {
        let blockers = extractBlockersFromError(err);

        if (blockers.length === 0) {
          try {
            const detailPayload = await offboardingApi.getById(item.id);
            blockers = extractBlockersFromPayload(detailPayload);
          } catch {
            // Keep fallback behavior if detail retrieval fails.
          }
        }

        if (blockers.length > 0) {
          setApprovalBlockers((prev) => ({
            ...prev,
            [item.id]: blockers,
          }));

          toast({
            title: 'Approval blocked by unresolved operations',
            description: blockers.slice(0, 2).join(', '),
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Decision failed',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const fetchRecipientFromHospital = async (hospitalId: string): Promise<string> => {
    try {
      const response: unknown = await hospitalsApi.getById(hospitalId);
      const root = isRecord(response) ? response : {};
      const nestedData = isRecord(root.data) ? root.data : null;
      const source = nestedData && Object.keys(nestedData).length > 0 ? nestedData : root;

      return toText(source.email) || toText(source.admin_email);
    } catch {
      return '';
    }
  };

  const openReviewDialog = async (item: OffboardingRequestItem) => {
    setReviewingItem(item);
    setReviewDialogOpen(true);
    setReviewSubject(buildReviewSubject(item));
    setReviewMessage(buildReviewMessageDraft(item));

    const initialRecipient = extractRecipientFromRequest(item);
    setReviewRecipientEmail(initialRecipient);

    if (initialRecipient || !item.hospital) {
      setReviewRecipientLoading(false);
      return;
    }

    setReviewRecipientLoading(true);
    const resolvedRecipient = await fetchRecipientFromHospital(item.hospital);
    setReviewRecipientEmail(resolvedRecipient);
    setReviewRecipientLoading(false);

    if (!resolvedRecipient) {
      toast({
        title: 'Recipient unavailable',
        description: 'No recipient email was found for this offboarding request.',
        variant: 'destructive',
      });
    }
  };

  const handleReviewDialogOpenChange = (open: boolean) => {
    setReviewDialogOpen(open);

    if (!open) {
      setReviewingItem(null);
      setReviewRecipientEmail('');
      setReviewSubject('');
      setReviewMessage('');
      setReviewRecipientLoading(false);
      setSendReviewLoading(false);
    }
  };

  const handleSendReviewEmail = async () => {
    if (!reviewingItem) {
      return;
    }

    const recipientEmail = reviewRecipientEmail.trim();
    const subject = reviewSubject.trim();
    const message = reviewMessage.trim();

    if (!recipientEmail || !subject || !message) {
      toast({
        title: 'Missing review details',
        description: 'Recipient email, subject, and message are required before sending.',
        variant: 'destructive',
      });
      return;
    }

    setSendReviewLoading(true);
    try {
      await offboardingApi.sendReviewEmail(reviewingItem.id, {
        recipient_email: recipientEmail,
        subject,
        message,
      });

      toast({
        title: 'Review email sent',
        description: `Review email has been sent to ${recipientEmail}.`,
      });

      handleReviewDialogOpenChange(false);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
          ? ((err as { status?: number }).status as number)
          : undefined;

      toast({
        title: 'Send failed',
        description:
          status === 404
            ? 'Review email endpoint is not available on this server yet.'
            : err instanceof Error
              ? err.message
              : 'Unable to send review email. Please retry.',
        variant: 'destructive',
      });
    } finally {
      setSendReviewLoading(false);
    }
  };

  return (
    <AppLayout title="Offboarding Requests"
      // subtitle="Review, approve, or reject healthcare offboarding requests"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending and Processed Requests</CardTitle>
            <CardDescription>System administrators can review offboarding requests from healthcare facilities.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No offboarding requests found.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by healthcare, requester, or reason"
                  />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status === 'all' ? 'All statuses' : status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-xs text-muted-foreground">
                  Showing {filteredItems.length} of {items.length} requests
                </p>

                {filteredItems.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No offboarding requests match the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Healthcare</TableHead>
                          <TableHead>Requester</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Blockers</TableHead>
                          <TableHead>Decision Note</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => {
                          const blockers = approvalBlockers[item.id] || [];

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="min-w-[180px] align-top">
                                <p className="font-medium">{item.hospital_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date'}
                                </p>
                              </TableCell>
                              <TableCell className="min-w-[160px] align-top">
                                <p>{item.requested_by_name || 'Healthcare Admin'}</p>
                                {item.requested_by_email ? (
                                  <p className="text-xs text-muted-foreground">{item.requested_by_email}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="min-w-[260px] max-w-[340px] align-top">
                                <p className="whitespace-pre-wrap text-sm">{item.reason || 'No reason provided.'}</p>
                                {item.admin_notes && item.status !== 'pending' ? (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Admin note: {item.admin_notes}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="align-top">
                                <Badge variant={item.status === 'pending' ? 'secondary' : item.status === 'approved' ? 'default' : 'destructive'}>
                                  {item.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="min-w-[180px] align-top">
                                {item.status === 'pending' && blockers.length > 0 ? (
                                  <div className="space-y-1 rounded-md border border-amber-400/40 bg-amber-500/10 p-2">
                                    <div className="flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-200">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Blocked
                                    </div>
                                    <ul className="list-disc pl-4 text-xs text-amber-950 dark:text-amber-100">
                                      {blockers.slice(0, 3).map((blocker, index) => (
                                        <li key={`${item.id}-blocker-${index}`}>{blocker}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">None</span>
                                )}
                              </TableCell>
                              <TableCell className="min-w-[220px] align-top">
                                <Label htmlFor={`decision-note-${item.id}`} className="sr-only">
                                  Decision Note
                                </Label>
                                <Textarea
                                  id={`decision-note-${item.id}`}
                                  rows={2}
                                  placeholder="Add decision notes..."
                                  value={decisionReason[item.id] || ''}
                                  onChange={(event) =>
                                    setDecisionReason((prev) => ({
                                      ...prev,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell className="min-w-[220px] align-top text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      void openReviewDialog(item);
                                    }}
                                    disabled={processingId === item.id}
                                  >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Review Email
                                  </Button>

                                  {item.status === 'pending' ? (
                                    <>
                                      <Button
                                        onClick={() => decide(item, 'approve')}
                                        disabled={processingId === item.id}
                                      >
                                        {processingId === item.id ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <CheckCircle2 className="mr-2 h-4 w-4" />
                                        )}
                                        Approve
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        onClick={() => decide(item, 'reject')}
                                        disabled={processingId === item.id}
                                      >
                                        {processingId === item.id ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <XCircle className="mr-2 h-4 w-4" />
                                        )}
                                        Reject
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReviewEmailDialog
        open={reviewDialogOpen}
        onOpenChange={handleReviewDialogOpenChange}
        title={reviewingItem ? `Review Email - ${reviewingItem.hospital_name}` : 'Review Email'}
        description="Review and send an email about this offboarding request."
        recipientEmail={reviewRecipientEmail}
        subject={reviewSubject}
        message={reviewMessage}
        onSubjectChange={setReviewSubject}
        onMessageChange={setReviewMessage}
        onSend={handleSendReviewEmail}
        sending={sendReviewLoading}
        disableSend={reviewRecipientLoading || !reviewRecipientEmail.trim()}
        messagePlaceholder="Describe what should be corrected before offboarding approval."
        sendLabel="Send Review Email"
      >
        {reviewRecipientLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border bg-muted/20 px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Resolving recipient email...
          </div>
        ) : null}
      </ReviewEmailDialog>
    </AppLayout>
  );
}
