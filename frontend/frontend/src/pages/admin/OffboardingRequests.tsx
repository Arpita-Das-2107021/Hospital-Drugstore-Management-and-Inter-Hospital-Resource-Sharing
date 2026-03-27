import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { offboardingApi } from '@/services/api';

interface OffboardingRequestItem {
  id: string;
  hospital_name: string;
  requested_by_name?: string;
  reason: string;
  status: string;
  created_at?: string;
}

export default function OffboardingRequests() {
  const { toast } = useToast();
  const [items, setItems] = useState<OffboardingRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response: unknown = await offboardingApi.listAdminRequests();
      const raw: unknown[] = response?.data?.results ?? response?.data ?? response?.results ?? (Array.isArray(response) ? response : []);
      setItems(
        raw.map((item: unknown) => ({
          id: String(item.id),
          hospital_name: item.hospital_name || item.hospital?.name || 'Hospital',
          requested_by_name: item.requested_by_name || item.requested_by?.full_name,
          reason: item.reason || '',
          status: item.status || 'pending',
          created_at: item.created_at,
        }))
      );
    } catch (err: unknown) {
      toast({
        title: 'Failed to load offboarding requests',
        description: err?.message || 'Please retry.',
        variant: 'destructive',
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const decide = async (item: OffboardingRequestItem, decision: 'approve' | 'reject') => {
    setProcessingId(item.id);
    try {
      if (decision === 'approve') {
        await offboardingApi.approve(item.id, decisionReason[item.id] || undefined);
        toast({
          title: 'Offboarding approved',
          description: 'Request approved. Notification email should be sent by backend workflow.',
        });
      } else {
        await offboardingApi.reject(item.id, decisionReason[item.id] || 'Rejected by system administrator');
        toast({
          title: 'Offboarding rejected',
          description: 'Request rejected. Notification email should be sent by backend workflow.',
        });
      }
      await loadRequests();
    } catch (err: unknown) {
      toast({
        title: 'Decision failed',
        description: err?.message || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AppLayout title="Offboarding Requests" subtitle="Review, approve, or reject hospital offboarding requests">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending and Processed Requests</CardTitle>
            <CardDescription>System administrators can review offboarding requests from hospitals.</CardDescription>
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
                {items.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{item.hospital_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Requested by {item.requested_by_name || 'Hospital Admin'}
                          {item.created_at ? ` • ${new Date(item.created_at).toLocaleString()}` : ''}
                        </p>
                      </div>
                      <Badge variant={item.status === 'pending' ? 'secondary' : item.status === 'approved' ? 'default' : 'destructive'}>
                        {item.status}
                      </Badge>
                    </div>

                    <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{item.reason || 'No reason provided.'}</div>

                    <div className="space-y-2">
                      <Label htmlFor={`decision-note-${item.id}`}>Decision Note (optional)</Label>
                      <Textarea
                        id={`decision-note-${item.id}`}
                        rows={2}
                        placeholder="Add decision notes to include in notification..."
                        value={decisionReason[item.id] || ''}
                        onChange={(event) =>
                          setDecisionReason((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                      />
                    </div>

                    {item.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => decide(item, 'approve')}
                          disabled={processingId === item.id}
                        >
                          {processingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => decide(item, 'reject')}
                          disabled={processingId === item.id}
                        >
                          {processingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
