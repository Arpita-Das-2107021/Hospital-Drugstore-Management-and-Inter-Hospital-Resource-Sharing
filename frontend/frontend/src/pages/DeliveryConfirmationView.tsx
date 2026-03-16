import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { requestsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

const DeliveryConfirmationView = () => {
  const { toast } = useToast();
  const [dispatchToken, setDispatchToken] = useState('');
  const [receiveToken, setReceiveToken] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [quantityReceived, setQuantityReceived] = useState('1');
  const [notes, setNotes] = useState('');
  const [resultMessage, setResultMessage] = useState('');

  const confirmMutation = useMutation({
    mutationFn: async () => {
      return requestsApi.confirmDelivery({
        dispatch_token: dispatchToken,
        receive_token: receiveToken,
        shipment_id: shipmentId || undefined,
        quantity_received: Number(quantityReceived),
        notes,
      });
    },
    onSuccess: () => {
      setResultMessage('Delivery confirmed. Shipment marked delivered and request fulfilled.');
      toast({ title: 'Delivery confirmed' });
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to confirm delivery.';
      setResultMessage(message);
      toast({
        title: 'Delivery confirmation failed',
        description: message,
        variant: 'destructive',
      });
    },
  });

  return (
    <AppLayout title="Delivery Confirmation View" subtitle="Verify rider and receive tokens to complete delivery">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Delivery Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dispatch-token">Dispatch token (from rider QR)</Label>
            <Input
              id="dispatch-token"
              value={dispatchToken}
              onChange={(event) => setDispatchToken(event.target.value)}
              placeholder="Scan or paste dispatch token"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receive-token">Receive token</Label>
            <Input
              id="receive-token"
              value={receiveToken}
              onChange={(event) => setReceiveToken(event.target.value)}
              placeholder="Enter receive token"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shipment-id">Shipment ID (optional if backend resolves by token)</Label>
              <Input
                id="shipment-id"
                value={shipmentId}
                onChange={(event) => setShipmentId(event.target.value)}
                placeholder="Shipment UUID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="received-qty">Quantity received</Label>
              <Input
                id="received-qty"
                type="number"
                min={1}
                value={quantityReceived}
                onChange={(event) => setQuantityReceived(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delivery-notes">Notes</Label>
            <Textarea
              id="delivery-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Any delivery verification note"
            />
          </div>

          <Button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending || !dispatchToken || !receiveToken}
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
            Common errors are surfaced directly from backend, including invalid token, expired token, and shipment already delivered.
          </p>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default DeliveryConfirmationView;
