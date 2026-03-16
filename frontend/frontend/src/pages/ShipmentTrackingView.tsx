import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { shipmentsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface TrackingEvent {
  id: string;
  status: string;
  location: string;
  notes: string;
  recordedAt: string;
}

const ShipmentTrackingView = () => {
  const { shipmentId = '' } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('in_transit');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const shipmentQuery = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: async () => {
      const res: any = await shipmentsApi.getById(shipmentId);
      return res?.data || res;
    },
    enabled: !!shipmentId,
  });

  const trackingQuery = useQuery({
    queryKey: ['shipment-tracking', shipmentId],
    queryFn: async () => {
      const res: any = await shipmentsApi.getTracking(shipmentId);
      const raw = res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
      return (Array.isArray(raw) ? raw : []).map((item: any) => ({
        id: String(item.id || Math.random()),
        status: String(item.status || 'update'),
        location: String(item.location || '-'),
        notes: String(item.notes || ''),
        recordedAt: String(item.recorded_at || item.created_at || item.updated_at || ''),
      })) as TrackingEvent[];
    },
    enabled: !!shipmentId,
  });

  const addTrackingMutation = useMutation({
    mutationFn: async () => {
      return shipmentsApi.addTracking(shipmentId, { status, location, notes });
    },
    onSuccess: () => {
      toast({ title: 'Tracking event added' });
      setLocation('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['shipment-tracking', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add tracking event', description: error?.message || 'Please verify your role.', variant: 'destructive' });
    },
  });

  const timeline = useMemo(() => {
    const base = trackingQuery.data || [];
    return [...base].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  }, [trackingQuery.data]);

  return (
    <AppLayout title="Shipment Tracking View" subtitle="Track shipment status and add logistics timeline events">
      {!shipmentId ? (
        <Card>
          <CardContent className="py-8 text-muted-foreground">No shipment selected.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Shipment Details</CardTitle>
            </CardHeader>
            <CardContent>
              {shipmentQuery.isLoading ? (
                <div className="flex items-center"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading shipment...</div>
              ) : shipmentQuery.isError ? (
                <div className="text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Failed to load shipment.</div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <p><span className="font-medium">Status:</span> {shipmentQuery.data?.status || '-'}</p>
                  <p><span className="font-medium">Tracking number:</span> {shipmentQuery.data?.tracking_number || '-'}</p>
                  <p><span className="font-medium">Origin:</span> {shipmentQuery.data?.origin_hospital_name || '-'}</p>
                  <p><span className="font-medium">Destination:</span> {shipmentQuery.data?.destination_hospital_name || '-'}</p>
                  <p><span className="font-medium">Rider:</span> {shipmentQuery.data?.rider_name || shipmentQuery.data?.driver_name || '-'}</p>
                  <p><span className="font-medium">Estimated delivery:</span> {shipmentQuery.data?.estimated_delivery_at ? new Date(shipmentQuery.data.estimated_delivery_at).toLocaleString() : '-'}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add Tracking Event</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Status</Label>
                <Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="in_transit" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Dhaka Highway" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Vehicle departed checkpoint" />
              </div>
              <div className="md:col-span-3">
                <Button onClick={() => addTrackingMutation.mutate()} disabled={addTrackingMutation.isPending || !status || !location}>
                  Add event
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tracking Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {trackingQuery.isLoading ? (
                <div className="flex items-center"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading timeline...</div>
              ) : timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tracking events yet.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((event) => (
                    <div key={event.id} className="border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{event.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {event.recordedAt ? new Date(event.recordedAt).toLocaleString() : '-'}
                        </span>
                      </div>
                      <p className="text-sm mt-2"><span className="font-medium">Location:</span> {event.location}</p>
                      {event.notes ? <p className="text-sm text-muted-foreground">{event.notes}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
};

export default ShipmentTrackingView;
