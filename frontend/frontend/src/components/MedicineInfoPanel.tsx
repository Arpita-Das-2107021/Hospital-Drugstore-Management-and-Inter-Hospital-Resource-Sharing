import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type MedicineInfoPanelProps = {
  className?: string;
  medicineName: string;
  genericName: string;
  medicineSource: string;
  medicineFound: boolean;
  manualSummary: string;
  useCases: string[];
  indications: string[];
  dosageGuidance: string[];
  ageGuidance: string[];
  warnings: string[];
  storageGuidanceItems: string[];
  stale: boolean;
  isRefreshing: boolean;
  showInitialLoading: boolean;
  warningMessage: string | null;
  errorMessage: string | null;
  canRefresh: boolean;
  onRefresh: () => void;
};

const GuidanceSection = ({
  title,
  items,
  empty,
  warning,
}: {
  title: string;
  items: string[];
  empty: string;
  warning?: boolean;
}) => (
  <div className={cn('rounded-md border p-3', warning && 'border-destructive/40 bg-destructive/5')}>
    <p className={cn('text-xs uppercase tracking-wide text-muted-foreground', warning && 'text-destructive')}>
      {title}
    </p>
    {items.length === 0 ? (
      <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    )}
  </div>
);

const MedicineInfoPanel = ({
  className,
  medicineName,
  genericName,
  medicineSource,
  medicineFound,
  manualSummary,
  useCases,
  indications,
  dosageGuidance,
  ageGuidance,
  warnings,
  storageGuidanceItems,
  stale,
  isRefreshing,
  showInitialLoading,
  warningMessage,
  errorMessage,
  canRefresh,
  onRefresh,
}: MedicineInfoPanelProps) => {
  if (errorMessage) {
    return (
      <Card className={cn('border-destructive/40 bg-destructive/5', className)}>
        <CardContent className="p-4 text-sm">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="space-y-2">
              <p className="font-medium">Unable to load medicine information</p>
              <p>{errorMessage}</p>
              {canRefresh ? (
                <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Refresh
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <Card className="border">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Medicine Details
              </p>
              <h2 className="text-2xl font-semibold leading-tight">{medicineName}</h2>
              <p className="text-sm text-muted-foreground">Generic name: {genericName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Manual Source: {medicineSource}</Badge>
              <Badge variant={medicineFound ? 'outline' : 'secondary'}>
                {medicineFound ? 'Medicine info found' : 'Medicine info not found'}
              </Badge>
              {stale ? (
                <Badge className="border-warning/50 bg-warning/15 text-warning-foreground">
                  Showing cached information
                </Badge>
              ) : null}
            </div>
          </div>

          {showInitialLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading medicine information...
            </div>
          ) : null}

          {isRefreshing ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing in background...
            </div>
          ) : null}

          {stale ? (
            <p className="text-xs text-warning-foreground">Live source temporarily unavailable.</p>
          ) : null}

          {warningMessage ? (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning-foreground">
              {warningMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={!canRefresh || isRefreshing}
            >
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{manualSummary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medicine Manual Guidance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <GuidanceSection
            title="Primary Use Cases"
            items={useCases}
            empty="No primary use-case guidance is available."
          />
          <GuidanceSection
            title="Indications"
            items={indications}
            empty="No indication guidance is available."
          />
          <GuidanceSection
            title="Dosage Guidance"
            items={dosageGuidance}
            empty="No dosage guidance is available."
          />
          <GuidanceSection
            title="Age Guidance"
            items={ageGuidance}
            empty="No age-specific guidance is available."
          />
          <GuidanceSection
            title="Warnings"
            items={warnings}
            empty="No warning information is available."
            warning
          />
          <GuidanceSection
            title="Storage Guidance"
            items={storageGuidanceItems}
            empty="No storage guidance is available."
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default MedicineInfoPanel;
