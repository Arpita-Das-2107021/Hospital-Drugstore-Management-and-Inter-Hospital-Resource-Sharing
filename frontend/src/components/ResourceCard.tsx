import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResourceWithVisibility, mockHospitals } from '@/data/mockData';
import { MapPin, Clock, AlertTriangle, ShoppingCart, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ResourceCardProps {
  resource: ResourceWithVisibility;
  onRequest?: (resource: ResourceWithVisibility) => void;
  showVisibilityToggle?: boolean;
  onToggleVisibility?: (resourceId: string, visible: boolean) => void;
  onClick?: (resource: ResourceWithVisibility) => void;
}

export const ResourceCard = ({ 
  resource, 
  onRequest,
  showVisibilityToggle = false,
  onToggleVisibility,
  onClick
}: ResourceCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();

  const getAvailabilityStyles = (availability: string) => {
    switch (availability) {
      case 'available': 
        return { 
          badge: 'bg-success text-success-foreground', 
          ring: 'ring-success/20',
          glow: 'shadow-success/20'
        };
      case 'limited': 
        return { 
          badge: 'bg-warning text-warning-foreground', 
          ring: 'ring-warning/20',
          glow: 'shadow-warning/20'
        };
      default: 
        return { 
          badge: 'bg-destructive text-destructive-foreground', 
          ring: 'ring-destructive/20',
          glow: 'shadow-destructive/20'
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

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on buttons or hospital name
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('.hospital-link')) {
      return;
    }
    
    if (onClick) {
      onClick(resource);
    } else {
      navigate(`/resource/${resource.id}`);
    }
  };

  const handleHospitalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Find hospital ID from mockHospitals
    const hospital = mockHospitals.find(h => h.name === resource.hospital);
    if (hospital) {
      navigate(`/hospital/${hospital.id}`);
    } else {
      navigate('/hospitals'); // Fallback to hospitals list
    }
  };

  return (
    <Card 
      className={cn(
        "group overflow-hidden transition-all duration-300 cursor-pointer",
        "hover:shadow-xl hover:-translate-y-1",
        resource.isEmergency && "ring-2 ring-destructive",
        isHovered && styles.glow,
        !resource.isVisibleToOthers && showVisibilityToggle && "opacity-70"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      data-navigation
    >
      {/* Image Section */}
      <div className="relative h-36 overflow-hidden">
        <img 
          src={resource.image} 
          alt={resource.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        
        {/* Type Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="text-xl">{getTypeIcon(resource.type)}</span>
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
          {resource.availability === 'available' ? 'Available' : 
           resource.availability === 'limited' ? 'Limited' : 'Unavailable'}
        </Badge>

        {/* Visibility indicator for pharmacist view */}
        {showVisibilityToggle && (
          <div className="absolute bottom-3 left-3">
            <Badge 
              variant={resource.isVisibleToOthers ? "default" : "outline"} 
              className={cn(
                "backdrop-blur-sm",
                resource.isVisibleToOthers ? "bg-primary/90" : "bg-background/80"
              )}
            >
              {resource.isVisibleToOthers ? (
                <><Eye className="mr-1 h-3 w-3" /> Shared</>
              ) : (
                <><EyeOff className="mr-1 h-3 w-3" /> Hidden</>
              )}
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        {/* Title & Description */}
        <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
          {resource.name}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mt-1 min-h-[2.5rem]">
          {resource.description}
        </p>

        {/* Quantity */}
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-primary">{resource.quantity}</span>
          <span className="text-sm text-muted-foreground">units available</span>
        </div>

        {/* Meta Info */}
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span 
              className="truncate hospital-link cursor-pointer hover:text-primary transition-colors"
              onClick={handleHospitalClick}
            >
              {resource.hospital}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Updated {new Date(resource.lastUpdated).toLocaleDateString()}</span>
          </div>
          {resource.expiryDate && (
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Expires {new Date(resource.expiryDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {showVisibilityToggle ? (
            <Button 
              variant={resource.isVisibleToOthers ? "outline" : "default"}
              size="sm" 
              className="flex-1 transition-all duration-200"
              onClick={() => onToggleVisibility?.(resource.id, !resource.isVisibleToOthers)}
            >
              {resource.isVisibleToOthers ? (
                <><EyeOff className="mr-2 h-4 w-4" /> Hide from Others</>
              ) : (
                <><Eye className="mr-2 h-4 w-4" /> Make Visible</>
              )}
            </Button>
          ) : (
            <Button 
              size="sm" 
              className="flex-1 transition-all duration-200 group-hover:bg-primary"
              disabled={resource.availability === 'unavailable'}
              onClick={() => onRequest?.(resource)}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Request
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ResourceCard;