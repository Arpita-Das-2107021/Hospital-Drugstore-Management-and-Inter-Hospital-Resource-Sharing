import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ReservationWindowProps {
  resourceName: string;
  quantity: number;
  reservedAt: string;
  expiresAt: string;
  isCommitted: boolean;
  onExtend?: () => void;
  onRelease?: () => void;
  onCommit?: () => void;
}

export const ReservationWindow = ({
  resourceName,
  quantity,
  reservedAt,
  expiresAt,
  isCommitted,
  onExtend,
  onRelease,
  onCommit,
}: ReservationWindowProps) => {
  const [timeRemaining, setTimeRemaining] = useState<{
    minutes: number;
    seconds: number;
    percentageRemaining: number;
    isExpired: boolean;
  } | null>(null);

  useEffect(() => {
    const calculateTime = () => {
      const start = new Date(reservedAt).getTime();
      const end = new Date(expiresAt).getTime();
      const now = new Date().getTime();
      
      const totalDuration = end - start;
      const remaining = end - now;
      const percentageRemaining = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));

      if (remaining <= 0) {
        setTimeRemaining({
          minutes: 0,
          seconds: 0,
          percentageRemaining: 0,
          isExpired: true,
        });
        return;
      }

      const minutes = Math.floor(remaining / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setTimeRemaining({
        minutes,
        seconds,
        percentageRemaining,
        isExpired: false,
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [reservedAt, expiresAt]);

  if (!timeRemaining) return null;

  const isLow = timeRemaining.percentageRemaining < 25;
  const isWarning = timeRemaining.percentageRemaining < 50;

  return (
    <div className={cn(
      "rounded-lg border-2 p-4 space-y-4",
      isCommitted && "border-success bg-success/5",
      !isCommitted && timeRemaining.isExpired && "border-destructive bg-destructive/5",
      !isCommitted && !timeRemaining.isExpired && isLow && "border-destructive/50 bg-destructive/5",
      !isCommitted && !timeRemaining.isExpired && isWarning && !isLow && "border-warning bg-warning/5",
      !isCommitted && !timeRemaining.isExpired && !isWarning && "border-primary bg-primary/5"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isCommitted ? (
            <Lock className="h-5 w-5 text-success" />
          ) : (
            <Unlock className={cn(
              "h-5 w-5",
              timeRemaining.isExpired ? "text-destructive" : isLow ? "text-destructive" : "text-primary"
            )} />
          )}
          <div>
            <p className="font-medium">Reservation Hold</p>
            <p className="text-xs text-muted-foreground">{resourceName} × {quantity}</p>
          </div>
        </div>
        <Badge variant={isCommitted ? "default" : "secondary"} className={isCommitted ? "bg-success" : ""}>
          {isCommitted ? "Committed" : "Pending Commitment"}
        </Badge>
      </div>

      {/* Timer */}
      {!isCommitted && !timeRemaining.isExpired && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reservation expires in:</span>
            <span className={cn(
              "font-mono font-bold",
              isLow ? "text-destructive" : isWarning ? "text-warning" : "text-foreground"
            )}>
              {timeRemaining.minutes.toString().padStart(2, '0')}:{timeRemaining.seconds.toString().padStart(2, '0')}
            </span>
          </div>
          <Progress 
            value={timeRemaining.percentageRemaining} 
            className={cn(
              "h-2",
              isLow && "[&>div]:bg-destructive",
              isWarning && !isLow && "[&>div]:bg-warning",
              !isWarning && "[&>div]:bg-primary"
            )}
          />
        </div>
      )}

      {/* Expired State */}
      {!isCommitted && timeRemaining.isExpired && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Reservation Expired</p>
            <p className="text-xs text-muted-foreground">Resource is no longer held for this request</p>
          </div>
        </div>
      )}

      {/* Committed State */}
      {isCommitted && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10">
          <Lock className="h-5 w-5 text-success" />
          <div>
            <p className="font-medium text-success">Resource Committed</p>
            <p className="text-xs text-muted-foreground">Locked and ready for transport</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isCommitted && !timeRemaining.isExpired && (
        <div className="flex gap-2">
          <Button size="sm" onClick={onCommit} className="flex-1">
            <Lock className="h-4 w-4 mr-1" />
            Commit
          </Button>
          <Button size="sm" variant="outline" onClick={onExtend}>
            <Clock className="h-4 w-4 mr-1" />
            Extend
          </Button>
          <Button size="sm" variant="ghost" onClick={onRelease} className="text-destructive hover:text-destructive">
            Release
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReservationWindow;
