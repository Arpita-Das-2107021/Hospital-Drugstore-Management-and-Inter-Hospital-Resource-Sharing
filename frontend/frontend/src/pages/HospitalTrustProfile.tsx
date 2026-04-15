import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Shield,
  Star,
  Phone,
  Mail,
  MapPin,
  Users,
  Package,
  AlertTriangle,
  ExternalLink,
  Building2,
  Activity,
  Loader2,
} from 'lucide-react';
import { hospitalsApi, requestsApi } from '@/services/api';
import authService from '@/services/authService';
import { resolveMediaUrl } from '@/utils/media';

export default function HospitalTrustProfile() {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const [hospital, setHospital] = useState<unknown>(null);
  const [recentRequests, setRecentRequests] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [hospitalId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      let resolvedHospitalId = hospitalId;
      if (!resolvedHospitalId) {
        const meResponse = await authService.authenticatedRequest<unknown>('/api/auth/me/');
        const me = meResponse?.data ?? meResponse;
        if (me?.hospital_id) {
          resolvedHospitalId = String(me.hospital_id);
        }
      }

      if (!resolvedHospitalId) {
        setError('No hospital context found for this account.');
        setHospital(null);
        setRecentRequests([]);
        return;
      }

      const [hospitalRes, requestsRes] = await Promise.allSettled([
        hospitalsApi.getById(resolvedHospitalId),
        requestsApi.getAll({ limit: '10' }),
      ]);

      if (hospitalRes.status === 'fulfilled') {
        const d = (hospitalRes.value as unknown)?.data ?? hospitalRes.value;
        setHospital(d);
      } else {
        setError('Failed to load hospital details.');
      }

      if (requestsRes.status === 'fulfilled') {
        const rd = (requestsRes.value as unknown)?.data ?? requestsRes.value;
        const list: unknown[] = rd?.results ?? (Array.isArray(rd) ? rd : []);
        const scoped = list.filter((req: unknown) => {
          const requester = String(req?.requesting_hospital ?? req?.requesting_hospital_id ?? '');
          const supplier = String(req?.supplying_hospital ?? req?.supplying_hospital_id ?? '');
          return requester === resolvedHospitalId || supplier === resolvedHospitalId;
        });
        setRecentRequests(scoped.slice(0, 5));
      }
    } catch (err) {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const renderStarRating = (rating: number) => (
    <div className="flex items-center space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      ))}
      <span className="ml-2 text-sm font-medium">{rating?.toFixed(1) ?? '—'}</span>
    </div>
  );

  if (loading) {
    return (
      <AppLayout title="Hospital Performance"
        // subtitle="Trust metrics and verification status"
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading profile...</span>
        </div>
      </AppLayout>
    );
  }

  if (error || !hospital) {
    return (
      <AppLayout title="Hospital Performance"
        // subtitle=""
      >
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <p>{error || 'Hospital not found'}</p>
              <Button onClick={fetchData} className="mt-4">Retry</Button>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const initials = hospital.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '??';
  const isVerified = hospital.verified_status === 'verified';

  return (
    <AppLayout
      title="Hospital Performance Profile"
      // subtitle={`${hospital.name} — Trust metrics and verification`}
    >
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={resolveMediaUrl(hospital.logo)} alt={`${hospital.name} logo`} />
              <AvatarFallback className="text-lg font-bold bg-primary/10">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center space-x-3 flex-wrap gap-2">
                <h1 className="text-2xl font-bold">{hospital.name}</h1>
                {isVerified && (
                  <Badge className="bg-green-100 text-green-800 border-green-300">
                    <Shield className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
                {hospital.hospital_type && (
                  <Badge variant="outline" className="capitalize">{hospital.hospital_type}</Badge>
                )}
              </div>
              <div className="flex items-center space-x-4 mt-2 flex-wrap gap-2">
                {hospital.city && (
                  <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{hospital.city}{hospital.country ? `, ${hospital.country}` : ''}</span>
                  </div>
                )}
                {hospital.registration_number && (
                  <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{hospital.registration_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex space-x-2 flex-wrap gap-2">
            {hospital.phone && (
              <Button variant="outline" onClick={() => window.open(`tel:${hospital.phone}`)}>
                <Phone className="h-4 w-4 mr-2" />
                Call
              </Button>
            )}
            {hospital.email && (
              <Button variant="outline" onClick={() => window.open(`mailto:${hospital.email}`)}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
            )}
            {hospital.website && (
              <Button onClick={() => window.open(hospital.website, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Website
              </Button>
            )}
          </div>
        </div>

        {/* Trust Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold capitalize">
                    {hospital.verified_status || 'unverified'}
                  </p>
                  <p className="text-sm text-muted-foreground">Verification Status</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Activity className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold capitalize">{hospital.status || 'active'}</p>
                  <p className="text-sm text-muted-foreground">Platform Status</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hospital.staff_count ?? '—'}</p>
                  <p className="text-sm text-muted-foreground">Staff Members</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Package className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hospital.bed_count ?? '—'}</p>
                  <p className="text-sm text-muted-foreground">Bed Capacity</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Recent Requests</TabsTrigger>
            <TabsTrigger value="contact">Contact Info</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Hospital Information</CardTitle>
                  <CardDescription>Registered details and capabilities</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Name', value: hospital.name },
                    { label: 'Type', value: hospital.hospital_type },
                    { label: 'Registration No.', value: hospital.registration_number },
                    { label: 'City', value: hospital.city },
                    { label: 'State/Province', value: hospital.state },
                    { label: 'Country', value: hospital.country },
                    { label: 'Address', value: hospital.address },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1 border-b last:border-0">
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span className="text-sm font-medium capitalize">{row.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Platform Activity</CardTitle>
                  <CardDescription>Sharing and coordination history</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
                  ) : recentRequests.map((req) => (
                    <div key={req.id} className="flex items-center space-x-3">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        req.status === 'completed' || req.status === 'delivered'
                          ? 'bg-green-500'
                          : req.status === 'pending'
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {req.catalog_item_name || req.resource_name || 'Resource Request'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Priority: {req.priority || 'normal'}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize flex-shrink-0">
                        {req.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Recent Resource Requests</CardTitle>
                <CardDescription>Latest resource sharing transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {recentRequests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No requests found</p>
                ) : (
                  <div className="space-y-4">
                    {recentRequests.map((req) => (
                      <div key={req.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Package className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {req.catalog_item_name || 'Resource Request'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Qty: {req.quantity_requested ?? '—'} • Priority: {req.priority || 'normal'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <Badge variant="outline" className="capitalize">
                            {req.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { icon: Phone, label: 'Phone', value: hospital.phone, href: `tel:${hospital.phone}` },
                  { icon: Mail, label: 'Email', value: hospital.email, href: `mailto:${hospital.email}` },
                  { icon: ExternalLink, label: 'Website', value: hospital.website, href: hospital.website },
                  { icon: MapPin, label: 'Address', value: hospital.address },
                ].filter(item => item.value).map(item => (
                  <div key={item.label} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <item.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      {item.href ? (
                        <a href={item.href} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline">
                          {item.value}
                        </a>
                      ) : (
                        <p className="text-sm font-medium">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
