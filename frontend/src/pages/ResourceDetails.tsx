import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { mockSharedResources, mockHospitals } from '@/data/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResourceRequestForm } from '@/components/ResourceRequestForm';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  ShoppingCart, 
  Building2,
  Calendar,
  Package
} from 'lucide-react';
import { useState } from 'react';
import { ResourceWithVisibility } from '@/data/mockData';
import { cn } from '@/lib/utils';

const ResourceDetails = () => {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();
  const [selectedResource, setSelectedResource] = useState<ResourceWithVisibility | null>(null);
  const [isRequestOpen, setIsRequestOpen] = useState(false);

  const resource = mockSharedResources.find(r => r.id === resourceId);
  const hospital = resource ? mockHospitals.find(h => h.name === resource.hospital) : null;
  
  if (!resource) {
    return (
      <AppLayout title="Resource Not Found">
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">Resource not found</h3>
          <p className="text-muted-foreground">The resource you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/sharing')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Shared Resources
          </Button>
        </div>
      </AppLayout>
    );
  }

  const getAvailabilityStyles = (availability: string) => {
    switch (availability) {
      case 'available': 
        return { 
          badge: 'bg-success text-success-foreground', 
          ring: 'ring-success/20',
          text: 'Available'
        };
      case 'limited': 
        return { 
          badge: 'bg-warning text-warning-foreground', 
          ring: 'ring-warning/20',
          text: 'Limited'
        };
      default: 
        return { 
          badge: 'bg-destructive text-destructive-foreground', 
          ring: 'ring-destructive/20',
          text: 'Unavailable'
        };
    }
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      blood: '🩸',
      drugs: '💊',
      organs: '🫀',
      equipment: '🏥'
    };
    return icons[type] || '📦';
  };

  const styles = getAvailabilityStyles(resource.availability);

  const handleRequest = () => {
    setSelectedResource(resource);
    setIsRequestOpen(true);
  };

  const handleHospitalClick = () => {
    if (hospital) {
      navigate(`/hospital/${hospital.id}`);
    }
  };

  return (
    <AppLayout title={resource.name} subtitle={`Resource Details`}>
      <div className="space-y-6">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
          data-navigation
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Resource Image and Details */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="relative h-64 sm:h-80">
                <img 
                  src={resource.image}
                  alt={resource.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                
                {/* Type Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="text-2xl">{getTypeIcon(resource.type)}</span>
                  <Badge variant="secondary" className="capitalize backdrop-blur-sm bg-background/80">
                    {resource.type}
                  </Badge>
                </div>

                {/* Emergency Badge */}
                {resource.isEmergency && (
                  <Badge variant="destructive" className="absolute top-3 right-3 animate-pulse">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Emergency
                  </Badge>
                )}

                {/* Availability Badge */}
                <Badge className={cn("absolute bottom-3 right-3", styles.badge)}>
                  {styles.text}
                </Badge>

                {/* Title on image */}
                <div className="absolute bottom-4 left-4 text-white">
                  <h1 className="text-2xl sm:text-3xl font-bold">{resource.name}</h1>
                </div>
              </div>

              {/* Resource Info */}
              <CardContent className="p-6 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="font-semibold text-lg mb-2">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">{resource.description}</p>
                </div>

                {/* Quantity */}
                <div>
                  <h3 className="font-semibold text-lg mb-2">Availability</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-primary">{resource.quantity}</span>
                    <span className="text-lg text-muted-foreground">units available</span>
                  </div>
                  <div className="mt-2">
                    <Badge className={cn("text-sm", styles.badge)}>
                      {styles.text}
                    </Badge>
                  </div>
                </div>

                {/* Additional Info based on type */}
                {resource.bloodType && (
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Blood Type</h3>
                    <Badge variant="outline" className="text-lg px-3 py-1 font-mono">
                      {resource.bloodType}
                    </Badge>
                  </div>
                )}

                {/* Expiry Date */}
                {resource.expiryDate && (
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Expiry Information</h3>
                    <div className="flex items-center gap-2 text-warning">
                      <Calendar className="h-4 w-4" />
                      <span>Expires on {new Date(resource.expiryDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Hospital Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Hospital Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                  onClick={handleHospitalClick}
                  data-navigation
                >
                  <Building2 className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-primary hover:underline">{resource.hospital}</p>
                    <p className="text-sm text-muted-foreground">{resource.region}</p>
                    {hospital && (
                      <p className="text-xs text-muted-foreground mt-1">{hospital.city}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(resource.lastUpdated).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Alert */}
            {resource.isEmergency && (
              <Card className="border-destructive bg-destructive/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-semibold text-destructive">Emergency Resource</p>
                      <p className="text-sm text-destructive/80 mt-1">
                        This is a time-critical resource requiring immediate attention.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Button */}
            <Card>
              <CardContent className="p-4">
                <Button 
                  size="lg" 
                  className="w-full"
                  disabled={resource.availability === 'unavailable'}
                  onClick={handleRequest}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Request This Resource
                </Button>
                {resource.availability === 'unavailable' && (
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    This resource is currently unavailable
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate('/sharing')}
                  data-navigation
                >
                  <Package className="mr-2 h-4 w-4" />
                  Browse All Resources
                </Button>
                {hospital && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleHospitalClick}
                    data-navigation
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    View Hospital Details
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <ResourceRequestForm
          resource={selectedResource}
          isOpen={isRequestOpen}
          onClose={() => setIsRequestOpen(false)}
        />
      </div>
    </AppLayout>
  );
};

export default ResourceDetails;