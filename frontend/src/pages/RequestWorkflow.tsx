import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mockRequests } from '@/data';
import { RequestStatusStepper } from '@/components/request/RequestStatusStepper';
import { SLATimer } from '@/components/request/SLATimer';
import { ClinicalMetadataBadges } from '@/components/resource/ClinicalMetadataBadges';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const RequestWorkflow = () => {
  const [expandedId, setExpandedId] = useState<string | null>(mockRequests[0]?.id || null);

  // Map old status to new lifecycle
  const mapStatus = (status: string): 'requested' | 'reserved' | 'in_transit' | 'received' | 'closed' | 'rejected' => {
    switch (status) {
      case 'pending': return 'requested';
      case 'approved': return 'reserved';
      case 'in_transit': return 'in_transit';
      case 'delivered': return 'received';
      case 'rejected': return 'rejected';
      default: return 'requested';
    }
  };

  // Calculate SLA target based on urgency
  const getSLATarget = (requestedAt: string, urgency: string) => {
    const date = new Date(requestedAt);
    switch (urgency) {
      case 'critical': date.setHours(date.getHours() + 4); break;
      case 'urgent': date.setHours(date.getHours() + 48); break;
      default: date.setDate(date.getDate() + 5);
    }
    return date.toISOString();
  };

  return (
    <AppLayout title="Request Workflow" subtitle="Track and manage resource requests with SLA monitoring">
      <div className="space-y-4">
        {mockRequests.map(request => {
          const isExpanded = expandedId === request.id;
          const mappedStatus = mapStatus(request.status);
          
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
                          <p className="text-sm text-muted-foreground">{request.requestingHospital} → {request.providingHospital}</p>
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
                      reservationExpiry={mappedStatus === 'reserved' ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined}
                      estimatedDelivery={new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()}
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
                            bloodType: request.resourceType === 'blood' ? 'O-' : undefined,
                            coldChainRequired: request.resourceType === 'blood' || request.resourceType === 'organs',
                            coldChainTemp: '2-8°C',
                            lotNumber: 'LOT-2024-' + request.id.padStart(4, '0'),
                            expiryDate: '2025-01-15',
                          }}
                          compact
                        />
                        {request.justification && (
                          <p className="text-sm italic text-muted-foreground">"{request.justification}"</p>
                        )}
                      </div>
                    </div>
                    {mappedStatus === 'requested' && (
                      <div className="flex gap-2 pt-2">
                        <Button>Approve & Reserve</Button>
                        <Button variant="outline">Reject</Button>
                      </div>
                    )}
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