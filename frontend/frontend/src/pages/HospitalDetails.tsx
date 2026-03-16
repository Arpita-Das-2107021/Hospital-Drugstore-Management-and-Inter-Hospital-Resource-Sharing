import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { hospitalsApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
import HospitalLogo from '@/components/HospitalLogo';
import { resolveMediaUrl } from '@/utils/media';

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface HospitalDetailsData {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  status: string;
  total_staff: number;
  total_inventory: number;
  total_departments: number;
  license_number: string;
  verified_at?: string;
  hospital_type: string;
  website?: string;
  image: string;
  logo?: string | null;
  specialties: string[];
  total_beds: number;
  coordinates_lat?: string | null;
  coordinates_lng?: string | null;
}

interface HospitalFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  hospital_type: string;
  registration_number: string;
  latitude: string;
  longitude: string;
  api_base_url: string;
  api_auth_type: string;
  api_username: string;
  api_key: string;
  api_password: string;
}

const HospitalDetails = () => {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [hospital, setHospital] = useState<HospitalDetailsData | null>(null);
  const [formData, setFormData] = useState<HospitalFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const isSuperAdmin = (user?.role || '').toUpperCase() === 'SUPER_ADMIN';
  const isHospitalAdmin = (user?.role || '').toUpperCase() === 'HOSPITAL_ADMIN';
  const canEditMyHospital = isHospitalAdmin && String(user?.hospital_id || '') === String(hospitalId || '');
  const canEditHospital = isSuperAdmin || canEditMyHospital;

  useEffect(() => {
    if (hospitalId) {
      fetchHospitalDetails();
    }
  }, [hospitalId, canEditMyHospital]);

  const fetchHospitalDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = canEditMyHospital
        ? await hospitalsApi.getMyHospital()
        : await hospitalsApi.getById(hospitalId!);
      // API returns { success: true, data: { ... } }
      const d = res?.data ?? res;
      
      // Map backend fields to frontend expected format
      const mappedHospital: HospitalDetailsData = {
        id: d.id,
        name: d.name,
        city: d.city,
        state: d.state || '',
        country: d.country || '',
        region: d.state || d.country || 'Unknown Region',
        address: d.address,
        phone: d.phone,
        email: d.email,
        status: d.verified_status ?? d.status,
        total_staff: d.total_staff || 0,
        total_inventory: d.total_inventory || 0,
        total_departments: d.total_departments || 0,
        license_number: d.registration_number || d.license_number,
        verified_at: d.verified_at,
        hospital_type: d.hospital_type,
        website: d.website,
        image: resolveMediaUrl(d.logo || d.image || null),
        logo: d.logo ?? null,
        specialties: ['General Medicine', 'Emergency Care'],
        total_beds: d.bed_count || 150,
        coordinates_lat: d.latitude ?? d.coordinates_lat,
        coordinates_lng: d.longitude ?? d.coordinates_lng,
      };
      
      setHospital(mappedHospital);
      setImageLoadFailed(false);
      setFormData({
        name: d.name ?? '',
        address: d.address ?? '',
        city: d.city ?? '',
        state: d.state ?? '',
        country: d.country ?? '',
        phone: d.phone ?? '',
        email: d.email ?? '',
        website: d.website ?? '',
        hospital_type: d.hospital_type ?? '',
        registration_number: d.registration_number ?? d.license_number ?? '',
        latitude: d.latitude ?? d.coordinates_lat ?? '',
        longitude: d.longitude ?? d.coordinates_lng ?? '',
        api_base_url: d.api_base_url ?? '',
        api_auth_type: d.api_auth_type ?? '',
        api_username: d.api_username ?? '',
        api_key: '',
        api_password: '',
      });
    } catch (err) {
      console.error('Failed to fetch hospital details:', err);
      setError('Failed to load hospital details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof HospitalFormData, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = async () => {
    if (!hospitalId || !formData) return;

    try {
      setIsSaving(true);
      const payload = {
        name: formData.name,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        phone: formData.phone,
        email: formData.email,
        website: formData.website,
        hospital_type: formData.hospital_type,
        registration_number: formData.registration_number,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        api_base_url: formData.api_base_url || null,
        api_auth_type: formData.api_auth_type || null,
        api_username: formData.api_username || null,
        api_key: formData.api_key || null,
        api_password: formData.api_password || null,
      };

      const response = canEditMyHospital
        ? await hospitalsApi.updateMyHospital(payload)
        : await hospitalsApi.update(hospitalId, payload);

      const pendingRequest = (response as any)?.data?.pending_update_request;
      if (pendingRequest) {
        toast({
          title: 'Update submitted for review',
          description: 'Non-sensitive fields were applied. Sensitive field changes are pending SUPER_ADMIN approval.',
        });
      } else {
        toast({ title: 'Hospital updated', description: 'Hospital details have been saved successfully.' });
      }
      await fetchHospitalDetails();
    } catch (err) {
      console.error('Failed to update hospital:', err);
      toast({ title: 'Update failed', description: 'Failed to update hospital details.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const lat = Number(hospital?.coordinates_lat);
  const lng = Number(hospital?.coordinates_lng);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

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
                <Button onClick={() => navigate(isSuperAdmin ? '/admin/hospitals' : '/hospitals')}>Back to Hospitals</Button>
                <Button onClick={fetchHospitalDetails} variant="outline">Retry</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (!formData) {
    return null;
  }

  return (
    <AppLayout title={hospital.name} subtitle={hospital.city + ', ' + hospital.region}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button 
            variant="ghost" 
            onClick={() => navigate(isSuperAdmin ? '/admin/hospitals' : '/hospitals')}
            className="mb-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Hospitals
          </Button>
          {canEditHospital && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          )}
        </div>

        {/* Hospital Header */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Hospital Image and Basic Info */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="relative h-64 sm:h-80">
                {hospital.image && !imageLoadFailed ? (
                  <img
                    src={hospital.image}
                    alt={hospital.name}
                    className="h-full w-full object-cover"
                    onError={() => setImageLoadFailed(true)}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <HospitalLogo
                      name={hospital.name}
                      logo={hospital.logo}
                      className="h-28 w-28"
                      imageClassName="object-cover shadow-lg"
                    />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <h1 className="text-2xl sm:text-3xl font-bold">{formData.name || hospital.name}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className="h-4 w-4" />
                    <span>{formData.address || hospital.address}</span>
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

        <Card>
          <CardHeader>
            <CardTitle>Hospital Location</CardTitle>
          </CardHeader>
          <CardContent>
            {hasCoordinates ? (
              <div className="overflow-hidden rounded-md border">
                <MapContainer
                  center={[lat, lng]}
                  zoom={13}
                  style={{ height: '320px', width: '100%' }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[lat, lng]} icon={markerIcon} />
                </MapContainer>
              </div>
            ) : (
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                Location data unavailable
              </div>
            )}
          </CardContent>
        </Card>

        {canEditHospital && (
          <Card>
            <CardHeader>
              <CardTitle>Edit Hospital Information</CardTitle>
            </CardHeader>
            <CardContent>
              {!isSuperAdmin && (
                <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Sensitive fields (registration/API credentials/email) are submitted for SUPER_ADMIN approval.
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Hospital Name</p>
                  <Input value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Hospital Type</p>
                  <Input value={formData.hospital_type} onChange={(e) => handleInputChange('hospital_type', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <Input value={formData.address} onChange={(e) => handleInputChange('address', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">City</p>
                  <Input value={formData.city} onChange={(e) => handleInputChange('city', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">State</p>
                  <Input value={formData.state} onChange={(e) => handleInputChange('state', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Country</p>
                  <Input value={formData.country} onChange={(e) => handleInputChange('country', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Registration Number</p>
                  <Input value={formData.registration_number} onChange={(e) => handleInputChange('registration_number', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <Input value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <Input type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Website</p>
                  <Input value={formData.website} onChange={(e) => handleInputChange('website', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Latitude</p>
                  <Input value={formData.latitude} onChange={(e) => handleInputChange('latitude', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Longitude</p>
                  <Input value={formData.longitude} onChange={(e) => handleInputChange('longitude', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm text-muted-foreground">API Base URL</p>
                  <Input value={formData.api_base_url} onChange={(e) => handleInputChange('api_base_url', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">API Auth Type</p>
                  <Input value={formData.api_auth_type} onChange={(e) => handleInputChange('api_auth_type', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">API Username</p>
                  <Input value={formData.api_username} onChange={(e) => handleInputChange('api_username', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">API Key</p>
                  <Input type="password" value={formData.api_key} onChange={(e) => handleInputChange('api_key', e.target.value)} placeholder="Leave blank to keep unchanged" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">API Password</p>
                  <Input type="password" value={formData.api_password} onChange={(e) => handleInputChange('api_password', e.target.value)} placeholder="Leave blank to keep unchanged" />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!canEditMyHospital && !isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Hospital Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{hospital.address || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{hospital.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{hospital.email || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <p className="font-medium">{hospital.website || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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