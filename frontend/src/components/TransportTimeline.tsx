import { useState } from 'react';
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
  AlertCircle
} from 'lucide-react';

interface TimelineStep {
  status: string;
  time: string;
  completed: boolean;
  estimated?: boolean;
  note?: string;
}

interface TransportTimelineProps {
  transportId: string;
  onClose: () => void;
}

// Mock data - in real app this would be fetched based on transportId
const mockTransportDetails = {
  id: 'TRN-2024-0001',
  requestId: 'REQ-2024-0456',
  resource: 'Amoxicillin 500mg',
  quantity: '50 units',
  pickupHospital: 'Dhaka Medical College Hospital',
  deliveryHospital: 'Square Hospital',
  driver: {
    name: 'Rahman Ahmed',
    phone: '+88017-1234-5678',
    vehicleNumber: 'DHK-GA-12-3456'
  },
  timeline: [
    {
      status: 'confirmed',
      label: 'Pickup Confirmed',
      time: '2024-12-31T14:00:00',
      completed: true,
      note: 'Ready for collection'
    },
    {
      status: 'pickup',
      label: 'Picked Up',
      time: '2024-12-31T14:30:00',
      completed: true,
      note: 'Collected by Rahman Ahmed'
    },
    {
      status: 'in-transit',
      label: 'In Transit',
      time: '2024-12-31T15:00:00',
      completed: true,
      note: 'En route to destination'
    },
    {
      status: 'arrived',
      label: 'Arrived',
      time: '2024-12-31T15:45:00',
      completed: false,
      estimated: true,
      note: 'Expected arrival'
    },
    {
      status: 'delivered',
      label: 'Delivered',
      time: '2024-12-31T16:00:00',
      completed: false,
      estimated: true,
      note: 'Awaiting confirmation'
    }
  ],
  progress: 65,
  estimatedArrival: '2024-12-31T15:45:00'
};

export default function TransportTimeline({ transportId, onClose }: TransportTimelineProps) {
  const [details] = useState(mockTransportDetails);

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusIcon = (status: string, completed: boolean) => {
    if (completed) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    switch (status) {
      case 'confirmed':
        return <Package className="h-5 w-5 text-blue-600" />;
      case 'pickup':
        return <Package className="h-5 w-5 text-orange-600" />;
      case 'in-transit':
        return <Truck className="h-5 w-5 text-yellow-600" />;
      case 'arrived':
        return <MapPin className="h-5 w-5 text-purple-600" />;
      case 'delivered':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const calculateETA = () => {
    const now = new Date();
    const eta = new Date(details.estimatedArrival);
    const diffMinutes = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60));
    
    if (diffMinutes < 0) return 'Overdue';
    if (diffMinutes < 60) return `${diffMinutes} minutes`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
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
            Track the real-time status of transport {details.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Transport Summary */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{details.resource}</h3>
              <Badge variant="outline">{details.quantity}</Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">From:</p>
                <p>{details.pickupHospital}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">To:</p>
                <p>{details.deliveryHospital}</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Driver: {details.driver.name}</p>
                <p className="text-sm text-muted-foreground">{details.driver.vehicleNumber}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open(`tel:${details.driver.phone}`)}>
                Call Driver
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{details.progress}% complete</span>
            </div>
            <Progress value={details.progress} className="h-3" />
            <div className="flex items-center space-x-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>ETA: {calculateETA()}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-4">
            <h4 className="font-semibold">Timeline</h4>
            
            <div className="space-y-4">
              {details.timeline.map((step, index) => (
                <div key={step.status} className="flex items-start space-x-4">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    {getStatusIcon(step.status, step.completed)}
                    {index < details.timeline.length - 1 && (
                      <div className={`w-0.5 h-8 mt-2 ${
                        step.completed ? 'bg-green-200' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                  
                  {/* Timeline content */}
                  <div className="flex-1 space-y-1 pb-4">
                    <div className="flex items-center justify-between">
                      <p className={`font-medium ${
                        step.completed ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {step.label}
                      </p>
                      <div className="flex items-center space-x-2">
                        {step.estimated && !step.completed && (
                          <Badge variant="outline" className="text-xs">
                            Estimated
                          </Badge>
                        )}
                        <span className={`text-sm ${
                          step.completed ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {formatTime(step.time)}
                        </span>
                      </div>
                    </div>
                    
                    {step.note && (
                      <p className="text-sm text-muted-foreground">
                        {step.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alert if delayed */}
          {details.progress < 50 && (
            <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">Transport may be delayed</p>
                <p className="text-yellow-700">Consider contacting the driver for updates.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button>
            View on Map
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}