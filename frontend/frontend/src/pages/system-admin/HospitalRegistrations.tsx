import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import registrationService from '@/services/registrationService';
import HospitalLogo from '@/components/HospitalLogo';
// ...existing code...

interface RegistrationRequest {
  id: string;
  name: string;
  logo?: string | null;
  registration_number: string;
  email: string;
  admin_email?: string;
  admin_phone?: string;
  phone: string;
  city: string;
  state: string;
  hospital_type: string;
  facility_type?: string;
  facility_classification?: string;
  data_submission_type?: string;
  inventory_source_type?: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  address?: string;
  country?: string;
  contact_name?: string;
  admin_name?: string;
}

const normalizeStatus = (status?: string | null) => (status || '').toLowerCase();

const HospitalRegistrations = () => {
  const [registrations, setRegistrations] = useState<RegistrationRequest[]>([]);
  const [filtered, setFiltered] = useState<RegistrationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadRegistrations();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [registrations, statusFilter, searchQuery]);

  const loadRegistrations = async () => {
    setIsLoading(true);
    try {
      const data = await registrationService.listHospitals();
      const list: RegistrationRequest[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.data?.results)
              ? data.data.results
              : [];
      setRegistrations(list);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load healthcare registration requests.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...registrations];

    if (statusFilter !== 'all') {
      result = result.filter(
        (r) => normalizeStatus(r.status) === normalizeStatus(statusFilter)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.registration_number?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.facility_type?.toLowerCase().includes(q) ||
          r.data_submission_type?.toLowerCase().includes(q)
      );
    }

    setFiltered(result);
  };

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    const map: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; icon: typeof Clock }> = {
      pending_approval: { label: 'Pending Approval', variant: 'secondary', icon: Clock },
      pending: { label: 'Pending', variant: 'secondary', icon: Clock },
      active: { label: 'Approved', variant: 'default', icon: CheckCircle },
      approved: { label: 'Approved', variant: 'default', icon: CheckCircle },
      rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
    };
    const cfg = map[normalized] ?? { label: status, variant: 'outline' as const, icon: Clock };
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit capitalize">
        <Icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
    );
  };

  const pendingCount = registrations.filter(
    (r) => ['pending_approval', 'pending'].includes(normalizeStatus(r.status))
  ).length;
  const approvedCount = registrations.filter(
    (r) => ['active', 'approved'].includes(normalizeStatus(r.status))
  ).length;
  const rejectedCount = registrations.filter(
    (r) => normalizeStatus(r.status) === 'rejected'
  ).length;

  return (
    <AppLayout
      title="Health Facility Registration Requests"
      // subtitle="Platform Admin — Review and act on facility onboarding applications"
    >
      <div className="space-y-6">
        {/* Warning banner — Platform Admin only */}
        {/* <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This section is for <strong>Platform Admins only</strong>. Healthcare Admins cannot
            approve or reject registrations.
          </span>
        </div> */}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{registrations.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Table card */}
        <Card>
          <CardHeader>
            <CardTitle>All Registration Requests</CardTitle>
            <CardDescription>
              Click <strong>View Details</strong> on any row to review and approve or reject that
                healthcare facility.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Search by name, email, or registration number…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="w-full sm:w-52">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={loadRegistrations}
                  variant="outline"
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-4 opacity-40" />
                  <p className="text-sm">No registration requests found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Healthcare</TableHead>
                      <TableHead>Reg. Number</TableHead>
                      <TableHead>Contact Email</TableHead>
                      <TableHead>Facility Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <HospitalLogo name={reg.name} logo={reg.logo} className="h-9 w-9" />
                            <div>
                              <div className="font-medium">{reg.name}</div>
                              {(reg.city || reg.state) && (
                                <div className="text-xs text-muted-foreground">
                                  {[reg.city, reg.state].filter(Boolean).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{reg.registration_number}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{reg.email}</span>
                          {reg.phone && (
                            <div className="text-xs text-muted-foreground">{reg.phone}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">
                            {(reg.facility_type || reg.hospital_type)?.replace(/_/g, ' ') ?? '—'}
                          </span>
                          {reg.facility_classification ? (
                            <div className="text-xs text-muted-foreground">{reg.facility_classification}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm uppercase">{reg.inventory_source_type || '—'}</span>
                          {reg.data_submission_type ? (
                            <div className="text-xs text-muted-foreground">{reg.data_submission_type}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>{getStatusBadge(reg.status)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {reg.submitted_at
                              ? new Date(reg.submitted_at).toLocaleDateString()
                              : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(`/admin/hospital-registrations/${reg.id}`, {
                                state: { registration: reg },
                              })
                            }
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View Details
                          </Button>
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

export default HospitalRegistrations;
