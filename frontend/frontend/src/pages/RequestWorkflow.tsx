import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { requestsApi, shipmentsApi, staffApi } from '@/services/api';
import { RequestStatusStepper } from '@/components/request/RequestStatusStepper';
import { SLATimer } from '@/components/request/SLATimer';
import { ClinicalMetadataBadges } from '@/components/resource/ClinicalMetadataBadges';
import { ChevronDown, ChevronUp, Loader2, AlertTriangle, Truck } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

type WorkflowState = 'requested' | 'reserved' | 'in_transit' | 'received' | 'closed';
type SortBy = 'newest' | 'status' | 'hospital' | 'urgency';

interface StaffRow {
  id: string;
  fullName: string;
  phone?: string;
}

interface ShipmentInfo {
  id: string;
  requestId?: string;
  status: string;
  dispatchToken?: string;
  receiveToken?: string;
  deliveryPersonnelName?: string;
  deliveryPersonnelPhone?: string;
  vehicleInfo?: string;
}

interface MappedRequest {
  id: string;
  resourceName: string;
  catalogItemId?: string;
  resourceType: 'drugs' | 'blood' | 'organs' | 'equipment';
  requestingHospitalId?: string;
  supplyingHospitalId?: string;
  requestingHospital: string;
  providingHospital: string;
  quantity: number;
  urgency: 'routine' | 'urgent' | 'critical';
  status: string;
  requestedAt: string;
  justification?: string;
  bloodType?: string;
  coldChainRequired?: boolean;
  coldChainTemp?: string;
  lotNumber?: string;
  expiryDate?: string;
  reservationExpiry?: string;
  estimatedDelivery?: string;
  dispatchToken?: string;
  receiveToken?: string;
}

const WORKFLOW_STATES: WorkflowState[] = ['requested', 'reserved', 'in_transit', 'received', 'closed'];
const STAGE_LABEL: Record<WorkflowState, string> = {
  requested: 'Requested',
  reserved: 'Reserved',
  in_transit: 'In Transit',
  received: 'Received',
  closed: 'Closed',
};

const normalizeStatus = (status: string): string => (status || '').toLowerCase().replace(/[-\s]/g, '_');

const mapStatus = (status: string): WorkflowState => {
  const normalized = normalizeStatus(status);
  if (normalized === 'pending' || normalized === 'requested' || normalized === 'new') return 'requested';
  if (normalized === 'approved' || normalized === 'reserved') return 'reserved';
  if (normalized === 'dispatched' || normalized === 'in_transit' || normalized === 'intransit' || normalized === 'shipped') return 'in_transit';
  if (normalized === 'delivered' || normalized === 'fulfilled' || normalized === 'received') return 'received';
  return 'closed';
};

const takeToken = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const mapApiRequest = (req: any): MappedRequest => ({
  id: String(req?.id || ''),
  resourceName: req?.catalog_item_name || req?.resource_name || req?.resource?.name || 'Unknown Resource',
  catalogItemId: req?.catalog_item || req?.catalog_item_id,
  resourceType: (req?.resource_type || req?.resource?.type || 'drugs') as MappedRequest['resourceType'],
  requestingHospitalId: String(req?.requesting_hospital || req?.requesting_hospital_id || req?.hospital_id || ''),
  supplyingHospitalId: String(req?.supplying_hospital || req?.supplying_hospital_id || ''),
  requestingHospital: req?.requesting_hospital_name || req?.hospital?.name || req?.hospital_name || '',
  providingHospital: req?.supplying_hospital_name || req?.providing_hospital_name || req?.source_hospital_name || '',
  quantity: req?.quantity_requested ?? req?.quantity ?? 0,
  urgency: (
    req?.urgency ||
    (req?.priority === 'emergency' ? 'critical' : req?.priority === 'urgent' ? 'urgent' : 'routine')
  ) as MappedRequest['urgency'],
  status: String(req?.status || 'pending'),
  requestedAt: req?.created_at || new Date().toISOString(),
  justification: req?.justification || req?.notes,
  bloodType: req?.blood_type || req?.metadata?.blood_type,
  coldChainRequired: req?.cold_chain_required || req?.metadata?.cold_chain_required,
  coldChainTemp: req?.cold_chain_temp || req?.metadata?.cold_chain_temp,
  lotNumber: req?.lot_number || req?.metadata?.lot_number,
  expiryDate: req?.expiry_date || req?.metadata?.expiry_date,
  reservationExpiry: req?.reservation_expiry || req?.reserved_until,
  estimatedDelivery: req?.estimated_delivery || req?.estimated_delivery_at,
  dispatchToken: takeToken(req?.dispatch_token),
  receiveToken: takeToken(req?.receive_token, req?.receiver_token),
});

const mapShipment = (shipment: any): ShipmentInfo => ({
  id: String(shipment?.id || ''),
  requestId: String(shipment?.request || shipment?.request_id || shipment?.resource_request || shipment?.resource_request_id || ''),
  status: String(shipment?.status || ''),
  dispatchToken: takeToken(shipment?.dispatch_token),
  receiveToken: takeToken(shipment?.receive_token, shipment?.receiver_token),
  deliveryPersonnelName: shipment?.rider_name || shipment?.driver_name || shipment?.delivery_personnel_name || '',
  deliveryPersonnelPhone: shipment?.rider_phone || shipment?.driver_phone || shipment?.delivery_personnel_phone || '',
  vehicleInfo: shipment?.vehicle_info || '',
});

const downloadQrSvg = (svgId: string, fileName: string) => {
  const element = document.getElementById(svgId);
  if (!element) return false;
  if (!(element instanceof SVGElement)) return false;

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(element);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
};

const isPendingForProviderAction = (status: string): boolean => {
  const normalized = normalizeStatus(status);
  return normalized === 'pending' || normalized === 'requested' || normalized === 'new';
};

const RequestWorkflow = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<MappedRequest[]>([]);
  const [shipments, setShipments] = useState<ShipmentInfo[]>([]);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [decisionLoadingId, setDecisionLoadingId] = useState<string | null>(null);
  const [decisionProcessing, setDecisionProcessing] = useState<'approved' | 'rejected' | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [requestDateFilter, setRequestDateFilter] = useState('all');

  const [selectedStage, setSelectedStage] = useState<Record<string, WorkflowState>>({});

  const [personnelMode, setPersonnelMode] = useState<'existing' | 'external'>('existing');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [externalPersonnelName, setExternalPersonnelName] = useState('');
  const [externalPersonnelPhone, setExternalPersonnelPhone] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');

  const [trackingStatus, setTrackingStatus] = useState('in_transit');
  const [trackingLocation, setTrackingLocation] = useState('');
  const [trackingNotes, setTrackingNotes] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [verifyDispatchToken, setVerifyDispatchToken] = useState('');

  const [receiveDispatchToken, setReceiveDispatchToken] = useState('');
  const [receiveTokenInput, setReceiveTokenInput] = useState('');
  const [receiveQuantity, setReceiveQuantity] = useState('1');
  const [receiveNotes, setReceiveNotes] = useState('');

  const [receiverName, setReceiverName] = useState('');
  const [receiverPosition, setReceiverPosition] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  const userHospitalId = String(user?.hospital_id || '');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const [requestRes, shipmentRes, staffRes] = await Promise.all([
        requestsApi.getAll(),
        shipmentsApi.getAll().catch(() => []),
        staffApi.getAll({ limit: '200' }).catch(() => []),
      ]);

      const requestRaw = requestRes?.data?.results || requestRes?.data || requestRes?.results || requestRes || [];
      const shipmentRaw = shipmentRes?.data?.results || shipmentRes?.data || shipmentRes?.results || shipmentRes || [];
      const staffRaw = staffRes?.data?.results || staffRes?.data || staffRes?.results || staffRes || [];

      const mapped = Array.isArray(requestRaw) ? requestRaw.map(mapApiRequest) : [];
      const mappedShipments = Array.isArray(shipmentRaw) ? shipmentRaw.map(mapShipment) : [];
      const mappedStaff = (Array.isArray(staffRaw) ? staffRaw : []).map((item: any) => ({
        id: String(item?.id || ''),
        fullName: item?.full_name || item?.name || item?.email || 'Staff',
        phone: item?.phone || item?.mobile || '',
      }));

      setRequests(mapped);
      setShipments(mappedShipments);
      setStaffRows(mappedStaff);

      const stageSeed: Record<string, WorkflowState> = {};
      mapped.forEach((request) => {
        stageSeed[request.id] = mapStatus(request.status);
      });
      setSelectedStage(stageSeed);

      if (mapped.length > 0 && !expandedId) {
        setExpandedId(mapped[0].id);
      }

      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const getSLATarget = (requestedAt: string, urgency: string) => {
    const date = new Date(requestedAt);
    switch (urgency) {
      case 'critical':
        date.setHours(date.getHours() + 4);
        break;
      case 'urgent':
        date.setHours(date.getHours() + 48);
        break;
      default:
        date.setDate(date.getDate() + 5);
    }
    return date.toISOString();
  };

  const incomingRequests = useMemo(() => {
    return requests.filter((request) => !!userHospitalId && request.supplyingHospitalId === userHospitalId);
  }, [requests, userHospitalId]);

  const outgoingRequests = useMemo(() => {
    return requests.filter((request) => !!userHospitalId && request.requestingHospitalId === userHospitalId);
  }, [requests, userHospitalId]);

  const hospitalOptions = useMemo(() => {
    const set = new Set<string>();
    [...incomingRequests, ...outgoingRequests].forEach((request) => {
      if (request.requestingHospital) set.add(request.requestingHospital);
      if (request.providingHospital) set.add(request.providingHospital);
    });
    return Array.from(set).sort();
  }, [incomingRequests, outgoingRequests]);

  const applyFiltersAndSort = (items: MappedRequest[]) => {
    const filtered = items.filter((request) => {
      const stage = mapStatus(request.status);
      const hospitalMatched =
        hospitalFilter === 'all' ||
        request.requestingHospital === hospitalFilter ||
        request.providingHospital === hospitalFilter;
      const resourceTypeMatched = resourceTypeFilter === 'all' || request.resourceType === resourceTypeFilter;
      const statusMatched = statusFilter === 'all' || stage === statusFilter;

      const requestDate = new Date(request.requestedAt);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastSevenDays = new Date(startOfToday);
      lastSevenDays.setDate(lastSevenDays.getDate() - 7);
      const requestDateMatched =
        requestDateFilter === 'all' ||
        (requestDateFilter === 'today' && requestDate >= startOfToday) ||
        (requestDateFilter === 'last_7_days' && requestDate >= lastSevenDays);

      return hospitalMatched && resourceTypeMatched && statusMatched && requestDateMatched;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
      }
      if (sortBy === 'status') {
        return mapStatus(a.status).localeCompare(mapStatus(b.status));
      }
      if (sortBy === 'hospital') {
        return a.requestingHospital.localeCompare(b.requestingHospital);
      }
      const urgencyOrder: Record<MappedRequest['urgency'], number> = { critical: 0, urgent: 1, routine: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  };

  const displayIncoming = useMemo(() => applyFiltersAndSort(incomingRequests), [
    incomingRequests,
    sortBy,
    hospitalFilter,
    resourceTypeFilter,
    statusFilter,
    requestDateFilter,
  ]);

  const displayOutgoing = useMemo(() => applyFiltersAndSort(outgoingRequests), [
    outgoingRequests,
    sortBy,
    hospitalFilter,
    resourceTypeFilter,
    statusFilter,
    requestDateFilter,
  ]);

  const displayRequests = activeTab === 'incoming' ? displayIncoming : displayOutgoing;

  const incomingByResource = Object.values(
    incomingRequests.reduce<Record<string, {
      resourceName: string;
      totalRequests: number;
      requestingHospitals: Set<string>;
      pendingCount: number;
    }>>((acc, request) => {
      const key = request.catalogItemId || request.resourceName;
      if (!acc[key]) {
        acc[key] = {
          resourceName: request.resourceName,
          totalRequests: 0,
          requestingHospitals: new Set<string>(),
          pendingCount: 0,
        };
      }

      acc[key].totalRequests += 1;
      acc[key].requestingHospitals.add(request.requestingHospital || 'Unknown Hospital');
      if (isPendingForProviderAction(request.status)) {
        acc[key].pendingCount += 1;
      }

      return acc;
    }, {})
  );

  const getRequestShipment = (request: MappedRequest): ShipmentInfo | null => {
    const byRequestId = shipments.find((shipment) => shipment.requestId && shipment.requestId === request.id);
    if (byRequestId) return byRequestId;

    return shipments.find(
      (shipment) =>
        takeToken(shipment.dispatchToken, shipment.receiveToken) &&
        (shipment.dispatchToken === request.dispatchToken || shipment.receiveToken === request.receiveToken)
    ) || null;
  };

  const getDispatchToken = (request: MappedRequest, shipment: ShipmentInfo | null) =>
    takeToken(request.dispatchToken, shipment?.dispatchToken);

  const getReceiveToken = (request: MappedRequest, shipment: ShipmentInfo | null) =>
    takeToken(request.receiveToken, shipment?.receiveToken);

  const handleDecision = async (request: MappedRequest, decision: 'approved' | 'rejected') => {
    setDecisionLoadingId(request.id);
    setDecisionProcessing(decision);
    try {
      await requestsApi.approve(request.id, {
        decision,
        quantity_approved: decision === 'approved' ? request.quantity : undefined,
        reason: decision === 'rejected' ? 'Rejected by provider hospital' : undefined,
      });

      await loadRequests();

      toast({
        title: decision === 'approved' ? 'Request approved' : 'Request rejected',
        description: decision === 'approved' ? 'Request moved to Reserved stage.' : 'Requester hospital notified.',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to update request',
        description: err?.message || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setDecisionLoadingId(null);
      setDecisionProcessing(null);
    }
  };

  const handleDispatch = async (request: MappedRequest) => {
    const selectedStaff = staffRows.find((staff) => staff.id === selectedStaffId);
    const deliveryPersonnelName = personnelMode === 'existing' ? selectedStaff?.fullName || '' : externalPersonnelName.trim();
    const deliveryPersonnelPhone = personnelMode === 'existing' ? selectedStaff?.phone || '' : externalPersonnelPhone.trim();

    if (!deliveryPersonnelName || !deliveryPersonnelPhone || !vehicleInfo.trim()) {
      toast({
        title: 'Missing dispatch information',
        description: 'Delivery personnel name, phone, and vehicle details are required.',
        variant: 'destructive',
      });
      return;
    }

    setActionLoading(true);
    try {
      await requestsApi.dispatch(request.id, {
        notes: dispatchNote,
        rider_name: deliveryPersonnelName,
        rider_phone: deliveryPersonnelPhone,
        vehicle_info: vehicleInfo.trim(),
      });
      await loadRequests();
      toast({ title: 'Dispatch initiated', description: 'QR and receiver token are available for handover flow.' });
    } catch (err: any) {
      toast({ title: 'Dispatch failed', description: err?.message || 'Unable to dispatch request.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTracking = async (request: MappedRequest, shipment: ShipmentInfo | null) => {
    if (!shipment?.id) {
      toast({
        title: 'No shipment available',
        description: 'Dispatch the request first before adding transit updates.',
        variant: 'destructive',
      });
      return;
    }

    if (!trackingLocation.trim()) {
      toast({ title: 'Location required', description: 'Please provide current location.', variant: 'destructive' });
      return;
    }

    setActionLoading(true);
    try {
      await shipmentsApi.addTracking(shipment.id, {
        status: trackingStatus,
        location: trackingLocation.trim(),
        notes: [trackingNotes, paymentDetails].filter(Boolean).join(' | '),
      });
      await loadRequests();
      toast({ title: 'Shipment progress updated' });
      setTrackingLocation('');
      setTrackingNotes('');
    } catch (err: any) {
      toast({ title: 'Tracking update failed', description: err?.message || 'Please retry.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReceipt = async (request: MappedRequest, shipment: ShipmentInfo | null) => {
    if (!shipment?.id) {
      toast({ title: 'No shipment found', description: 'Shipment must exist before confirmation.', variant: 'destructive' });
      return;
    }

    if (!receiveDispatchToken.trim() || !receiveTokenInput.trim()) {
      toast({ title: 'Both tokens required', description: 'Dispatch and receiver tokens are required.', variant: 'destructive' });
      return;
    }

    setActionLoading(true);
    try {
      await requestsApi.confirmDelivery({
        dispatch_token: receiveDispatchToken.trim(),
        receive_token: receiveTokenInput.trim(),
        shipment_id: shipment.id,
        quantity_received: Number(receiveQuantity || '0') || request.quantity || 1,
        notes: receiveNotes,
      });
      await loadRequests();
      toast({ title: 'Receipt confirmed', description: 'Request moved to Received stage.' });
    } catch (err: any) {
      toast({ title: 'Receipt confirmation failed', description: err?.message || 'Please check tokens.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceiverConfirmation = async (shipment: ShipmentInfo | null) => {
    if (!shipment?.id) {
      toast({ title: 'No shipment found', variant: 'destructive' });
      return;
    }

    if (!receiverName.trim() || !receiverPosition.trim()) {
      toast({ title: 'Receiver details required', description: 'Provide receiver name and role.', variant: 'destructive' });
      return;
    }

    setActionLoading(true);
    try {
      await shipmentsApi.confirmHandover(shipment.id, {
        receiver_name: receiverName.trim(),
        receiver_position: receiverPosition.trim(),
        notes: receiveNotes,
      });
      await loadRequests();
      toast({ title: 'Receiver confirmation saved' });
    } catch (err: any) {
      toast({ title: 'Confirmation failed', description: err?.message || 'Please retry.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseRequest = async (request: MappedRequest) => {
    setActionLoading(true);
    try {
      await requestsApi.update(request.id, { status: 'closed' });
      await loadRequests();
      toast({ title: 'Request closed', description: 'Final lifecycle record has been stored.' });
    } catch (err: any) {
      toast({ title: 'Close failed', description: err?.message || 'Backend rejected status update.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Request Workflow" subtitle="Track and manage resource requests with SLA monitoring">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading requests...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Request Workflow" subtitle="Track and manage resource requests with SLA monitoring">
        <div className="flex flex-col items-center justify-center h-64">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium mb-2">Failed to load requests</h3>
          <p className="text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="outline" onClick={loadRequests}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Request Workflow" subtitle="Track and manage incoming/outgoing requests with integrated transport workflow">
      <div className="space-y-4">
        {incomingByResource.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="font-medium mb-3">Incoming Requests by Shared Resource</p>
              <div className="grid gap-3 md:grid-cols-2">
                {incomingByResource.map((entry) => (
                  <div key={entry.resourceName} className="rounded-md border p-3">
                    <p className="font-medium">{entry.resourceName}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {entry.totalRequests} total requests from {entry.requestingHospitals.size} hospitals
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary">Pending: {entry.pendingCount}</Badge>
                      <Badge variant="outline">Requesters: {Array.from(entry.requestingHospitals).join(', ')}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <p className="font-medium mb-3">Sorting and Filters</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                <SelectTrigger><SelectValue placeholder="Sort by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="urgency">Urgency</SelectItem>
                </SelectContent>
              </Select>

              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger><SelectValue placeholder="Hospital" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitalOptions.map((hospital) => (
                    <SelectItem key={hospital} value={hospital}>{hospital}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
                <SelectTrigger><SelectValue placeholder="Medicine or resource type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="drugs">Drugs</SelectItem>
                  <SelectItem value="blood">Blood</SelectItem>
                  <SelectItem value="organs">Organs</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {WORKFLOW_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{STAGE_LABEL[state]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={requestDateFilter} onValueChange={setRequestDateFilter}>
                <SelectTrigger><SelectValue placeholder="Request date" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'incoming' | 'outgoing')}>
          <TabsList>
            <TabsTrigger value="incoming">Incoming Requests ({displayIncoming.length})</TabsTrigger>
            <TabsTrigger value="outgoing">Outgoing Requests ({displayOutgoing.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="space-y-4">
            {displayIncoming.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No incoming resource requests found.</div>
            )}
          </TabsContent>

          <TabsContent value="outgoing" className="space-y-4">
            {displayOutgoing.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No outgoing resource requests found.</div>
            )}
          </TabsContent>
        </Tabs>

        {displayRequests.map((request) => {
          const isExpanded = expandedId === request.id;
          const currentStage = selectedStage[request.id] || mapStatus(request.status);
          const mappedStatus = mapStatus(request.status);

          const shipment = getRequestShipment(request);
          const dispatchToken = getDispatchToken(request, shipment);
          const receiveToken = getReceiveToken(request, shipment);

          const isSender = !!userHospitalId && request.supplyingHospitalId === userHospitalId;
          const isReceiver = !!userHospitalId && request.requestingHospitalId === userHospitalId;

          return (
            <Collapsible key={request.id} open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : request.id)}>
              <Card className={request.urgency === 'critical' ? 'ring-2 ring-destructive' : ''}>
                <CollapsibleTrigger asChild>
                  <CardContent className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">
                          {request.resourceType === 'blood' ? '🩸' : request.resourceType === 'drugs' ? '💊' : request.resourceType === 'organs' ? '🫀' : '🏥'}
                        </div>
                        <div>
                          <h3 className="font-semibold">{request.resourceName}</h3>
                          <p className="text-sm text-muted-foreground">{request.requestingHospital} {'->'} {request.providingHospital}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={request.urgency === 'critical' ? 'destructive' : request.urgency === 'urgent' ? 'default' : 'secondary'}>
                          {request.urgency}
                        </Badge>
                        <Badge variant="outline">{request.quantity} units</Badge>
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-6 px-6 space-y-6 border-t">
                    <RequestStatusStepper
                      status={mappedStatus}
                      urgency={request.urgency}
                      requestedAt={request.requestedAt}
                      reservationExpiry={request.reservationExpiry}
                      estimatedDelivery={request.estimatedDelivery}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <SLATimer
                        targetTime={getSLATarget(request.requestedAt, request.urgency)}
                        urgency={request.urgency}
                        status={mappedStatus}
                      />
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Clinical Metadata</p>
                        <ClinicalMetadataBadges
                          metadata={{
                            bloodType: request.bloodType,
                            coldChainRequired: request.coldChainRequired,
                            coldChainTemp: request.coldChainTemp,
                            lotNumber: request.lotNumber,
                            expiryDate: request.expiryDate,
                          }}
                          compact
                        />
                        {request.justification && (
                          <p className="text-sm italic text-muted-foreground">"{request.justification}"</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Lifecycle Actions (click any stage)</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {WORKFLOW_STATES.map((stage, index) => (
                          <Button
                            key={`${request.id}-${stage}`}
                            type="button"
                            size="sm"
                            variant={currentStage === stage ? 'default' : 'outline'}
                            onClick={() => setSelectedStage((prev) => ({ ...prev, [request.id]: stage }))}
                          >
                            {STAGE_LABEL[stage]}
                            {index < WORKFLOW_STATES.length - 1 ? <span className="ml-2">{'>'}</span> : null}
                          </Button>
                        ))}
                        <Badge variant="outline">Current backend stage: {STAGE_LABEL[mappedStatus]}</Badge>
                        {isSender ? <Badge>Sender</Badge> : null}
                        {isReceiver ? <Badge variant="secondary">Receiver</Badge> : null}
                      </div>
                    </div>

                    {currentStage === 'requested' && (
                      <div className="space-y-2 rounded-lg border p-3">
                        <p className="text-sm font-medium">Requested</p>
                        {isSender ? (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleDecision(request, 'approved')}
                              disabled={decisionLoadingId === request.id || !isPendingForProviderAction(request.status)}
                            >
                              {decisionLoadingId === request.id && decisionProcessing === 'approved' ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Approving...
                                </>
                              ) : (
                                'Approve request'
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDecision(request, 'rejected')}
                              disabled={decisionLoadingId === request.id || !isPendingForProviderAction(request.status)}
                            >
                              {decisionLoadingId === request.id && decisionProcessing === 'rejected' ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Rejecting...
                                </>
                              ) : (
                                'Reject request'
                              )}
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Receiver view: request details are visible while awaiting sender decision.</p>
                        )}
                      </div>
                    )}

                    {currentStage === 'reserved' && (
                      <div className="space-y-3 rounded-lg border p-3">
                        <p className="text-sm font-medium">Reserved</p>

                        {isSender ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <Label>Delivery personnel source</Label>
                                <Select value={personnelMode} onValueChange={(value) => setPersonnelMode(value as 'existing' | 'external')}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="existing">Select from existing staff</SelectItem>
                                    <SelectItem value="external">Temporary or external personnel</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Vehicle details</Label>
                                <Input value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} placeholder="Vehicle number/details" />
                              </div>
                            </div>

                            {personnelMode === 'existing' ? (
                              <div>
                                <Label>Select delivery personnel</Label>
                                <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                                  <SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger>
                                  <SelectContent>
                                    {staffRows.length === 0 ? (
                                      <SelectItem value="none" disabled>No staff available</SelectItem>
                                    ) : (
                                      staffRows.map((staff) => (
                                        <SelectItem key={staff.id} value={staff.id}>{staff.fullName}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <Label>Temporary delivery personnel name</Label>
                                  <Input value={externalPersonnelName} onChange={(event) => setExternalPersonnelName(event.target.value)} placeholder="Full name" />
                                </div>
                                <div>
                                  <Label>Temporary delivery personnel phone</Label>
                                  <Input value={externalPersonnelPhone} onChange={(event) => setExternalPersonnelPhone(event.target.value)} placeholder="Phone" />
                                </div>
                              </div>
                            )}

                            <div>
                              <Label>Dispatch notes</Label>
                              <Textarea rows={2} value={dispatchNote} onChange={(event) => setDispatchNote(event.target.value)} placeholder="Transport/handling notes" />
                            </div>

                            <Button disabled={actionLoading} onClick={() => handleDispatch(request)}>
                              <Truck className="h-4 w-4 mr-2" /> Assign delivery personnel and dispatch
                            </Button>

                            {dispatchToken ? (
                              <div className="rounded-md border p-3">
                                <p className="text-sm font-medium">Dispatch QR and token</p>
                                <p className="mt-1 break-all font-mono text-xs">{dispatchToken}</p>
                                <div className="mt-3 flex flex-wrap items-end gap-3">
                                  <QRCodeSVG id={`dispatch-qr-${request.id}`} value={dispatchToken} size={160} />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      const ok = downloadQrSvg(`dispatch-qr-${request.id}`, `dispatch-token-${request.id}.svg`);
                                      if (!ok) {
                                        toast({ title: 'QR download failed', description: 'Generated QR not found.', variant: 'destructive' });
                                      }
                                    }}
                                  >
                                    Download QR code
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Receiver can view assigned delivery personnel and receiver token in this stage.</p>
                            <p className="text-sm"><span className="font-medium">Delivery personnel:</span> {shipment?.deliveryPersonnelName || 'Not assigned yet'}</p>
                            <p className="text-sm"><span className="font-medium">Contact:</span> {shipment?.deliveryPersonnelPhone || 'Not available'}</p>
                            <p className="text-sm"><span className="font-medium">Receiver token:</span> <span className="font-mono text-xs break-all">{receiveToken || 'Not available yet'}</span></p>
                          </div>
                        )}
                      </div>
                    )}

                    {currentStage === 'in_transit' && (
                      <div className="space-y-3 rounded-lg border p-3">
                        <p className="text-sm font-medium">In Transit</p>

                        {isSender ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-3">
                              <div>
                                <Label>Shipment progress status</Label>
                                <Input value={trackingStatus} onChange={(event) => setTrackingStatus(event.target.value)} placeholder="in_transit" />
                              </div>
                              <div>
                                <Label>Current location</Label>
                                <Input value={trackingLocation} onChange={(event) => setTrackingLocation(event.target.value)} placeholder="Checkpoint/city" />
                              </div>
                              <div>
                                <Label>Tracking notes</Label>
                                <Input value={trackingNotes} onChange={(event) => setTrackingNotes(event.target.value)} placeholder="Delivery update" />
                              </div>
                            </div>

                            <div>
                              <Label>Delivery/payment details</Label>
                              <Textarea rows={2} value={paymentDetails} onChange={(event) => setPaymentDetails(event.target.value)} placeholder="Payment mode, amount, or settlement details" />
                            </div>

                            <Button disabled={actionLoading} onClick={() => handleAddTracking(request, shipment)}>Mark shipment progress</Button>

                            <div>
                              <Label>Verify QR token</Label>
                              <Input value={verifyDispatchToken} onChange={(event) => setVerifyDispatchToken(event.target.value)} placeholder="Enter scanned dispatch token" />
                              <p className="mt-1 text-xs text-muted-foreground">
                                {verifyDispatchToken && dispatchToken && verifyDispatchToken.trim() === dispatchToken
                                  ? 'QR token verified successfully.'
                                  : 'Token verification pending.'}
                              </p>
                            </div>

                            <Button variant="outline" disabled={actionLoading} onClick={() => handleCloseRequest(request)}>
                              Close request after delivery confirmation
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">Receiver confirms handover using dispatch token and receiver token.</p>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <Label>Dispatch token</Label>
                                <Input value={receiveDispatchToken} onChange={(event) => setReceiveDispatchToken(event.target.value)} placeholder="From QR" />
                              </div>
                              <div>
                                <Label>Receiver token</Label>
                                <Input value={receiveTokenInput} onChange={(event) => setReceiveTokenInput(event.target.value)} placeholder="Receiver token" />
                              </div>
                              <div>
                                <Label>Quantity received</Label>
                                <Input type="number" min={1} value={receiveQuantity} onChange={(event) => setReceiveQuantity(event.target.value)} />
                              </div>
                              <div>
                                <Label>Delivery notes</Label>
                                <Input value={receiveNotes} onChange={(event) => setReceiveNotes(event.target.value)} placeholder="Condition and receipt note" />
                              </div>
                            </div>
                            <Button disabled={actionLoading} onClick={() => handleConfirmReceipt(request, shipment)}>Confirm receipt via QR/token</Button>
                          </>
                        )}
                      </div>
                    )}

                    {currentStage === 'received' && (
                      <div className="space-y-3 rounded-lg border p-3">
                        <p className="text-sm font-medium">Received</p>
                        {isReceiver ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <Label>Receiver name</Label>
                                <Input value={receiverName} onChange={(event) => setReceiverName(event.target.value)} placeholder="Person receiving shipment" />
                              </div>
                              <div>
                                <Label>Receiver designation</Label>
                                <Input value={receiverPosition} onChange={(event) => setReceiverPosition(event.target.value)} placeholder="Role/designation" />
                              </div>
                            </div>
                            <div>
                              <Label>Confirmation notes</Label>
                              <Textarea rows={2} value={receiveNotes} onChange={(event) => setReceiveNotes(event.target.value)} placeholder="Confirmation and condition notes" />
                            </div>
                            <Button disabled={actionLoading} onClick={() => handleReceiverConfirmation(shipment)}>Provide confirmation</Button>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Sender view: waiting for receiver confirmation.</p>
                        )}
                      </div>
                    )}

                    {currentStage === 'closed' && (
                      <div className="space-y-3 rounded-lg border p-3">
                        <p className="text-sm font-medium">Closed</p>
                        <p className="text-sm text-muted-foreground">Final lifecycle record for audit and reporting.</p>
                        <div className="grid gap-2 md:grid-cols-2 text-sm">
                          <p><span className="font-medium">Dispatch token:</span> {dispatchToken || 'N/A'}</p>
                          <p><span className="font-medium">Receiver token:</span> {receiveToken || 'N/A'}</p>
                          <p><span className="font-medium">Shipment:</span> {shipment?.id || 'N/A'}</p>
                          <p><span className="font-medium">Resource:</span> {request.resourceName}</p>
                        </div>
                        {(isSender || isReceiver) ? (
                          <Button variant="outline" disabled={actionLoading} onClick={() => handleCloseRequest(request)}>Finalize closed record</Button>
                        ) : null}
                      </div>
                    )}

                    <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Token Logic</p>
                      <p className="mt-1">Dispatch token is generated at dispatch and encoded in QR for transport verification.</p>
                      <p className="mt-1">Receiver token becomes visible to the receiving hospital in Reserved/In Transit stages.</p>
                      <p className="mt-1">Closing workflow should happen after token-based receipt confirmation and receiver confirmation.</p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </AppLayout>
  );
};

export default RequestWorkflow;
