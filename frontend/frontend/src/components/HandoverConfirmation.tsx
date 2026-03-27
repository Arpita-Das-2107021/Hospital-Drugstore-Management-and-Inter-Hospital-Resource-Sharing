import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Package, CheckCircle, Loader2 } from 'lucide-react';
import { shipmentsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface HandoverConfirmationProps {
  transportId: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function HandoverConfirmation({
  transportId,
  onClose,
  onConfirm,
}: HandoverConfirmationProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shipment, setShipment] = useState<unknown>(null);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPosition, setReceiverPosition] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await shipmentsApi.getById(transportId);
        const data = (res as unknown)?.data ?? res;
        setShipment(data);
      } catch {
        toast({ title: 'Failed to load shipment', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [transportId]);

  const submit = async () => {
    if (!receiverName.trim() || !receiverPosition.trim()) return;
    try {
      setSubmitting(true);
      await shipmentsApi.confirmHandover(transportId, {
        receiver_name: receiverName,
        receiver_position: receiverPosition,
        condition: 'good',
        notes,
      });
      toast({ title: 'Handover confirmed', description: 'Shipment receipt was recorded successfully.' });
      onConfirm();
    } catch (err: unknown) {
      toast({ title: 'Failed to confirm handover', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Handover Confirmation</span>
          </DialogTitle>
          <DialogDescription>
            Confirm receipt of shipment {shipment?.shipment_number || transportId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{shipment?.resource_name || shipment?.catalog_item_name || 'Resource'}</h3>
                  <span className="text-sm text-muted-foreground">{shipment?.quantity ?? '-'} units</span>
                </div>

                <Separator />

                <div className="text-sm space-y-1">
                  <p><span className="font-medium">From:</span> {shipment?.origin_hospital_name || '-'}</p>
                  <p><span className="font-medium">To:</span> {shipment?.destination_hospital_name || '-'}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="receiverName">Receiver Name *</Label>
              <Input
                id="receiverName"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="receiverPosition">Position *</Label>
              <Input
                id="receiverPosition"
                value={receiverPosition}
                onChange={(e) => setReceiverPosition(e.target.value)}
                placeholder="e.g. Pharmacist"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="handoverNotes">Notes</Label>
              <Textarea
                id="handoverNotes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condition, discrepancies, or remarks"
              />
            </div>
          </div>
        )}

        <div className="flex justify-between space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading || submitting || !receiverName.trim() || !receiverPosition.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Confirm Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}