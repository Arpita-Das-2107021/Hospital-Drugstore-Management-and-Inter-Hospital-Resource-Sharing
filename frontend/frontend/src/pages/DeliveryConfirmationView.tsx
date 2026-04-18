import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { requestsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { mapDeliveryConfirmationError } from '@/utils/deliveryConfirmation';

const DeliveryConfirmationView = () => {
  const { toast } = useToast();
  const [qrPayload, setQrPayload] = useState('');
  const [quantityReceived, setQuantityReceived] = useState('1');
  const [notes, setNotes] = useState('');
  const [requestId, setRequestId] = useState('');
  const [resultMessage, setResultMessage] = useState('');

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const quantity = Math.max(1, Number.parseInt(quantityReceived, 10) || 1);
      return requestsApi.transferConfirm(requestId, {
        qrPayload,
        quantity_received: quantity,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    },
    onSuccess: () => {
      setResultMessage('Delivery confirmed. Shipment marked delivered and request fulfilled.');
      toast({ title: 'Delivery confirmed' });
    },
    onError: (error: unknown) => {
      const mapped = mapDeliveryConfirmationError(error);
      const message = mapped.description || 'Failed to confirm delivery.';
      setResultMessage(message);
      toast({
        title: mapped.title,
        description: message,
        variant: 'destructive',
      });
    },
  });

  return (
    <AppLayout title="Delivery Confirmation View"
      // subtitle="Scan dispatch token and submit transfer confirmation"
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Delivery Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="request-id">Request ID</Label>
            <Input
              id="request-id"
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
              placeholder="Request UUID"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dispatch-token">QR payload (from receiver scan)</Label>
            <Input
              id="dispatch-token"
              value={qrPayload}
              onChange={(event) => setQrPayload(event.target.value)}
              placeholder="Scan or paste opaque qrPayload"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity-received">Quantity received</Label>
            <Input
              id="quantity-received"
              type="number"
              min={1}
              value={quantityReceived}
              onChange={(event) => setQuantityReceived(event.target.value)}
              placeholder="1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmation-notes">Notes (optional)</Label>
            <Input
              id="confirmation-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional receiver notes"
            />
          </div>

          <Button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending || !requestId || !qrPayload.trim()}
          >
            {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirm delivery
          </Button>

          {resultMessage ? (
            <div className="rounded-md border p-3 text-sm flex items-start gap-2">
              {confirmMutation.isError ? <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" /> : <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />}
              <span>{resultMessage}</span>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Backend validates the scanned qrPayload and returns final workflow status or error.
          </p>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default DeliveryConfirmationView;
