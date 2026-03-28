import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hospitalUpdateRequestsApi } from '@/services/api';

interface HospitalUpdateRequestItem {
  id: string;
  hospital_name: string;
  requested_by_name?: string;
  status: string;
  created_at?: string;
  reviewed_at?: string;
  current_values?: Record<string, unknown>;
  requested_changes?: Record<string, unknown>;
  rejection_reason?: string;
}

const renderDiffText = (
  currentValues: Record<string, unknown> = {},
  requestedValues: Record<string, unknown> = {}
) => {
  const keys = Object.keys(requestedValues);
  if (keys.length === 0) {
    return 'No changes listed.';
  }

  return keys
    .map((key) => {
      const from = currentValues[key] ?? '(empty)';
      const to = requestedValues[key] ?? '(empty)';
      return `${key}: ${String(from)} -> ${String(to)}`;
    })
    .join('\n');
};

export default function HospitalUpdateRequests() {
  const { toast } = useToast();
  const [items, setItems] = useState<HospitalUpdateRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response: unknown = await hospitalUpdateRequestsApi.getAll();
      const raw: unknown[] = response?.data?.results ?? response?.data ?? response?.results ?? (Array.isArray(response) ? response : []);
      setItems(
        raw.map((item: unknown) => ({
          id: String(item.id),
          hospital_name: item.hospital_name || item.hospital?.name || 'Hospital',
          requested_by_name: item.requested_by_name || item.requested_by?.full_name,
          status: item.status || 'pending',
          created_at: item.created_at,
          reviewed_at: item.reviewed_at,
          current_values: item.current_values || item.current_data || {},
          requested_changes: item.requested_changes || item.requested_data || {},
          rejection_reason: item.rejection_reason,
        }))
      );
    } catch (err: unknown) {
      toast({
        title: 'Failed to load hospital update requests',
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

  const decide = async (item: HospitalUpdateRequestItem, decision: 'approve' | 'reject') => {
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
        description: err?.message || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AppLayout title="Hospital Update Requests" subtitle="Review sensitive hospital profile change requests">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending and Processed Requests</CardTitle>
            <CardDescription>Approve or reject sensitive hospital profile changes submitted by hospital admins.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No hospital update requests found.</p>
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

                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Requested Changes</p>
                      <pre className="whitespace-pre-wrap text-sm">{renderDiffText(item.current_values, item.requested_changes)}</pre>
                    </div>

                    {item.rejection_reason && item.status === 'rejected' && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <span className="font-medium">Rejection reason: </span>
                        {item.rejection_reason}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor={`decision-note-${item.id}`}>Admin Note (optional)</Label>
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
                    </div>

                    {item.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button onClick={() => decide(item, 'approve')} disabled={processingId === item.id}>
                          {processingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                        <Button variant="destructive" onClick={() => decide(item, 'reject')} disabled={processingId === item.id}>
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
