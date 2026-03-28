import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  ShieldAlert,
  Mail,
  Phone,
  MapPin,
  Globe,
  Hash,
  Calendar,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import registrationService from '@/services/registrationService';
import { findHospitalAdminDraft } from '@/services/hospitalAdminDraftStore';
import HospitalLogo from '@/components/HospitalLogo';
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
  status: string;
  submitted_at: string;
  reviewed_at?: string | null;
  rejection_reason?: string;
  notes?: string;
  contact_name?: string;
  admin_name?: string;
  // API integration fields (masked by backend)
  api_base_url?: string;
  api_auth_type?: string;
}

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
  const { toast } = useToast();

  const [registration, setRegistration] = useState<RegistrationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalSummary, setApprovalSummary] = useState<string>('');

  const adminDraft = registration
    ? findHospitalAdminDraft({
        registration_id: registration.id,
        registration_number: registration.registration_number,
        registration_email: registration.email,
      })
    : null;

  useEffect(() => {
    if (id) loadDetail(id);
  }, [id]);

  const loadDetail = async (registrationId: string) => {
    setIsLoading(true);
    try {
      const data = await registrationService.getHospital(registrationId);
      setRegistration(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load registration details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!registration) return;
    setActionLoading(true);
    setApprovalSummary('');
    try {
      const result = await registrationService.approveHospital(
        registration.id,
        approvalNotes || undefined
      );
      if (result.success) {
        const postApprovalSummary = adminDraft?.admin_email
          ? `Hospital approved. Backend will provision the hospital admin account and send setup email to ${adminDraft.admin_email}.`
          : 'Hospital approved. Backend will provision the hospital admin account and send setup email as defined by the approval workflow.';

        toast({
          title: 'Hospital Approved',
          description: `${registration.name} has been approved and is now active on the platform.`,
        });
        setApprovalSummary(postApprovalSummary);
        setApproveOpen(false);
        // Refresh to show updated status
        await loadDetail(registration.id);
      } else {
        toast({
          title: 'Approval Failed',
          description: result.message || 'Could not approve the registration.',
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
      const result = await registrationService.rejectHospital(
        registration.id,
        rejectionReason
      );
      if (result.success) {
        toast({
          title: 'Hospital Rejected',
          description: `${registration.name} registration has been rejected.`,
        });
        setRejectOpen(false);
        setRejectionReason('');
        await loadDetail(registration.id);
      } else {
        toast({
          title: 'Rejection Failed',
          description: result.message || 'Could not reject the registration.',
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

  if (isLoading) {
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

  return (
    <AppLayout
      title="Registration Details"
      subtitle="Platform Admin — Hospital onboarding review"
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
            {isPending && (
              <>
                <Button
                  onClick={() => setApproveOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Hospital
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Hospital
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Platform admin banner */}
        <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Only <strong>Platform Admins</strong> can approve or reject hospital registrations.
          </span>
        </div>

        {/* Details grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Hospital info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hospital Information</CardTitle>
              <CardDescription>Core registration data submitted by the applicant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="pb-3 border-b mb-1">
                <HospitalLogo name={registration.name} logo={registration.logo} className="h-16 w-16" />
              </div>
              <DetailRow icon={Building2} label="Hospital Name" value={registration.name} />
              <DetailRow
                icon={Hash}
                label="Registration Number"
                value={registration.registration_number}
              />
              <DetailRow
                icon={Building2}
                label="Hospital Type"
                value={registration.hospital_type?.replace(/_/g, ' ')}
              />
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
              <CardDescription>How to reach the hospital representative</CardDescription>
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

          {/* API integration (if present) */}
          {(registration.api_base_url || registration.api_auth_type) && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">API Integration Config</CardTitle>
                <CardDescription>
                  Optional external API details submitted by the hospital
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow icon={Globe} label="API Base URL" value={registration.api_base_url} />
                <DetailRow
                  icon={Hash}
                  label="Auth Type"
                  value={registration.api_auth_type}
                />
              </CardContent>
            </Card>
          )}

          {/* Frontend-only onboarding admin draft */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Pending Hospital Admin Setup</CardTitle>
              <CardDescription>
                Frontend-collected admin onboarding info used after approval (not sent in registration request)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <DetailRow icon={Building2} label="Admin Name" value={adminDraft?.admin_name || undefined} />
              <DetailRow icon={Mail} label="Admin Email" value={adminDraft?.admin_email || undefined} />
              <DetailRow icon={Phone} label="Admin Phone" value={adminDraft?.admin_phone || undefined} />
            </CardContent>
          </Card>
        </div>

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
              Approve Hospital Registration
            </DialogTitle>
            <DialogDescription>
              This will create a Hospital record and grant the hospital access to the platform.
              This action will notify the applicant.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Hospital:</span>
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
                  Approve Hospital
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
              Reject Hospital Registration
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this registration. The applicant will be
              notified.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Hospital:</span>
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
                  Reject Hospital
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
