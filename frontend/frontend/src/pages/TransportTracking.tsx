import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { 
  Package, 
  Clock, 
  MapPin, 
  Phone, 
  CheckCircle,
  Truck,
  Loader2,
} from 'lucide-react';
import TransportTimeline from '@/components/TransportTimeline';
import HandoverConfirmation from '@/components/HandoverConfirmation';
import { shipmentsApi } from '@/services/api';

interface TransportItem {
  id: string;
  apiId: string;
  requestId: string;
  resource: string;
  quantity: string;
  status: string;
  urgency: string;
  pickupHospital: string;
  deliveryHospital: string;
  driver: { name: string; phone: string; vehicleNumber: string };
  timeline: { status: string; time: string; completed: boolean; estimated?: boolean }[];
  estimatedArrival: string;
  progress: number;
}

const normalizeShipmentStatus = (value: string): string => String(value || '').toLowerCase().replace(/-/g, '_');

export default function TransportTracking() {
  const [transports, setTransports] = useState<TransportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransport, setSelectedTransport] = useState<string | null>(null);
  const [showHandover, setShowHandover] = useState(false);

  useEffect(() => {
    fetchShipments();
  }, []);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const data = await shipmentsApi.getAll();
      const items = (data as any)?.data ?? (data as any)?.results ?? data ?? [];
      const mapped: TransportItem[] = (Array.isArray(items) ? items : []).map((s: any) => ({
        id: s.shipment_number || s.id,
        apiId: s.id,
        requestId: s.request_id || s.request || '',
        resource: s.resource_name || s.catalog_item_name || 'Resource',
        quantity: s.quantity ? `${s.quantity} units` : '',
        status: s.status || 'pending',
        urgency: s.priority || s.urgency || 'routine',
        pickupHospital: s.origin_hospital_name || s.from_hospital_name || s.offering_hospital_name || '',
        deliveryHospital: s.destination_hospital_name || s.to_hospital_name || s.requesting_hospital_name || '',
        driver: {
          name: s.driver_name || 'Assigned Driver',
          phone: s.driver_phone || '',
          vehicleNumber: s.vehicle_number || s.vehicle_id || '',
        },
        timeline: s.tracking_notes ? [
          { status: 'pickup', time: s.created_at, completed: true },
          { status: 'in-transit', time: s.updated_at || s.created_at, completed: s.status === 'in_transit' || s.status === 'delivered' },
          { status: 'delivered', time: s.delivered_at || '', completed: s.status === 'delivered', estimated: s.status !== 'delivered' },
        ] : [],
        estimatedArrival: s.estimated_delivery || s.updated_at || '',
        progress: s.status === 'delivered' ? 100 : s.status === 'in_transit' ? 65 : s.status === 'pickup_ready' ? 20 : 0,
      }));
      setTransports(mapped);
    } catch (err) {
      console.error('Failed to load shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (normalizeShipmentStatus(status)) {
      case 'pending_dispatch': return 'bg-blue-500';
      case 'dispatched': return 'bg-blue-500';
      case 'in_transit': return 'bg-yellow-500';
      case 'delivered': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return 'bg-red-100 text-red-800 border-red-300';
      case 'urgent': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'routine': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const calculateETA = (estimatedArrival: string) => {
    if (!estimatedArrival) return 'N/A';
    const now = new Date();
    const eta = new Date(estimatedArrival);
    if (Number.isNaN(eta.getTime())) return 'N/A';
    const diffMinutes = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60));
    
    if (diffMinutes < 0) return 'Overdue';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  return (
    <AppLayout title="Active Transports" subtitle="Track resource deliveries and manage handovers">
      <div className="flex-1 space-y-6 p-8 pt-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Truck className="h-12 w-12 mb-4 opacity-50" />
            <p>No active transports</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {transports.map((transport) => (
            <Card key={transport.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    {transport.id}
                  </CardTitle>
                  <Badge className={getUrgencyColor(transport.urgency)}>
                    {transport.urgency.toUpperCase()}
                  </Badge>
                </div>
                <CardDescription className="text-sm">
                  Request: {transport.requestId}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Resource Info */}
                <div className="flex items-center space-x-3">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{transport.resource}</p>
                    <p className="text-sm text-muted-foreground">{transport.quantity}</p>
                  </div>
                </div>

                <Separator />


                <div className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-4 w-4 text-green-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">From:</p>
                      <p className="text-muted-foreground">{transport.pickupHospital}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-4 w-4 text-red-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">To:</p>
                      <p className="text-muted-foreground">{transport.deliveryHospital}</p>
                    </div>
                  </div>
                </div>

                <Separator />


                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Progress</span>
                    <span className="text-muted-foreground">{transport.progress}%</span>
                  </div>
                  <Progress value={transport.progress} className="h-2" />
                </div>

                {/* Status & ETA */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`h-2 w-2 rounded-full ${getStatusColor(transport.status)}`} />
                    <span className="text-sm font-medium capitalize">
                      {normalizeShipmentStatus(transport.status).replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>ETA: {calculateETA(transport.estimatedArrival)}</span>
                  </div>
                </div>

                {/* Driver Info */}
                <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{transport.driver.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{transport.driver.name}</p>
                    <p className="text-xs text-muted-foreground">{transport.driver.vehicleNumber}</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => window.open(`tel:${transport.driver.phone}`)}
                  >
                    <Phone className="h-3 w-3" />
                  </Button>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedTransport(transport.apiId)}
                  >
                    <Truck className="h-3 w-3 mr-1" />
                    Track
                  </Button>
                  {normalizeShipmentStatus(transport.status) === 'in_transit' && (
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={() => {
                        setSelectedTransport(transport.apiId);
                        setShowHandover(true);
                      }}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Handover
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}

      </div>

      {/* Transport Timeline Modal */}
      {selectedTransport && !showHandover && (
        <TransportTimeline
          transportId={selectedTransport}
          onClose={() => setSelectedTransport(null)}
        />
      )}

      {/* Handover Confirmation Modal */}
      {selectedTransport && showHandover && (
        <HandoverConfirmation
          transportId={selectedTransport}
          onClose={() => {
            setSelectedTransport(null);
            setShowHandover(false);
          }}
          onConfirm={() => {
            // Handle handover confirmation
            setSelectedTransport(null);
            setShowHandover(false);
          }}
        />
      )}
    </AppLayout>
  );
}