import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle2, Mail, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hospitalUpdateRequestsApi, hospitalsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { evaluateAccess, getAccessErrorMessage } from '@/lib/accessResolver';
import ReviewEmailDialog from '@/components/admin/ReviewEmailDialog';

interface HospitalUpdateRequestItem {
  id: string;
  hospital?: string;
  hospital_name: string;
  requested_by_name?: string;
  requested_by_email?: string;
  hospital_email?: string;
  admin_email?: string;
  reviewed_by_name?: string;
  status: string;
  created_at?: string;
  reviewed_at?: string;
  current_requested_values?: Record<string, unknown>;
  requested_changes?: Record<string, unknown>;
  sensitive_changes?: Record<string, unknown>;
  review_comment?: string;
  rejection_reason?: string;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return {};
};

const readText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const readStringFrom = (record: UnknownRecord, keys: string[]): string => {
  for (const key of keys) {
    const value = readText(record[key]);
    if (value) return value;
  }
  return '';
};

const extractList = (response: unknown): unknown[] => {
  const root = asRecord(response);
  const nestedData = asRecord(root.data);

  if (Array.isArray(nestedData.results)) return nestedData.results;
  if (Array.isArray(root.data)) return root.data as unknown[];
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(response)) return response;

  return [];
};

const REQUEST_HISTORY_STATUSES = ['pending', 'approved', 'rejected'] as const;

const toSortTimestamp = (item: HospitalUpdateRequestItem): number => {
  const candidates = [item.created_at, item.reviewed_at];
  for (const value of candidates) {
    if (!value) continue;
    const stamp = new Date(value).getTime();
    if (Number.isFinite(stamp) && stamp > 0) {
      return stamp;
    }
  }
  return 0;
};

const normalizeRequestItem = (entry: unknown): HospitalUpdateRequestItem => {
  const item = asRecord(entry);
  const hospital = asRecord(item.hospital);
  const requestedBy = asRecord(item.requested_by);
  const reviewedBy = asRecord(item.reviewed_by);

  return {
    id: String(item.id || ''),
    hospital: readStringFrom(item, ['hospital']) || readStringFrom(hospital, ['id']),
    hospital_name: readStringFrom(item, ['hospital_name']) || readStringFrom(hospital, ['name']) || 'Healthcare',
    requested_by_name: readStringFrom(item, ['requested_by_name']) || readStringFrom(requestedBy, ['full_name']),
    requested_by_email: readStringFrom(item, ['requested_by_email']) || readStringFrom(requestedBy, ['email']),
    hospital_email: readStringFrom(item, ['hospital_email']) || readStringFrom(hospital, ['email']),
    admin_email: readStringFrom(item, ['admin_email']) || readStringFrom(hospital, ['admin_email']),
    reviewed_by_name:
      readStringFrom(item, ['reviewed_by_name']) ||
      readStringFrom(reviewedBy, ['full_name']) ||
      readStringFrom(item, ['admin_name']),
    status: readStringFrom(item, ['workflow_state', 'status']) || 'pending',
    created_at: readStringFrom(item, ['created_at', 'requested_at', 'submitted_at']),
    reviewed_at: readStringFrom(item, ['reviewed_at', 'decision_at']),
    current_requested_values: asRecord(item.current_requested_values ?? item.current_values ?? item.current_data ?? item.current_profile),
    requested_changes: asRecord(item.requested_changes ?? item.requested_data ?? item.request_payload ?? item.changes),
    sensitive_changes: asRecord(item.sensitive_changes ?? item.sensitive_data ?? item.sensitive_payload),
    rejection_reason: readStringFrom(item, ['rejection_reason']),
    review_comment: readStringFrom(item, ['review_comment', 'admin_notes']),
  };
};

const mergeRequestItems = (items: HospitalUpdateRequestItem[]): HospitalUpdateRequestItem[] => {
  const merged = new Map<string, HospitalUpdateRequestItem>();

  items.forEach((item) => {
    const fallbackKey = `${item.hospital || item.hospital_name || 'healthcare'}:${item.created_at || item.reviewed_at || 'unknown'}:${normalizeStatus(item.status)}`;
    const key = item.id || fallbackKey;
    const existing = merged.get(key);

    if (!existing || toSortTimestamp(item) >= toSortTimestamp(existing)) {
      merged.set(key, item);
    }
  });

  return Array.from(merged.values()).sort((left, right) => toSortTimestamp(right) - toSortTimestamp(left));
};

const extractRequestItems = (response: unknown): HospitalUpdateRequestItem[] => {
  return extractList(response).map((entry) => normalizeRequestItem(entry));
};

const normalizeStatus = (status: string): string => {
  return (status || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
};

const formatStatusLabel = (status: string): string => {
  const normalized = normalizeStatus(status);
  if (!normalized) return 'Unknown';

  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getStatusVariant = (
  status: string,
): 'default' | 'destructive' | 'secondary' | 'outline' => {
  const normalized = normalizeStatus(status);

  if (normalized === 'pending') return 'secondary';
  if (['approved', 'completed'].includes(normalized)) return 'default';
  if (['rejected', 'failed', 'cancelled', 'canceled', 'expired'].includes(normalized)) return 'destructive';

  return 'outline';
};

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '(empty)';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const renderDiffText = (
  currentValues: Record<string, unknown> = {},
  requestedValues: Record<string, unknown> = {},
  sensitiveValues: Record<string, unknown> = {},
) => {
  const keys = Array.from(
    new Set([
      ...Object.keys(requestedValues),
      ...Object.keys(sensitiveValues),
    ]),
  );

  if (keys.length === 0) {
    return 'No changes listed.';
  }

  keys.sort((left, right) => left.localeCompare(right));

  return keys
    .map((key) => {
      const from = renderValue(currentValues[key]);
      const requested = requestedValues[key];
      const sensitive = sensitiveValues[key];
      const to = renderValue(sensitive ?? requested);
      return `${key}: ${from} -> ${to}`;
    })
    .join('\n');
};

const resolveReviewComment = (item: HospitalUpdateRequestItem): string => {
  return readText(item.rejection_reason) || readText(item.review_comment);
};

const buildReviewSubject = (item: HospitalUpdateRequestItem): string => {
  return `Healthcare Update Review Required - ${item.hospital_name}`;
};

const buildReviewMessageDraft = (item: HospitalUpdateRequestItem): string => {
  const requestedBy = item.requested_by_name || 'healthcare team';
  const diffText = renderDiffText(
    item.current_requested_values,
    item.requested_changes,
    item.sensitive_changes,
  );

  return [
    `Hello ${requestedBy},`,
    '',
    `Your healthcare profile update request for ${item.hospital_name} needs revisions before approval.`,
    '',
    'Requested changes under review:',
    diffText,
    '',
    'Please update the request and resubmit for approval.',
    '',
    'Regards,',
    'System Administration Team',
  ].join('\n');
};

const extractRecipientFromRequest = (item: HospitalUpdateRequestItem): string => {
  return (
    readText(item.hospital_email) ||
    readText(item.admin_email) ||
    readText(item.requested_by_email)
  );
};

export default function HospitalUpdateRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canReviewHospitalUpdates = evaluateAccess(user, {
    requiredContext: 'PLATFORM',
    requiredPermissions: ['platform:hospital.review'],
  }).allowed;
  const [items, setItems] = useState<HospitalUpdateRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingItem, setReviewingItem] = useState<HospitalUpdateRequestItem | null>(null);
  const [reviewRecipientEmail, setReviewRecipientEmail] = useState('');
  const [reviewSubject, setReviewSubject] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewRecipientLoading, setReviewRecipientLoading] = useState(false);
  const [sendReviewLoading, setSendReviewLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const statusOptions = useMemo(() => {
    const uniqueStatuses = Array.from(
      new Set(items.map((item) => normalizeStatus(item.status)).filter(Boolean)),
    );
    return ['all', ...uniqueStatuses];
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      const normalizedState = normalizeStatus(item.status);
      if (statusFilter !== 'all' && normalizedState !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const diffText = renderDiffText(
        item.current_requested_values,
        item.requested_changes,
        item.sensitive_changes,
      );

      const haystack = [
        item.hospital_name,
        item.requested_by_name,
        item.requested_by_email,
        diffText,
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
      let baselineItems: HospitalUpdateRequestItem[] = [];
      let baselineError: unknown = null;

      try {
        const baselineResponse: unknown = await hospitalUpdateRequestsApi.getAll({
          pending_only: 'false',
          ordering: '-requested_at',
          limit: '200',
        });
        baselineItems = extractRequestItems(baselineResponse);
      } catch (error: unknown) {
        baselineError = error;
      }

      const baselineHasProcessed = baselineItems.some((item) => normalizeStatus(item.status) !== 'pending');
      if (baselineHasProcessed) {
        setItems(mergeRequestItems(baselineItems));
        return;
      }

      const statusResults = await Promise.allSettled(
        REQUEST_HISTORY_STATUSES.map((status) =>
          hospitalUpdateRequestsApi.getAll({
            status,
            ordering: '-requested_at',
            limit: '100',
          }),
        ),
      );

      const statusItems = statusResults.flatMap((result) =>
        result.status === 'fulfilled' ? extractRequestItems(result.value) : [],
      );

      if (baselineItems.length > 0 || statusItems.length > 0) {
        setItems(mergeRequestItems([...baselineItems, ...statusItems]));
        return;
      }

      if (baselineError) {
        throw baselineError;
      }

      const firstRejected = statusResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      if (firstRejected) {
        throw firstRejected.reason;
      }

      setItems([]);
    } catch (err: unknown) {
      toast({
        title: 'Failed to load healthcare update requests',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to review healthcare update requests.',
          fallbackMessage: 'Please retry.',
        }),
        variant: 'destructive',
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const decide = async (item: HospitalUpdateRequestItem, decision: 'approve' | 'reject') => {
    if (!canReviewHospitalUpdates) {
      toast({
        title: 'Access denied',
        description: 'You are not authorized to review healthcare update requests.',
        variant: 'destructive',
      });
      return;
    }

    setProcessingId(item.id);
    try {
      const note = decisionNotes[item.id] || '';
      if (decision === 'approve') {
        await hospitalUpdateRequestsApi.approve(item.id, note || undefined);
        toast({
          title: 'Update approved',
          description: 'Sensitive changes were approved and applied.',
        });
      } else {
        await hospitalUpdateRequestsApi.reject(item.id, note || undefined);
        toast({
          title: 'Update rejected',
          description: 'The pending update request has been rejected.',
        });
      }
      await loadRequests();
    } catch (err: unknown) {
      toast({
        title: 'Decision failed',
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to submit this decision.',
          fallbackMessage: 'Please retry.',
        }),
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const fetchRecipientFromHospital = async (hospitalId: string): Promise<string> => {
    try {
      const response: unknown = await hospitalsApi.getById(hospitalId);
      const root = asRecord(response);
      const data = asRecord(root.data);
      const source = Object.keys(data).length > 0 ? data : root;

      return readStringFrom(source, ['email', 'admin_email']);
    } catch {
      return '';
    }
  };

  const openReviewDialog = async (item: HospitalUpdateRequestItem) => {
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
        description: 'No recipient email was found for this update request.',
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
    if (!reviewingItem) return;

    if (!canReviewHospitalUpdates) {
      toast({
        title: 'Access denied',
        description: 'You are not authorized to send review emails for healthcare update requests.',
        variant: 'destructive',
      });
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
      await hospitalUpdateRequestsApi.sendReviewEmail(reviewingItem.id, {
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
        description: getAccessErrorMessage(err, {
          forbiddenMessage: 'You are not authorized to send review emails for healthcare update requests.',
          fallbackMessage:
            status === 404
              ? 'Review email endpoint is not available on this server yet.'
              : 'Unable to send review email. Please retry.',
        }),
        variant: 'destructive',
      });
    } finally {
      setSendReviewLoading(false);
    }
  };

  return (
    <AppLayout title="Healthcare Update Requests"
      // subtitle="Review sensitive healthcare profile change requests"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending and Processed Requests</CardTitle>
            <CardDescription>Approve or reject sensitive healthcare profile changes submitted by healthcare admins.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No healthcare update requests found.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by healthcare, requester, or changed fields"
                  />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status === 'all' ? 'All statuses' : formatStatusLabel(status)}
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
                    No healthcare update requests match the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Healthcare</TableHead>
                          <TableHead>Requester</TableHead>
                          <TableHead>Requested Changes</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Review</TableHead>
                          <TableHead>Admin Note</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => {
                          const diffText = renderDiffText(item.current_requested_values, item.requested_changes, item.sensitive_changes);
                          const normalizedState = normalizeStatus(item.status);

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="min-w-[180px] align-top">
                                <p className="font-medium">{item.hospital_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date'}
                                </p>
                              </TableCell>
                              <TableCell className="min-w-[180px] align-top">
                                <p>{item.requested_by_name || 'Healthcare Admin'}</p>
                                {item.requested_by_email ? (
                                  <p className="text-xs text-muted-foreground">{item.requested_by_email}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="min-w-[300px] max-w-[420px] align-top">
                                <pre className="whitespace-pre-wrap text-xs leading-relaxed">{diffText}</pre>
                              </TableCell>
                              <TableCell className="align-top">
                                <Badge variant={getStatusVariant(item.status)}>
                                  {formatStatusLabel(item.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="min-w-[200px] align-top">
                                {(item.reviewed_at || item.reviewed_by_name) ? (
                                  <p className="text-xs text-muted-foreground">
                                    Reviewed {item.reviewed_by_name ? `by ${item.reviewed_by_name}` : ''}
                                    {item.reviewed_at ? ` • ${new Date(item.reviewed_at).toLocaleString()}` : ''}
                                  </p>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Pending review</span>
                                )}

                                {resolveReviewComment(item) && normalizedState !== 'pending' ? (
                                  <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
                                    Comment: {resolveReviewComment(item)}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="min-w-[220px] align-top">
                                <Label htmlFor={`decision-note-${item.id}`} className="sr-only">
                                  Admin Note
                                </Label>
                                <Textarea
                                  id={`decision-note-${item.id}`}
                                  rows={2}
                                  placeholder="Add admin notes..."
                                  value={decisionNotes[item.id] || ''}
                                  onChange={(event) =>
                                    setDecisionNotes((prev) => ({
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
                                    disabled={!canReviewHospitalUpdates || processingId === item.id}
                                  >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Review Email
                                  </Button>

                                  {normalizedState === 'pending' ? (
                                    <>
                                      <Button onClick={() => decide(item, 'approve')} disabled={!canReviewHospitalUpdates || processingId === item.id}>
                                        {processingId === item.id ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <CheckCircle2 className="mr-2 h-4 w-4" />
                                        )}
                                        Approve
                                      </Button>
                                      <Button variant="destructive" onClick={() => decide(item, 'reject')} disabled={!canReviewHospitalUpdates || processingId === item.id}>
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
        description="Review and send an email about this healthcare update request."
        recipientEmail={reviewRecipientEmail}
        subject={reviewSubject}
        message={reviewMessage}
        onSubjectChange={setReviewSubject}
        onMessageChange={setReviewMessage}
        onSend={handleSendReviewEmail}
        sending={sendReviewLoading}
        disableSend={reviewRecipientLoading || !reviewRecipientEmail.trim()}
        messagePlaceholder="Describe what should be corrected before approval."
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
