import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, Zap } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface UrgencySelectorProps {
  value: 'routine' | 'urgent' | 'critical';
  onChange: (value: 'routine' | 'urgent' | 'critical') => void;
  disabled?: boolean;
}

const urgencyOptions = [
  {
    value: 'routine' as const,
    label: 'Routine',
    labelBn: 'নিয়মিত',
    description: 'Standard processing (3-5 days)',
    descriptionBn: 'স্ট্যান্ডার্ড প্রক্রিয়াকরণ (৩-৫ দিন)',
    icon: Clock,
    bgColor: 'bg-muted',
    borderColor: 'border-border',
    selectedBg: 'bg-muted',
    selectedBorder: 'border-muted-foreground',
    iconColor: 'text-muted-foreground',
  },
  {
    value: 'urgent' as const,
    label: 'Urgent',
    labelBn: 'জরুরি',
    description: 'Priority handling (24-48 hours)',
    descriptionBn: 'অগ্রাধিকার হ্যান্ডলিং (২৪-৪৮ ঘণ্টা)',
    icon: Zap,
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    selectedBg: 'bg-warning/20',
    selectedBorder: 'border-warning',
    iconColor: 'text-warning',
  },
  {
    value: 'critical' as const,
    label: 'Critical',
    labelBn: 'সংকটজনক',
    description: 'Immediate action required (<4 hours)',
    descriptionBn: 'তাৎক্ষণিক পদক্ষেপ প্রয়োজন (<৪ ঘণ্টা)',
    icon: AlertTriangle,
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    selectedBg: 'bg-destructive/20',
    selectedBorder: 'border-destructive',
    iconColor: 'text-destructive',
  },
];

export const UrgencySelector = ({ value, onChange, disabled }: UrgencySelectorProps) => {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as 'routine' | 'urgent' | 'critical')}
      className="grid gap-3 sm:grid-cols-3"
      disabled={disabled}
    >
      {urgencyOptions.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;
        
        return (
          <Label
            key={option.value}
            htmlFor={`urgency-${option.value}`}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all",
              "hover:shadow-md",
              isSelected ? [option.selectedBg, option.selectedBorder] : [option.bgColor, option.borderColor],
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <RadioGroupItem
              value={option.value}
              id={`urgency-${option.value}`}
              className="sr-only"
            />
            
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full",
              isSelected ? option.selectedBg : option.bgColor
            )}>
              <Icon className={cn(
                "h-6 w-6",
                option.iconColor,
                option.value === 'critical' && isSelected && "animate-pulse"
              )} />
            </div>
            
            <div className="text-center">
              <span className={cn(
                "font-semibold",
                isSelected && option.value === 'critical' && "text-destructive",
                isSelected && option.value === 'urgent' && "text-warning",
              )}>
                {option.label}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {option.description}
              </p>
            </div>

            {/* Selection indicator */}
            {isSelected && (
              <div className={cn(
                "absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center",
                option.value === 'critical' && "bg-destructive",
                option.value === 'urgent' && "bg-warning",
                option.value === 'routine' && "bg-primary"
              )}>
                <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </Label>
        );
      })}
    </RadioGroup>
  );
};

export default UrgencySelector;
