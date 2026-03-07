import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { hospitalsApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  MapPin, 
  Building2, 
  Bed, 
  Phone, 
  Mail, 
  Package,
  Users,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { useState, useEffect } from 'react';

const HospitalDetails = () => {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hospitalId) {
      fetchHospitalDetails();
    }
  }, [hospitalId]);

  const fetchHospitalDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching hospital details for ID:', hospitalId);
      const data = await hospitalsApi.getById(hospitalId!);
      console.log('Hospital data received:', data);
      
      // Map backend fields to frontend expected format
      const mappedHospital = {
        id: data.id,
        name: data.name,
        city: data.city,
        region: data.state || 'Unknown Region',
        address: data.address,
        phone: data.phone,
        email: data.email,
        status: data.status,
        total_staff: data.total_staff || 0,
        total_inventory: data.total_inventory || 0,
        total_departments: data.total_departments || 0,
        license_number: data.license_number,
        verified_at: data.verified_at,
        image: '/hospital-placeholder.jpg',
        specialties: ['General Medicine', 'Emergency Care'],
        total_beds: 150,
      };
      
      setHospital(mappedHospital);
    } catch (err) {
      console.error('Failed to fetch hospital details:', err);
      setError('Failed to load hospital details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Loading Hospital Details..." subtitle="">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading hospital details...</span>
        </div>
      </AppLayout>
    );
  }

  if (error || !hospital) {
    return (
      <AppLayout title="Hospital Details" subtitle="">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <p>{error || 'Hospital not found'}</p>
              <div className="mt-4 space-x-2">
                <Button onClick={() => navigate('/hospitals')}>Back to Hospitals</Button>
                <Button onClick={fetchHospitalDetails} variant="outline">Retry</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={hospital.name} subtitle={hospital.city + ', ' + hospital.region}>
      <div className="space-y-6">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate('/hospitals')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Hospitals
        </Button>

        {/* Hospital Header */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Hospital Image and Basic Info */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="relative h-64 sm:h-80">
                <img 
                  src={hospital.image}
                  alt={hospital.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <h1 className="text-2xl sm:text-3xl font-bold">{hospital.name}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className="h-4 w-4" />
                    <span>{hospital.address}</span>
                  </div>
                </div>
                <Badge className="absolute top-4 right-4 bg-primary/90">
                  {hospital.region}
                </Badge>
              </div>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Hospital Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Staff</p>
                    <p className="font-medium">{hospital.total_staff}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Inventory Items</p>
                    <p className="font-medium">{hospital.total_inventory}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Departments</p>
                    <p className="font-medium">{hospital.total_departments}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Bed className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Beds</p>
                    <p className="font-medium">{hospital.total_beds}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{hospital.phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{hospital.email}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Specialties</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {hospital.specialties.map((specialty: string, index: number) => (
                    <Badge key={index} variant="secondary">
                      {specialty}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Status and Details */}
        <Card>
          <CardHeader>
            <CardTitle>Hospital Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">License Number</p>
                <p className="font-medium">{hospital.license_number}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={hospital.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {hospital.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Verified</p>
                <p className="font-medium">
                  {hospital.verified_at 
                    ? new Date(hospital.verified_at).toLocaleDateString()
                    : 'Not verified'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default HospitalDetails;