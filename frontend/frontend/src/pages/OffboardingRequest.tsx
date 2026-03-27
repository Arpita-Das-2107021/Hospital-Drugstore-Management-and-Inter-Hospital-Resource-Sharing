import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
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
      const detail = response?.data?.detail || response?.detail;
      toast({
        title: 'Offboarding request submitted',
        description: detail || 'Your request was sent to platform administrators for review.',
      });
      setReason('');
    } catch (err: unknown) {
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
    <AppLayout title="Request Offboarding" subtitle="Submit your hospital offboarding request for system-admin review">
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Hospital Offboarding Request</CardTitle>
            <CardDescription>
              Provide a clear reason for offboarding. System administrators can approve or reject your request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="offboardingReason">Reason</Label>
              <Textarea
                id="offboardingReason"
                rows={6}
                placeholder="Explain why your hospital is requesting offboarding..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Offboarding Request
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
