import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { requestsApi, shipmentsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface ShipmentRow {
  id: string;
  requestId?: string;
  status: string;
  originHospital: string;
  destinationHospital: string;
  riderName: string;
  riderPhone: string;
  vehicleInfo: string;
  trackingNumber: string;
  estimatedDeliveryAt: string;
}

interface ApprovedRequestRow {
  id: string;
  resource: string;
  requestId: string;
  quantityApproved: number;
}

const mapShipment = (item: unknown): ShipmentRow => ({
  id: String(item.id || ''),
  requestId: String(item.request_id || item.request || item.resource_request_id || item.resource_request || '') || undefined,
  status: String(item.status || 'pending_dispatch'),
  originHospital: item.origin_hospital_name || '-',
  destinationHospital: item.destination_hospital_name || '-',
  riderName: item.rider_name || item.driver_name || '-',
  riderPhone: item.rider_phone || item.driver_phone || '-',
  vehicleInfo: item.vehicle_info || item.vehicle_number || '-',
  trackingNumber: item.tracking_number || '-',
  estimatedDeliveryAt: item.estimated_delivery_at || '',
});

const ShipmentDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dispatchForm, setDispatchForm] = useState<Record<string, { rider_name: string; rider_phone: string; vehicle_info: string }>>({});
  const [lastDispatchQrPayload, setLastDispatchQrPayload] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['shipment-dashboard-requests'],
    queryFn: async () => {
      const res: unknown = await requestsApi.getAll();
      return res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
    },
  });

  const shipmentsQuery = useQuery({
    queryKey: ['shipment-dashboard-shipments'],
    queryFn: async () => {
      const res: unknown = await shipmentsApi.getAll();
      const raw = res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
      return (Array.isArray(raw) ? raw : []).map(mapShipment);
    },
  });

  const approvedRequests = useMemo(() => {
    const hospitalId = user?.hospital_id || '';
    const items = Array.isArray(requestsQuery.data) ? requestsQuery.data : [];
    return items
      .filter((item: unknown) => {
        const status = String(item.status || '').toLowerCase();
        const supplyingHospital = String(item.supplying_hospital || item.supplying_hospital_id || '');
        return ['approved', 'reserved'].includes(status) && (!hospitalId || supplyingHospital === hospitalId);
      })
      .map((item: unknown) => ({
        id: String(item.id || ''),
        requestId: String(item.id || ''),
        resource: item.catalog_item_name || item.resource_name || 'Resource',
        quantityApproved: Number(item.quantity_approved ?? item.quantity_requested ?? 0),
      })) as ApprovedRequestRow[];
  }, [requestsQuery.data, user?.hospital_id]);

  const badges = useMemo(() => {
    const hospitalId = user?.hospital_id || '';
    const requestItems = Array.isArray(requestsQuery.data) ? requestsQuery.data : [];
    const shipmentItems = shipmentsQuery.data || [];

    const pendingRequests = requestItems.filter((item: unknown) => {
      const status = String(item.status || '').toLowerCase();
      if (status !== 'pending') return false;
      const supplyingHospital = String(item.supplying_hospital || item.supplying_hospital_id || '');
      return !hospitalId || supplyingHospital === hospitalId;
    }).length;
    const activeShipments = shipmentItems.filter((item) => ['pending_dispatch', 'dispatched', 'in_transit'].includes(item.status.toLowerCase())).length;
    const confirmationNeeded = shipmentItems.filter((item) => ['dispatched', 'in_transit'].includes(item.status.toLowerCase())).length;

    return { pendingRequests, activeShipments, confirmationNeeded };
  }, [requestsQuery.data, shipmentsQuery.data, user?.hospital_id]);

  const dispatchMutation = useMutation({
    mutationFn: async ({ requestId, quantityApproved, payload }: {
      requestId: string;
      quantityApproved: number;
      payload: { rider_name: string; rider_phone: string; vehicle_info: string };
    }) => {
      await requestsApi.reserve(requestId, {
        requested_quantity: quantityApproved > 0 ? quantityApproved : undefined,
      }).catch(() => undefined);

      const notes = [
        `Delivery personnel: ${payload.rider_name}`,
        payload.rider_phone ? `Phone: ${payload.rider_phone}` : null,
        `Vehicle: ${payload.vehicle_info}`,
      ]
        .filter(Boolean)
        .join(' | ');

      const response: unknown = await requestsApi.dispatch(requestId, { notes });
      return response?.data || response;
    },
    onSuccess: (data: unknown) => {
      const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const deliveryQr = (record.delivery_qr && typeof record.delivery_qr === 'object'
        ? record.delivery_qr
        : {}) as Record<string, unknown>;
      const qrPayload = typeof deliveryQr.qrPayload === 'string' ? deliveryQr.qrPayload : '';

      setLastDispatchQrPayload(qrPayload);
      toast({ title: 'Dispatch created', description: qrPayload ? 'Dispatch QR payload generated.' : 'Shipment dispatch submitted.' });
      queryClient.invalidateQueries({ queryKey: ['shipment-dashboard-requests'] });
      queryClient.invalidateQueries({ queryKey: ['shipment-dashboard-shipments'] });
    },
    onError: (error: unknown) => {
      toast({ title: 'Dispatch failed', description: error?.message || 'Please verify rider info and try again.', variant: 'destructive' });
    },
  });

  return (
    <AppLayout title="Shipment Dashboard"
      // subtitle="Dispatch, monitor, and confirm shipment operations"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Pending Requests</CardTitle></CardHeader>
            <CardContent><Badge variant="secondary">{badges.pendingRequests}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Active Shipments</CardTitle></CardHeader>
            <CardContent><Badge>{badges.activeShipments}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Delivery Confirmation Needed</CardTitle></CardHeader>
            <CardContent><Badge variant="outline">{badges.confirmationNeeded}</Badge></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dispatch Approved Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requestsQuery.isLoading ? (
              <div className="flex items-center"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading approved requests...</div>
            ) : approvedRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved requests pending dispatch.</p>
            ) : (
              approvedRequests.map((request) => {
                const value = dispatchForm[request.requestId] || { rider_name: '', rider_phone: '', vehicle_info: '' };
                return (
                  <div key={request.requestId} className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{request.resource} ({request.quantityApproved} units)</p>
                      <Badge variant="secondary">Request {request.requestId}</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <Label>Rider name</Label>
                        <Input
                          value={value.rider_name}
                          onChange={(event) => setDispatchForm((prev) => ({
                            ...prev,
                            [request.requestId]: { ...value, rider_name: event.target.value },
                          }))}
                        />
                      </div>
                      <div>
                        <Label>Rider phone</Label>
                        <Input
                          value={value.rider_phone}
                          onChange={(event) => setDispatchForm((prev) => ({
                            ...prev,
                            [request.requestId]: { ...value, rider_phone: event.target.value },
                          }))}
                        />
                      </div>
                      <div>
                        <Label>Vehicle info</Label>
                        <Input
                          value={value.vehicle_info}
                          onChange={(event) => setDispatchForm((prev) => ({
                            ...prev,
                            [request.requestId]: { ...value, vehicle_info: event.target.value },
                          }))}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => dispatchMutation.mutate({
                        requestId: request.requestId,
                        quantityApproved: request.quantityApproved,
                        payload: value,
                      })}
                      disabled={dispatchMutation.isPending || !value.rider_name || !value.rider_phone || !value.vehicle_info}
                    >
                      Dispatch shipment
                    </Button>
                  </div>
                );
              })
            )}

            {lastDispatchQrPayload ? (
              <div className="border rounded-md p-4 space-y-3">
                <p className="text-sm font-medium">Latest dispatch QR payload</p>
                <p className="font-mono text-xs break-all">{lastDispatchQrPayload}</p>
                <QRCodeSVG value={lastDispatchQrPayload} size={180} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipment List</CardTitle>
          </CardHeader>
          <CardContent>
            {shipmentsQuery.isLoading ? (
              <div className="flex items-center"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading shipments...</div>
            ) : shipmentsQuery.isError ? (
              <div className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Failed to load shipments.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Rider</TableHead>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(shipmentsQuery.data || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">No shipments available.</TableCell>
                    </TableRow>
                  ) : (
                    (shipmentsQuery.data || []).map((shipment) => (
                      <TableRow key={shipment.id}>
                        <TableCell><Badge variant="outline">{shipment.status}</Badge></TableCell>
                        <TableCell>{shipment.originHospital}</TableCell>
                        <TableCell>{shipment.destinationHospital}</TableCell>
                        <TableCell>
                          <div>{shipment.riderName}</div>
                          <div className="text-xs text-muted-foreground">{shipment.riderPhone}</div>
                        </TableCell>
                        <TableCell>{shipment.trackingNumber}</TableCell>
                        <TableCell>{shipment.estimatedDeliveryAt ? new Date(shipment.estimatedDeliveryAt).toLocaleString() : '-'}</TableCell>
                        <TableCell className="space-x-2">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/shipments/tracking/${shipment.id}`}>Track</Link>
                          </Button>
                          <Button asChild size="sm">
                            <Link to={`/dispatch/scan${shipment.requestId ? `?requestId=${encodeURIComponent(shipment.requestId)}` : ''}`}>
                              Scan and confirm
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ShipmentDashboard;
