// src/pages/Hospitals.tsx

import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHospitals } from '@/hooks/useDashboardData';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import HospitalLogo from '@/components/HospitalLogo';

interface HospitalCardItem {
  id: string;
  name: string;
  city?: string;
  region?: string;
  specialties?: string[];
  coordinates_lat?: string | null;
  coordinates_lng?: string | null;
  logo?: string | null;
}

const Hospitals = () => {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('all');

  const navigate = useNavigate();
  const { hospitals, loading, error } = useHospitals();
  const typedHospitals = hospitals as HospitalCardItem[];

  const regions = useMemo(() => {
    if (!typedHospitals.length) return [];
    return [...new Set(typedHospitals.map((h) => h.region || 'Unknown Region'))].sort();
  }, [typedHospitals]);

  const filtered = useMemo(() => {
    if (!typedHospitals.length) return [];

    return typedHospitals.filter((hospital) => {
      const query = search.toLowerCase();

      const matchesSearch =
        hospital.name.toLowerCase().includes(query) ||
        hospital.city?.toLowerCase().includes(query);

      const matchesRegion =
        region === 'all' || hospital.region === region;

      return matchesSearch && matchesRegion;
    });
  }, [typedHospitals, search, region]);

  const handleNavigate = (hospitalId: string) => {
    navigate(`/hospital/${hospitalId}`);
  };

  if (loading) {
    return (
      <AppLayout title="All Hospitals">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="All Hospitals">
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-muted-foreground">
            Failed to load hospitals. Please try again.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="All Hospitals">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search hospitals by name or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl pl-10 shadow-sm"
            />
          </div>

          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="h-11 w-48 rounded-xl shadow-sm">
              <SelectValue placeholder="Filter by region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Count */}
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {typedHospitals.length} hospitals
        </p>

        {/* Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((hospital) => (
            <Card
              key={hospital.id}
              className="group cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              onClick={() => handleNavigate(hospital.id)}
              data-navigation
            >
              {/* Header */}
              <div className="relative h-36 bg-gradient-to-br from-primary/10 to-primary/5">
                <div className="absolute inset-0 flex items-center justify-center">
                  <HospitalLogo
                    name={hospital.name}
                    logo={hospital.logo}
                    className="h-20 w-20"
                    imageClassName="object-cover rounded-xl shadow-sm"
                    fallbackClassName="bg-primary/10 text-primary"
                  />
                </div>

                <Badge className="absolute right-3 top-3">
                  {hospital.region}
                </Badge>
              </div>

              <CardContent className="p-4">
                {/* Title */}
                <h3 className="line-clamp-1 text-base font-semibold transition-colors group-hover:text-primary">
                  {hospital.name}
                </h3>

                {/* Location */}
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{hospital.city || 'N/A'}</span>
                </div>

                {/* Specialties */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {hospital.specialties?.slice(0, 2).map((spec: string) => (
                    <Badge
                      key={spec}
                      variant="secondary"
                      className="text-xs"
                    >
                      {spec}
                    </Badge>
                  ))}

                  {hospital.specialties &&
                    hospital.specialties.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{hospital.specialties.length - 2}
                      </Badge>
                    )}
                </div>

                {/* Coordinates */}
                {hospital.coordinates_lat &&
                  hospital.coordinates_lng && (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-center">
                      <MapPin className="mx-auto h-4 w-4 text-primary" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {parseFloat(
                          hospital.coordinates_lat
                        ).toFixed(2)}
                        °,{' '}
                        {parseFloat(
                          hospital.coordinates_lng
                        ).toFixed(2)}
                        °
                      </p>
                    </div>
                  )}

                {/* Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full rounded-xl transition-all group-hover:border-primary group-hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigate(hospital.id);
                  }}
                  data-navigation
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty */}
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">
              No hospitals found
            </h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Hospitals;