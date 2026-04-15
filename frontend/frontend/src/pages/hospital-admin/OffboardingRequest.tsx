import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hospitalsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function OffboardingRequest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    if (!reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide an offboarding reason.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const hospitalId = String(user?.hospital_id || '');
      if (!hospitalId) {
        toast({
          title: 'Hospital context missing',
          description: 'Your account is not linked to a hospital.',
          variant: 'destructive',
        });
        return;
      }

      const response: unknown = await hospitalsApi.submitOffboardingRequest(hospitalId, reason.trim());
      const detail = (response as any)?.data?.detail || (response as any)?.detail;
      toast({
        title: 'Offboarding request submitted',
        description: detail || 'Your request was sent to platform administrators for review.',
      });
      setReason('');
    } catch (err: any) {
      toast({
        title: 'Failed to submit offboarding request',
        description: err?.message || 'Please retry later.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title="Offboarding">
      <div className="min-h-[calc(100vh-4rem)] flex items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md space-y-8">
          {/* Icon + Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <LogOut className="h-5 w-5 text-destructive" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Offboarding Request
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm">
                Submit a request to offboard your hospital. Administrators will review and respond.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium text-foreground">
                Reason for offboarding
              </Label>
              <Textarea
                id="reason"
                placeholder="Please explain why this hospital should be offboarded…"
                rows={6}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none border-border bg-background focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Be as detailed as possible to help administrators process your request quickly.
              </p>
            </div>

            <Button
              onClick={submitRequest}
              disabled={submitting || !reason.trim()}
              className="w-full"
              variant="destructive"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
