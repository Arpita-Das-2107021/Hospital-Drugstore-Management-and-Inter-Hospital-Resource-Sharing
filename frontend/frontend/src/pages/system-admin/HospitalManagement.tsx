import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Building2, CheckCircle, Shield, Loader2, RefreshCw, Eye, ShieldOff, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hospitalsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import HospitalLogo from '@/components/HospitalLogo';
import ReviewEmailDialog from '@/components/admin/ReviewEmailDialog';
// ...existing code...

interface Hospital {
  id: string;
  name: string;
  logo?: string | null;
  registration_number: string;
  email: string;
  admin_email?: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  hospital_type: string;
  verified_status: string;
  is_active: boolean;
  bed_capacity: number | null;
  created_at: string;
}

type ApiErrorWithPayload = Error & {
  payload?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toReadableKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').trim();
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isHospitalActive(hospital: Hospital): boolean {
  return hospital.is_active !== false;
}

function getHealthcareReviewStatus(hospital: Hospital): string {
  if (hospital.verified_status === 'offboarded') {
    return 'Offboarded';
  }

  const baseStatus = hospital.verified_status
    ? toTitleCase(toReadableKey(hospital.verified_status.toLowerCase()))
    : 'Pending';

  if (hospital.is_active === false) {
    return `${baseStatus} (Inactive)`;
  }

  return baseStatus;
}

function extractOffboardingBlockers(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }

  const payload = (error as ApiErrorWithPayload).payload;
  if (!isRecord(payload)) {
    return [];
  }

  const envelopeError = isRecord(payload.error) ? payload.error : null;
  if (!envelopeError) {
    return [];
  }

  const details = isRecord(envelopeError.details) ? envelopeError.details : null;
  if (!details) {
    return [];
  }

  const unresolved = details.unresolved;
  if (!isRecord(unresolved)) {
    return [];
  }

  const blockers = Object.entries(unresolved)
    .map(([key, value]) => {
      const label = toReadableKey(key);
      if (typeof value === 'number') {
        if (value <= 0) return '';
        return `${label}: ${value}`;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === '0') return '';
        return `${label}: ${trimmed}`;
      }
      if (Array.isArray(value)) {
        const rendered = value.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean);
        if (rendered.length === 0) return '';
        return `${label}: ${rendered.join(', ')}`;
      }
      if (value === true) {
        return label;
      }
      return '';
    })
    .filter(Boolean);

  return [...new Set(blockers)];
}

const HospitalManagement = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [filteredHospitals, setFilteredHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [offboardTarget, setOffboardTarget] = useState<Hospital | null>(null);
  const [offboardReason, setOffboardReason] = useState('Direct offboarding by SUPER_ADMIN.');
  const [offboardNotes, setOffboardNotes] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Hospital | null>(null);
  const [reviewRecipientEmail, setReviewRecipientEmail] = useState('');
  const [reviewSubject, setReviewSubject] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewRecipientLoading, setReviewRecipientLoading] = useState(false);
  const [sendReviewLoading, setSendReviewLoading] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const loadHospitals = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await hospitalsApi.getAll();
      const data: Hospital[] = (res as unknown)?.data?.results ?? (res as unknown)?.data ?? (res as unknown)?.results ?? [];
      setHospitals(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load healthcare facilities', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const filterHospitals = useCallback(() => {
    let filtered = [...hospitals];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(h => h.verified_status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.registration_number ?? '').toLowerCase().includes(q) ||
        (h.email ?? '').toLowerCase().includes(q)
      );
    }
    setFilteredHospitals(filtered);
  }, [hospitals, searchQuery, statusFilter]);

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  useEffect(() => {
    filterHospitals();
  }, [filterHospitals]);

  const handleSuspend = async (hospital: Hospital) => {
    setActionLoading(hospital.id);
    try {
      await hospitalsApi.suspend(hospital.id);
      toast({ title: 'Healthcare Suspended', description: `${hospital.name} has been suspended.` });
      void loadHospitals();
    } catch {
      toast({ title: 'Error', description: 'Failed to suspend healthcare facility', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async (hospital: Hospital) => {
    setActionLoading(hospital.id);
    try {
      await hospitalsApi.verify(hospital.id);
      toast({ title: 'Healthcare Verified', description: `${hospital.name} has been verified.` });
      void loadHospitals();
    } catch {
      toast({ title: 'Error', description: 'Failed to verify healthcare facility', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const openOffboardDialog = (hospital: Hospital) => {
    setOffboardTarget(hospital);
    setOffboardReason('Direct offboarding by SUPER_ADMIN.');
    setOffboardNotes('');
  };

  const closeOffboardDialog = () => {
    if (offboardTarget && actionLoading === offboardTarget.id) {
      return;
    }
    setOffboardTarget(null);
    setOffboardReason('Direct offboarding by SUPER_ADMIN.');
    setOffboardNotes('');
  };

  const handleOffboard = async () => {
    if (!offboardTarget) {
      return;
    }

    setActionLoading(offboardTarget.id);
    try {
      await hospitalsApi.adminOffboard(offboardTarget.id, {
        reason: offboardReason.trim() || undefined,
        admin_notes: offboardNotes.trim() || undefined,
      });

      toast({
        title: 'Healthcare Offboarded',
        description: `${offboardTarget.name} has been directly offboarded.`,
      });
      closeOffboardDialog();
      void loadHospitals();
    } catch (error: unknown) {
      const blockers = extractOffboardingBlockers(error);
      if (blockers.length > 0) {
        toast({
          title: 'Offboarding blocked by unresolved operations',
          description: blockers.slice(0, 2).join(', '),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to offboard healthcare facility',
          variant: 'destructive',
        });
      }
    } finally {
      setActionLoading(null);
    }
  };

  const reviewerLabel = user?.full_name?.trim() || user?.email?.trim() || 'System Administration Team';

  const buildReviewSubject = (hospital: Hospital) => `Review Update - ${hospital.name}`;

  const buildReviewMessageDraft = (hospital: Hospital) => {
    const currentStatus = getHealthcareReviewStatus(hospital);

    return [
      `Hello ${hospital.name} team,`,
      '',
      'This is a review update from System Administration.',
      '',
      'Review summary:',
      `- Healthcare: ${hospital.name}`,
      `- Current status: ${currentStatus}`,
      `- Reviewed by: ${reviewerLabel}`,
      '',
      'Please review this notice and respond with any clarification or updates that are required.',
      '',
      'Regards,',
      'System Administration Team',
    ].join('\n');
  };

  const fetchRecipientFromHospital = async (hospitalId: string): Promise<string> => {
    try {
      const response = await hospitalsApi.getById(hospitalId);
      const root = isRecord(response) ? response : {};
      const nestedData = isRecord(root.data) ? root.data : null;
      const source = nestedData && Object.keys(nestedData).length > 0 ? nestedData : root;

      if (typeof source.email === 'string' && source.email.trim()) {
        return source.email.trim();
      }
      if (typeof source.admin_email === 'string' && source.admin_email.trim()) {
        return source.admin_email.trim();
      }
      return '';
    } catch {
      return '';
    }
  };

  const openReviewDialog = async (hospital: Hospital) => {
    setReviewTarget(hospital);
    setReviewDialogOpen(true);
    setReviewSubject(buildReviewSubject(hospital));
    setReviewMessage(buildReviewMessageDraft(hospital));

    const initialRecipient = (hospital.email || hospital.admin_email || '').trim();
    setReviewRecipientEmail(initialRecipient);

    if (initialRecipient) {
      setReviewRecipientLoading(false);
      return;
    }

    setReviewRecipientLoading(true);
    const resolvedRecipient = await fetchRecipientFromHospital(hospital.id);
    setReviewRecipientEmail(resolvedRecipient);
    setReviewRecipientLoading(false);

    if (!resolvedRecipient) {
      toast({
        title: 'Recipient unavailable',
        description: 'No recipient email was found for this healthcare facility.',
        variant: 'destructive',
      });
    }
  };

  const handleReviewDialogOpenChange = (open: boolean) => {
    setReviewDialogOpen(open);

    if (!open) {
      setReviewTarget(null);
      setReviewRecipientEmail('');
      setReviewSubject('');
      setReviewMessage('');
      setReviewRecipientLoading(false);
      setSendReviewLoading(false);
    }
  };

  const handleSendReviewEmail = async () => {
    if (!reviewTarget) {
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
      await hospitalsApi.sendOffboardingReviewEmail(reviewTarget.id, {
        recipient_email: recipientEmail,
        subject,
        message,
      });

      toast({
        title: 'Review email sent',
        description: `Review email has been sent to ${recipientEmail}.`,
      });

      handleReviewDialogOpenChange(false);
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
          ? ((error as { status?: number }).status as number)
          : undefined;

      toast({
        title: 'Send failed',
        description:
          status === 404
            ? 'Review email endpoint is not available on this server yet.'
            : error instanceof Error
              ? error.message
              : 'Unable to send review email. Please retry.',
        variant: 'destructive',
      });
    } finally {
      setSendReviewLoading(false);
    }
  };

  const getStatusBadge = (verified_status: string, is_active: boolean) => {
    if (verified_status === 'offboarded') return <Badge variant="secondary">Offboarded</Badge>;
    if (is_active === false) return <Badge variant="destructive">Inactive</Badge>;
    const map: Record<string, { variant: unknown; label: string }> = {
      verified: { variant: 'default', label: 'Verified' },
      pending: { variant: 'secondary', label: 'Pending' },
      suspended: { variant: 'destructive', label: 'Suspended' },
    };
    const cfg = map[verified_status] ?? { variant: 'secondary', label: verified_status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const activeCount = hospitals.filter(h => isHospitalActive(h) && h.verified_status === 'verified').length;
  const pendingCount = hospitals.filter(h => h.verified_status === 'pending').length;
  const suspendedCount = hospitals.filter(h => h.verified_status === 'suspended' || h.is_active === false).length;

  return (
    <AppLayout title="Healthcare Management">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Healthcare Facilities</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{hospitals.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified &amp; Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
              <Shield className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{pendingCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspended</CardTitle>
              <ShieldOff className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{suspendedCount}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Healthcare Facilities</CardTitle>
            <CardDescription>Manage active healthcare facilities on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search by name, registration number, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void loadHospitals()} variant="outline" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => navigate('/admin/hospital-update-requests')} variant="outline">
                Review Update Requests
              </Button>
              <Button onClick={() => navigate('/admin/offboarding-requests')} variant="outline">
                Review Offboarding Requests
              </Button>
            </div>

            <div className="rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredHospitals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-4 opacity-50" />
                  <p>No healthcare facilities found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Healthcare</TableHead>
                      <TableHead>Reg. Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHospitals.map((hospital) => (
                      <TableRow key={hospital.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <HospitalLogo
                              name={hospital.name}
                              logo={hospital.logo}
                              className="h-9 w-9"
                            />
                            <div>
                              <div className="font-medium">{hospital.name}</div>
                              <div className="text-xs text-muted-foreground">{hospital.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{hospital.registration_number ?? '--'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{hospital.hospital_type ?? '--'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{[hospital.city, hospital.state, hospital.country].filter(Boolean).join(', ') || '--'}</span>
                        </TableCell>
                        <TableCell>{getStatusBadge(hospital.verified_status, hospital.is_active)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/hospital/${hospital.id}`)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            {hospital.verified_status === 'pending' && (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={actionLoading === hospital.id}
                                onClick={() => handleVerify(hospital)}
                              >
                                {actionLoading === hospital.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><CheckCircle className="h-3 w-3 mr-1" />Verify</>
                                )}
                              </Button>
                            )}
                            {hospital.verified_status !== 'suspended' && hospital.verified_status !== 'offboarded' && isHospitalActive(hospital) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actionLoading === hospital.id}
                                onClick={() => handleSuspend(hospital)}
                              >
                                {actionLoading === hospital.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><ShieldOff className="h-3 w-3 mr-1" />Suspend</>
                                )}
                              </Button>
                            )}
                            {hospital.verified_status !== 'offboarded' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === hospital.id}
                                onClick={() => {
                                  void openReviewDialog(hospital);
                                }}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Review Email
                              </Button>
                            )}
                            {hospital.verified_status !== 'offboarded' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === hospital.id}
                                onClick={() => openOffboardDialog(hospital)}
                              >
                                {actionLoading === hospital.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Offboard'
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(offboardTarget)}
          onOpenChange={(open) => {
            if (!open) {
              closeOffboardDialog();
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Directly Offboard Healthcare</DialogTitle>
              <DialogDescription>
                This action offboards the healthcare facility immediately without waiting for a healthcare-initiated request.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="offboard-hospital-name">Healthcare Facility</Label>
                <Input
                  id="offboard-hospital-name"
                  value={offboardTarget?.name || ''}
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="offboard-reason">Reason</Label>
                <Textarea
                  id="offboard-reason"
                  rows={3}
                  value={offboardReason}
                  onChange={(event) => setOffboardReason(event.target.value)}
                  placeholder="Direct offboarding reason..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="offboard-admin-notes">Admin Notes (optional)</Label>
                <Textarea
                  id="offboard-admin-notes"
                  rows={3}
                  value={offboardNotes}
                  onChange={(event) => setOffboardNotes(event.target.value)}
                  placeholder="Add any operational or compliance notes..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={closeOffboardDialog}
                disabled={Boolean(offboardTarget && actionLoading === offboardTarget.id)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleOffboard}
                disabled={Boolean(offboardTarget && actionLoading === offboardTarget.id)}
              >
                {offboardTarget && actionLoading === offboardTarget.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Offboard Healthcare
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ReviewEmailDialog
          open={reviewDialogOpen}
          onOpenChange={handleReviewDialogOpenChange}
          title={reviewTarget ? `Review Email - ${reviewTarget.name}` : 'Review Email'}
          description="Send a review email for this healthcare profile."
          recipientEmail={reviewRecipientEmail}
          subject={reviewSubject}
          message={reviewMessage}
          onSubjectChange={setReviewSubject}
          onMessageChange={setReviewMessage}
          onSend={handleSendReviewEmail}
          sending={sendReviewLoading}
          disableSend={reviewRecipientLoading || !reviewRecipientEmail.trim()}
          messagePlaceholder="Provide any review reason. This can be any details the system admin wants to communicate."
          sendLabel="Send Review Email"
        >
          {reviewRecipientLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border bg-muted/20 px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Resolving recipient email...
            </div>
          ) : null}
        </ReviewEmailDialog>
      </div>
    </AppLayout>
  );
};

export default HospitalManagement;
