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
  Camera, 
  QrCode, 
  CheckCircle,
  Truck,
  AlertTriangle,
  Navigation,
  Timer,
  Route,
} from 'lucide-react';
import TransportTimeline from '@/components/TransportTimeline';
import HandoverConfirmation from '@/components/HandoverConfirmation';

const activeTransports = [
  {
    id: 'TRN-2024-0001',
    requestId: 'REQ-2024-0456',
    resource: 'Amoxicillin 500mg',
    quantity: '50 units',
    status: 'in-transit',
    urgency: 'urgent',
    pickupHospital: 'Dhaka Medical College Hospital',
    deliveryHospital: 'Square Hospital',
    driver: {
      name: 'Rahman Ahmed',
      phone: '+88017-1234-5678',
      vehicleNumber: 'DHK-GA-12-3456'
    },
    timeline: [
      { status: 'pickup', time: '2024-12-31T14:30:00', completed: true },
      { status: 'in-transit', time: '2024-12-31T15:00:00', completed: true },
      { status: 'delivered', time: '2024-12-31T16:00:00', completed: false, estimated: true }
    ],
    estimatedArrival: '2024-12-31T16:00:00',
    progress: 65
  },
  {
    id: 'TRN-2024-0002',
    requestId: 'REQ-2024-0457',
    resource: 'O-Negative Blood',
    quantity: '2 units',
    status: 'pickup-ready',
    urgency: 'emergency',
    pickupHospital: 'National Institute of Cardiovascular Diseases',
    deliveryHospital: 'United Hospital',
    driver: {
      name: 'Karim Hassan',
      phone: '+88018-9876-5432',
      vehicleNumber: 'DHK-KA-98-7654'
    },
    timeline: [
      { status: 'pickup', time: '2024-12-31T15:30:00', completed: false },
      { status: 'in-transit', time: '2024-12-31T16:00:00', completed: false },
      { status: 'delivered', time: '2024-12-31T16:30:00', completed: false, estimated: true }
    ],
    estimatedArrival: '2024-12-31T16:30:00',
    progress: 0
  }
];

export default function TransportTracking() {
  const [selectedTransport, setSelectedTransport] = useState<string | null>(null);
  const [showHandover, setShowHandover] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pickup-ready': return 'bg-blue-500';
      case 'in-transit': return 'bg-yellow-500';
      case 'delivered': return 'bg-green-500';
      case 'delayed': return 'bg-red-500';
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
    const now = new Date();
    const eta = new Date(estimatedArrival);
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

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {activeTransports.map((transport) => (
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
                      {transport.status.replace('-', ' ')}
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
                    onClick={() => setSelectedTransport(transport.id)}
                  >
                    <Truck className="h-3 w-3 mr-1" />
                    Track
                  </Button>
                  {transport.status === 'in-transit' && (
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={() => {
                        setSelectedTransport(transport.id);
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

        {/* Emergency Alert Banner */}
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center space-x-3 p-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-medium text-red-900">1 transport is running behind schedule</p>
              <p className="text-sm text-red-700">TRN-2024-0003 is 15 minutes overdue. Contact driver immediately.</p>
            </div>
            <Button variant="outline" size="sm" className="border-red-300 text-red-700">
              View Details
            </Button>
          </CardContent>
        </Card>
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