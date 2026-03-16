import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  Clock,
  Package,
  MapPin,
  Truck,
  Loader2,
} from 'lucide-react';
import { shipmentsApi } from '@/services/api';

interface TransportTimelineProps {
  transportId: string;
  onClose: () => void;
}

interface TimelineStep {
  status: string;
  time: string;
  completed: boolean;
  note?: string;
}

export default function TransportTimeline({ transportId, onClose }: TransportTimelineProps) {
  const [loading, setLoading] = useState(true);
  const [shipment, setShipment] = useState<any>(null);
  const [steps, setSteps] = useState<TimelineStep[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [shipmentRes, trackingRes] = await Promise.all([
          shipmentsApi.getById(transportId),
          shipmentsApi.getTracking(transportId).catch(() => null),
        ]);

        const shipmentData = (shipmentRes as any)?.data ?? shipmentRes;
        setShipment(shipmentData);

        const trackingRaw = trackingRes
          ? ((trackingRes as any)?.data?.results ?? (trackingRes as any)?.data ?? (trackingRes as any)?.results ?? (Array.isArray(trackingRes) ? trackingRes : []))
          : [];

        const trackingSteps: TimelineStep[] = (Array.isArray(trackingRaw) ? trackingRaw : []).map((t: any) => ({
          status: t.status ?? 'update',
          time: t.created_at ?? t.timestamp ?? shipmentData?.updated_at ?? shipmentData?.created_at,
          completed: true,
          note: t.notes ?? t.location ?? '',
        }));

        if (trackingSteps.length === 0) {
          const status = shipmentData?.status ?? 'pending';
          setSteps([
            {
              status,
              time: shipmentData?.updated_at ?? shipmentData?.created_at,
              completed: true,
              note: `Current shipment status: ${status}`,
            },
          ]);
        } else {
          setSteps(trackingSteps);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [transportId]);

  const progress = useMemo(() => {
    const status = String(shipment?.status ?? '').toLowerCase();
    if (status.includes('delivered')) return 100;
    if (status.includes('transit')) return 65;
    if (status.includes('pickup')) return 25;
    return 10;
  }, [shipment?.status]);

  const formatTime = (timeString?: string) => {
    if (!timeString) return '-';
    const d = new Date(timeString);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Truck className="h-5 w-5" />
            <span>Transport Details</span>
          </DialogTitle>
          <DialogDescription>
            Track the real-time status of shipment {shipment?.shipment_number || transportId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{shipment?.resource_name || shipment?.catalog_item_name || 'Resource'}</h3>
                <Badge variant="outline">{shipment?.quantity ?? '-'} units</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">From:</p>
                  <p>{shipment?.origin_hospital_name || '-'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">To:</p>
                  <p>{shipment?.destination_hospital_name || '-'}</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm">
                <p className="font-medium">Current Status: {shipment?.status || '-'}</p>
                <p className="text-muted-foreground">Updated: {formatTime(shipment?.updated_at || shipment?.created_at)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Timeline</h4>
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={`${step.status}-${index}`} className="flex items-start space-x-4">
                    <div className="flex flex-col items-center">
                      {step.completed ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Clock className="h-5 w-5 text-gray-400" />}
                      {index < steps.length - 1 && <div className="w-0.5 h-8 mt-2 bg-gray-200" />}
                    </div>
                    <div className="flex-1 space-y-1 pb-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{step.status}</p>
                        <span className="text-sm text-muted-foreground">{formatTime(step.time)}</span>
                      </div>
                      {step.note && <p className="text-sm text-muted-foreground">{step.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}