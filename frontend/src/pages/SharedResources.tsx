import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { mockSharedResources, type ResourceWithVisibility } from '@/data';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HospitalSelector } from '@/components/HospitalSelector';
import { ResourceCard } from '@/components/ResourceCard';
import { ResourceRequestForm } from '@/components/ResourceRequestForm';
import EmergencyBroadcast from '@/components/EmergencyBroadcast';
import GuidedRequestTemplate from '@/components/GuidedRequestTemplate';
import { Package, Siren, Plus } from 'lucide-react';

const SharedResources = () => {
  const [hospital, setHospital] = useState('all');
  const [type, setType] = useState('all');
  const [selectedResource, setSelectedResource] = useState<ResourceWithVisibility | null>(null);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [showEmergencyBroadcast, setShowEmergencyBroadcast] = useState(false);
  const [showGuidedRequest, setShowGuidedRequest] = useState(false);
  const navigate = useNavigate();

  const filtered = mockSharedResources.filter(r => {
    const matchesHospital = hospital === 'all' || r.hospital === hospital;
    const matchesType = type === 'all' || r.type === type;
    const isVisible = r.isVisibleToOthers;
    return matchesHospital && matchesType && isVisible;
  });

  const handleResourceClick = (resource: ResourceWithVisibility) => {
    navigate(`/resource/${resource.id}`);
  };

  const handleRequest = (resource: ResourceWithVisibility) => {
    setSelectedResource(resource);
    setIsRequestOpen(true);
  };

  return (
    <AppLayout title="Shared Resources" subtitle="Multi-hospital resource visibility">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <HospitalSelector value={hospital} onValueChange={setHospital} />
          <div className="flex items-center space-x-2">
            <Tabs value={type} onValueChange={setType}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="drugs">Drugs</TabsTrigger>
                <TabsTrigger value="blood">Blood</TabsTrigger>
                <TabsTrigger value="organs">Organs</TabsTrigger>
                <TabsTrigger value="equipment">Equipment</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              variant="outline"
              onClick={() => setShowGuidedRequest(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
            <Button 
              variant="destructive"
              onClick={() => setShowEmergencyBroadcast(true)}
            >
              <Siren className="h-4 w-4 mr-2" />
              Emergency
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} available resources
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(resource => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              onRequest={handleRequest}
              onClick={handleResourceClick}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No resources found</h3>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </div>
        )}

        <ResourceRequestForm
          resource={selectedResource}
          isOpen={isRequestOpen}
          onClose={() => setIsRequestOpen(false)}
        />

        <EmergencyBroadcast
          isOpen={showEmergencyBroadcast}
          onClose={() => setShowEmergencyBroadcast(false)}
          onBroadcast={(data) => {
            console.log('Emergency broadcast:', data);
          }}
        />

        <GuidedRequestTemplate
          isOpen={showGuidedRequest}
          onClose={() => setShowGuidedRequest(false)}
          onSubmit={(data) => {
            console.log('Guided request:', data);
          }}
        />
      </div>
    </AppLayout>
  );
};

export default SharedResources;