import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, CheckCircle, Shield, Loader2, RefreshCw, Eye, ShieldOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hospitalsApi } from '@/services/api';
import AppLayout from '@/components/layout/AppLayout';
import HospitalLogo from '@/components/HospitalLogo';
// ...existing code...

interface Hospital {
  id: string;
  name: string;
  logo?: string | null;
  registration_number: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  hospital_type: string;
  verified_status: string;
  is_active: boolean;
  bed_capacity: number | null;
  created_at: string;
}

const HospitalManagement = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [filteredHospitals, setFilteredHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadHospitals();
  }, []);

  useEffect(() => {
    filterHospitals();
  }, [hospitals, statusFilter, searchQuery]);

  const loadHospitals = async () => {
    setIsLoading(true);
    try {
      const res = await hospitalsApi.getAll();
      const data: Hospital[] = (res as unknown)?.data?.results ?? (res as unknown)?.data ?? (res as unknown)?.results ?? [];
      setHospitals(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load hospitals', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filterHospitals = () => {
    let filtered = [...hospitals];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(h => h.verified_status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.registration_number ?? '').toLowerCase().includes(q) ||
        (h.email ?? '').toLowerCase().includes(q)
      );
    }
    setFilteredHospitals(filtered);
  };

  const handleSuspend = async (hospital: Hospital) => {
    setActionLoading(hospital.id);
    try {
      await hospitalsApi.suspend(hospital.id);
      toast({ title: 'Hospital Suspended', description: `${hospital.name} has been suspended.` });
      loadHospitals();
    } catch {
      toast({ title: 'Error', description: 'Failed to suspend hospital', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async (hospital: Hospital) => {
    setActionLoading(hospital.id);
    try {
      await hospitalsApi.verify(hospital.id);
      toast({ title: 'Hospital Verified', description: `${hospital.name} has been verified.` });
      loadHospitals();
    } catch {
      toast({ title: 'Error', description: 'Failed to verify hospital', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (verified_status: string, is_active: boolean) => {
    if (!is_active) return <Badge variant="destructive">Inactive</Badge>;
    const map: Record<string, { variant: unknown; label: string }> = {
      verified: { variant: 'default', label: 'Verified' },
      pending: { variant: 'secondary', label: 'Pending' },
      suspended: { variant: 'destructive', label: 'Suspended' },
    };
    const cfg = map[verified_status] ?? { variant: 'secondary', label: verified_status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const activeCount = hospitals.filter(h => h.is_active && h.verified_status === 'verified').length;
  const pendingCount = hospitals.filter(h => h.verified_status === 'pending').length;
  const suspendedCount = hospitals.filter(h => h.verified_status === 'suspended' || !h.is_active).length;

  return (
    <AppLayout title="Hospital Management">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hospitals</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{hospitals.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified &amp; Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
              <Shield className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{pendingCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspended</CardTitle>
              <ShieldOff className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{suspendedCount}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Hospitals</CardTitle>
            <CardDescription>Manage active hospitals on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search by name, registration number, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={loadHospitals} variant="outline" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => navigate('/admin/hospital-update-requests')} variant="outline">
                Review Update Requests
              </Button>
              <Button onClick={() => navigate('/admin/offboarding-requests')} variant="outline">
                Review Offboarding Requests
              </Button>
            </div>

            <div className="rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredHospitals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-4 opacity-50" />
                  <p>No hospitals found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Reg. Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHospitals.map((hospital) => (
                      <TableRow key={hospital.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <HospitalLogo
                              name={hospital.name}
                              logo={hospital.logo}
                              className="h-9 w-9"
                            />
                            <div>
                              <div className="font-medium">{hospital.name}</div>
                              <div className="text-xs text-muted-foreground">{hospital.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{hospital.registration_number ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{hospital.hospital_type ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{[hospital.city, hospital.state, hospital.country].filter(Boolean).join(', ') || '—'}</span>
                        </TableCell>
                        <TableCell>{getStatusBadge(hospital.verified_status, hospital.is_active)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/hospital/${hospital.id}`)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            {hospital.verified_status === 'pending' && (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={actionLoading === hospital.id}
                                onClick={() => handleVerify(hospital)}
                              >
                                {actionLoading === hospital.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><CheckCircle className="h-3 w-3 mr-1" />Verify</>
                                )}
                              </Button>
                            )}
                            {hospital.verified_status !== 'suspended' && hospital.is_active && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actionLoading === hospital.id}
                                onClick={() => handleSuspend(hospital)}
                              >
                                {actionLoading === hospital.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><ShieldOff className="h-3 w-3 mr-1" />Suspend</>
                                )}
                              </Button>
                            )}
                            {hospital.is_active && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === hospital.id}
                                onClick={() => handleSuspend(hospital)}
                              >
                                {actionLoading === hospital.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Offboard'
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default HospitalManagement;
