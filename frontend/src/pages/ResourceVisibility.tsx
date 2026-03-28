import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockSharedResources, type ResourceWithVisibility } from '@/data';
import { useState } from 'react';
import { Search, Eye, EyeOff, Filter, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import ResourceCard from '@/components/ResourceCard';

const ResourceVisibility = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resources, setResources] = useState<ResourceWithVisibility[]>(mockSharedResources);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');

  // Only pharmacists and admins can access this page
  if (user?.role !== 'pharmacist' && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const userResources = resources.filter(r => r.hospital === user?.hospital);

  const filtered = userResources.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = type === 'all' || r.type === type;
    return matchesSearch && matchesType;
  });

  const visibleCount = userResources.filter(r => r.isVisibleToOthers).length;
  const hiddenCount = userResources.filter(r => !r.isVisibleToOthers).length;

  const handleToggleVisibility = (resourceId: string, visible: boolean) => {
    setResources(prev => 
      prev.map(r => 
        r.id === resourceId ? { ...r, isVisibleToOthers: visible } : r
      )
    );
    
    const resource = resources.find(r => r.id === resourceId);
    toast({
      title: visible ? "Resource Now Visible" : "Resource Hidden",
      description: `${resource?.name} is now ${visible ? 'visible to' : 'hidden from'} other hospitals.`,
    });
  };

  const handleBulkToggle = (visible: boolean) => {
    const idsToUpdate = filtered.map(r => r.id);
    setResources(prev => 
      prev.map(r => 
        idsToUpdate.includes(r.id) ? { ...r, isVisibleToOthers: visible } : r
      )
    );
    
    toast({
      title: visible ? "All Resources Visible" : "All Resources Hidden",
      description: `${filtered.length} resources have been ${visible ? 'made visible' : 'hidden'}.`,
    });
  };

  return (
    <AppLayout title="Resource Visibility" subtitle="Control which resources are shared with other hospitals">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{visibleCount}</p>
                  <p className="text-sm text-muted-foreground">Visible Resources</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hiddenCount}</p>
                  <p className="text-sm text-muted-foreground">Hidden Resources</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{userResources.length}</p>
                  <p className="text-sm text-muted-foreground">Total Resources</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="border-info/20 bg-info/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-info mt-0.5" />
              <div>
                <h4 className="font-medium">Visibility Control</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Resources marked as <strong>visible</strong> can be requested by other hospitals. 
                  Hidden resources are only available for internal use at your hospital.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search resources..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="pl-9" 
              />
            </div>
            <Tabs value={type} onValueChange={setType}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="drugs">Drugs</TabsTrigger>
                <TabsTrigger value="blood">Blood</TabsTrigger>
                <TabsTrigger value="organs">Organs</TabsTrigger>
                <TabsTrigger value="equipment">Equipment</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkToggle(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Show All
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkToggle(false)}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide All
            </Button>
          </div>
        </div>

        {/* Resource Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(resource => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              showVisibilityToggle={true}
              onToggleVisibility={handleToggleVisibility}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <EyeOff className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No resources found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ResourceVisibility;