import { cn } from '@/lib/utils';
import { Check, Clock, Truck, Package, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RequestStatusStepperProps {
  status: 'requested' | 'reserved' | 'in_transit' | 'received' | 'closed' | 'rejected';
  urgency: 'routine' | 'urgent' | 'critical';
  requestedAt: string;
  reservationExpiry?: string;
  estimatedDelivery?: string;
}

const steps = [
  { id: 'requested', label: 'Requested', labelBn: 'অনুরোধ করা হয়েছে', icon: Clock },
  { id: 'reserved', label: 'Reserved', labelBn: 'সংরক্ষিত', icon: Package },
  { id: 'in_transit', label: 'In Transit', labelBn: 'পরিবহনে', icon: Truck },
  { id: 'received', label: 'Received', labelBn: 'গ্রহণ করা হয়েছে', icon: Package },
  { id: 'closed', label: 'Closed', labelBn: 'বন্ধ', icon: Check },
];

export const RequestStatusStepper = ({
  status,
  urgency,
  requestedAt,
  reservationExpiry,
  estimatedDelivery,
}: RequestStatusStepperProps) => {
  const isRejected = status === 'rejected';
  const currentStepIndex = steps.findIndex(s => s.id === status);

  const getStepStatus = (stepIndex: number) => {
    if (isRejected) return 'rejected';
    if (stepIndex < currentStepIndex) return 'completed';
    if (stepIndex === currentStepIndex) return 'current';
    return 'upcoming';
  };

  const getUrgencyStyles = () => {
    switch (urgency) {
      case 'critical':
        return 'bg-destructive/10 border-destructive text-destructive';
      case 'urgent':
        return 'bg-warning/10 border-warning text-warning';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Urgency Banner */}
      <div className={cn(
        "flex items-center justify-between rounded-lg border-2 p-3",
        getUrgencyStyles()
      )}>
        <div className="flex items-center gap-2">
          {urgency === 'critical' && <AlertTriangle className="h-4 w-4 animate-pulse" />}
          <span className="font-medium capitalize">{urgency} Priority</span>
        </div>
        <Badge variant={urgency === 'critical' ? 'destructive' : urgency === 'urgent' ? 'default' : 'secondary'}>
          SLA: {urgency === 'critical' ? '< 4 hours' : urgency === 'urgent' ? '24-48 hours' : '3-5 days'}
        </Badge>
      </div>

      {/* Status Stepper */}
      <div className="relative">
        {isRejected ? (
          <div className="flex items-center justify-center rounded-lg bg-destructive/10 p-6">
            <XCircle className="h-8 w-8 text-destructive mr-3" />
            <div>
              <p className="font-semibold text-destructive">Request Rejected</p>
              <p className="text-sm text-muted-foreground">This request has been declined</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const stepStatus = getStepStatus(index);
              const StepIcon = step.icon;
              
              return (
                <div key={step.id} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                      stepStatus === 'completed' && "bg-success border-success text-success-foreground",
                      stepStatus === 'current' && "bg-primary border-primary text-primary-foreground animate-pulse",
                      stepStatus === 'upcoming' && "bg-muted border-border text-muted-foreground",
                      stepStatus === 'rejected' && "bg-destructive border-destructive text-destructive-foreground"
                    )}>
                      {stepStatus === 'completed' ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <StepIcon className="h-5 w-5" />
                      )}
                    </div>
                    <span className={cn(
                      "mt-2 text-xs font-medium text-center",
                      stepStatus === 'current' ? "text-primary" : "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </div>
                  
                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-2",
                      index < currentStepIndex ? "bg-success" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeline Info */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-muted-foreground">Requested</p>
          <p className="font-medium">{new Date(requestedAt).toLocaleString()}</p>
        </div>
        {reservationExpiry && status === 'reserved' && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
            <p className="text-warning">Reservation Expires</p>
            <p className="font-medium">{new Date(reservationExpiry).toLocaleString()}</p>
          </div>
        )}
        {estimatedDelivery && (
          <div className="rounded-lg bg-info/10 border border-info/20 p-3">
            <p className="text-info">Est. Delivery</p>
            <p className="font-medium">{new Date(estimatedDelivery).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RequestStatusStepper;
