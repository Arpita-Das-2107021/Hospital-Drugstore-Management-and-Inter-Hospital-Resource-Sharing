import { cn } from '@/lib/utils';
import { 
  Thermometer, 
  Droplet, 
  AlertTriangle, 
  Info, 
  Package,
  FileText,
  Activity
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ClinicalMetadata {
  lotNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
  coldChainRequired?: boolean;
  coldChainTemp?: string;
  bloodType?: string;
  deviceModel?: string;
  flowRate?: string;
  dosage?: string;
  compatibilityNotes?: string;
  storageConditions?: string;
}

interface ClinicalMetadataBadgesProps {
  metadata: ClinicalMetadata;
  compact?: boolean;
}

export const ClinicalMetadataBadges = ({ metadata, compact = false }: ClinicalMetadataBadgesProps) => {
  const getExpiryRisk = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return { level: 'expired', color: 'bg-destructive text-destructive-foreground', text: 'Expired' };
    if (daysUntilExpiry <= 7) return { level: 'critical', color: 'bg-destructive text-destructive-foreground', text: `${daysUntilExpiry}d left` };
    if (daysUntilExpiry <= 30) return { level: 'warning', color: 'bg-warning text-warning-foreground', text: `${daysUntilExpiry}d left` };
    if (daysUntilExpiry <= 90) return { level: 'caution', color: 'bg-warning/70 text-warning-foreground', text: `${daysUntilExpiry}d left` };
    return { level: 'ok', color: 'bg-success/20 text-success-foreground', text: `${daysUntilExpiry}d` };
  };

  const expiryRisk = metadata.expiryDate ? getExpiryRisk(metadata.expiryDate) : null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {/* Blood Type */}
        {metadata.bloodType && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                <Droplet className="h-3 w-3 mr-1" />
                {metadata.bloodType}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Blood Type: {metadata.bloodType}</TooltipContent>
          </Tooltip>
        )}

        {/* Cold Chain */}
        {metadata.coldChainRequired && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-info/10 text-info border-info/30">
                <Thermometer className="h-3 w-3 mr-1" />
                {metadata.coldChainTemp || '2-8°C'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Cold chain required: {metadata.coldChainTemp || '2-8°C'}</TooltipContent>
          </Tooltip>
        )}

        {/* Expiry Risk */}
        {expiryRisk && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={cn(expiryRisk.color)}>
                {expiryRisk.level === 'critical' || expiryRisk.level === 'expired' ? (
                  <AlertTriangle className="h-3 w-3 mr-1" />
                ) : null}
                {expiryRisk.text}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Expiry: {new Date(metadata.expiryDate!).toLocaleDateString()}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Lot/Batch */}
        {(metadata.lotNumber || metadata.batchNumber) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-xs">
                <Package className="h-3 w-3 mr-1" />
                {metadata.lotNumber || metadata.batchNumber}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {metadata.lotNumber && `Lot: ${metadata.lotNumber}`}
              {metadata.lotNumber && metadata.batchNumber && ' | '}
              {metadata.batchNumber && `Batch: ${metadata.batchNumber}`}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Primary Clinical Info */}
      <div className="flex flex-wrap gap-2">
        {metadata.bloodType && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-sm py-1 px-3">
            <Droplet className="h-4 w-4 mr-1.5" />
            {metadata.bloodType}
          </Badge>
        )}

        {metadata.coldChainRequired && (
          <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-sm py-1 px-3">
            <Thermometer className="h-4 w-4 mr-1.5" />
            Cold Chain: {metadata.coldChainTemp || '2-8°C'}
          </Badge>
        )}

        {metadata.deviceModel && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <Activity className="h-4 w-4 mr-1.5" />
            {metadata.deviceModel}
          </Badge>
        )}

        {metadata.flowRate && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <Activity className="h-4 w-4 mr-1.5" />
            Flow: {metadata.flowRate}
          </Badge>
        )}

        {metadata.dosage && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <FileText className="h-4 w-4 mr-1.5" />
            {metadata.dosage}
          </Badge>
        )}
      </div>

      {/* Lot/Batch & Expiry Row */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {(metadata.lotNumber || metadata.batchNumber) && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>
              {metadata.lotNumber && `Lot: ${metadata.lotNumber}`}
              {metadata.lotNumber && metadata.batchNumber && ' • '}
              {metadata.batchNumber && `Batch: ${metadata.batchNumber}`}
            </span>
          </div>
        )}

        {expiryRisk && (
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-md",
            expiryRisk.level === 'expired' && "bg-destructive/20 text-destructive",
            expiryRisk.level === 'critical' && "bg-destructive/15 text-destructive",
            expiryRisk.level === 'warning' && "bg-warning/15 text-warning",
            expiryRisk.level === 'caution' && "bg-warning/10 text-warning",
            expiryRisk.level === 'ok' && "bg-success/10 text-success"
          )}>
            {(expiryRisk.level === 'critical' || expiryRisk.level === 'expired') && (
              <AlertTriangle className="h-4 w-4 animate-pulse" />
            )}
            <span className="font-medium">
              {expiryRisk.level === 'expired' ? 'EXPIRED' : `Expires: ${new Date(metadata.expiryDate!).toLocaleDateString()}`}
            </span>
          </div>
        )}
      </div>

      {/* Compatibility Notes */}
      {metadata.compatibilityNotes && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
          <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-warning">{metadata.compatibilityNotes}</p>
        </div>
      )}

      {/* Storage Conditions */}
      {metadata.storageConditions && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Thermometer className="h-4 w-4" />
          <span>Storage: {metadata.storageConditions}</span>
        </div>
      )}
    </div>
  );
};

export default ClinicalMetadataBadges;
