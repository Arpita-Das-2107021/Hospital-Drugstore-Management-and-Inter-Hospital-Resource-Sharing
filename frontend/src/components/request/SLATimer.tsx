import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SLATimerProps {
  targetTime: string;
  urgency: 'routine' | 'urgent' | 'critical';
  status: string;
}

export const SLATimer = ({ targetTime, urgency, status }: SLATimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isOverdue: boolean;
    percentageRemaining: number;
  } | null>(null);

  useEffect(() => {
    const calculateTime = () => {
      const target = new Date(targetTime).getTime();
      const now = new Date().getTime();
      const diff = target - now;
      
      // Calculate total SLA duration based on urgency
      const slaDurations = {
        critical: 4 * 60 * 60 * 1000, // 4 hours
        urgent: 48 * 60 * 60 * 1000, // 48 hours
        routine: 5 * 24 * 60 * 60 * 1000, // 5 days
      };
      
      const totalDuration = slaDurations[urgency];
      const percentageRemaining = Math.max(0, Math.min(100, (diff / totalDuration) * 100));

      if (diff <= 0) {
        setTimeRemaining({
          hours: 0,
          minutes: 0,
          seconds: 0,
          isOverdue: true,
          percentageRemaining: 0,
        });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({
        hours,
        minutes,
        seconds,
        isOverdue: false,
        percentageRemaining,
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [targetTime, urgency]);

  if (!timeRemaining) return null;

  const isCompleted = status === 'closed' || status === 'received' || status === 'delivered';
  const isCriticallyLow = timeRemaining.percentageRemaining < 25;
  const isWarning = timeRemaining.percentageRemaining < 50;

  if (isCompleted) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 p-3">
        <CheckCircle className="h-5 w-5 text-success" />
        <span className="font-medium text-success">Completed on time</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-lg border p-4 space-y-3",
      timeRemaining.isOverdue && "bg-destructive/10 border-destructive",
      !timeRemaining.isOverdue && isCriticallyLow && "bg-destructive/5 border-destructive/50",
      !timeRemaining.isOverdue && isWarning && !isCriticallyLow && "bg-warning/10 border-warning",
      !timeRemaining.isOverdue && !isWarning && "bg-muted/50 border-border"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {timeRemaining.isOverdue ? (
            <AlertTriangle className="h-5 w-5 text-destructive animate-pulse" />
          ) : (
            <Clock className={cn(
              "h-5 w-5",
              isCriticallyLow ? "text-destructive" : isWarning ? "text-warning" : "text-muted-foreground"
            )} />
          )}
          <span className="text-sm font-medium">SLA Timer</span>
        </div>
        <Badge 
          variant={timeRemaining.isOverdue ? "destructive" : isCriticallyLow ? "destructive" : isWarning ? "default" : "secondary"}
        >
          {urgency.toUpperCase()}
        </Badge>
      </div>

      {timeRemaining.isOverdue ? (
        <div className="text-center py-2">
          <p className="text-2xl font-bold text-destructive">OVERDUE</p>
          <p className="text-sm text-destructive">SLA breach - immediate action required</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 text-center">
            <div className="rounded-lg bg-background p-2 min-w-[60px]">
              <p className={cn(
                "text-2xl font-bold",
                isCriticallyLow ? "text-destructive" : isWarning ? "text-warning" : "text-foreground"
              )}>
                {timeRemaining.hours.toString().padStart(2, '0')}
              </p>
              <p className="text-xs text-muted-foreground">hours</p>
            </div>
            <span className="text-2xl font-bold">:</span>
            <div className="rounded-lg bg-background p-2 min-w-[60px]">
              <p className={cn(
                "text-2xl font-bold",
                isCriticallyLow ? "text-destructive" : isWarning ? "text-warning" : "text-foreground"
              )}>
                {timeRemaining.minutes.toString().padStart(2, '0')}
              </p>
              <p className="text-xs text-muted-foreground">mins</p>
            </div>
            <span className="text-2xl font-bold">:</span>
            <div className="rounded-lg bg-background p-2 min-w-[60px]">
              <p className={cn(
                "text-2xl font-bold",
                isCriticallyLow ? "text-destructive" : isWarning ? "text-warning" : "text-foreground"
              )}>
                {timeRemaining.seconds.toString().padStart(2, '0')}
              </p>
              <p className="text-xs text-muted-foreground">secs</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
            <div 
              className={cn(
                "absolute left-0 top-0 h-full rounded-full transition-all duration-300",
                isCriticallyLow ? "bg-destructive" : isWarning ? "bg-warning" : "bg-success"
              )}
              style={{ width: `${timeRemaining.percentageRemaining}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default SLATimer;
