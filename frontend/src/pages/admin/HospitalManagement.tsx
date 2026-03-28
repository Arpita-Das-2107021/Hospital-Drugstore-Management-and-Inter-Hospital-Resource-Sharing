import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, CheckCircle, XCircle, Clock, Shield, Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import registrationService from '@/services/registrationService';
import AppLayout from '@/components/layout/AppLayout';

interface Hospital {
  id: number;
  code: string;
  name: string;
  license_number: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  status: string;
  status_display: string;
  connection_status: string;
  verified_at: string | null;
  created_at: string;
}

const HospitalManagement = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [filteredHospitals, setFilteredHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  
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
      const data = await registrationService.listHospitals();
      setHospitals(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load hospitals',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const filterHospitals = () => {
    let filtered = [...hospitals];
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(h => h.status === statusFilter);
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(h =>
        h.name.toLowerCase().includes(query) ||
        h.code.toLowerCase().includes(query) ||
        h.license_number.toLowerCase().includes(query) ||
        h.email.toLowerCase().includes(query)
      );
    }
    
    setFilteredHospitals(filtered);
  };
  
  const handleVerifyAPI = async (hospital: Hospital) => {
    setVerifyingId(hospital.id);
    try {
      const result = await registrationService.verifyHospitalAPI(hospital.id);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: `API connection verified for ${hospital.name}`,
        });
        loadHospitals(); // Reload to get updated connection status
      } else {
        toast({
          title: 'Verification Failed',
          description: result.message || 'Could not connect to hospital API',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to verify API connection',
        variant: 'destructive',
      });
    } finally {
      setVerifyingId(null);
    }
  };
  
  const handleApprove = async () => {
    if (!selectedHospital) return;
    
    setActionLoading(true);
    try {
      const result = await registrationService.approveHospital(selectedHospital.id);
      
      if (result.success) {
        toast({
          title: 'Hospital Approved',
          description: `${selectedHospital.name} has been approved successfully`,
        });
        setApproveDialog(false);
        setSelectedHospital(null);
        loadHospitals();
      } else {
        toast({
          title: 'Approval Failed',
          description: result.message || 'Failed to approve hospital',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to approve hospital',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleReject = async () => {
    if (!selectedHospital) return;
    
    setActionLoading(true);
    try {
      const result = await registrationService.rejectHospital(selectedHospital.id, rejectReason);
      
      if (result.success) {
        toast({
          title: 'Hospital Rejected',
          description: `${selectedHospital.name} has been rejected`,
        });
        setRejectDialog(false);
        setSelectedHospital(null);
        setRejectReason('');
        loadHospitals();
      } else {
        toast({
          title: 'Rejection Failed',
          description: result.message || 'Failed to reject hospital',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject hospital',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      PENDING: { variant: 'secondary', icon: Clock },
      ACTIVE: { variant: 'default', icon: CheckCircle },
      INACTIVE: { variant: 'outline', icon: XCircle },
      SUSPENDED: { variant: 'destructive', icon: Shield },
      REJECTED: { variant: 'destructive', icon: XCircle },
    };
    
    const config = variants[status] || variants.PENDING;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };
  
  const getConnectionBadge = (connectionStatus: string) => {
    if (!connectionStatus) return null;
    
    const variants: Record<string, { variant: any; icon: any; color: string }> = {
      CONNECTED: { variant: 'default', icon: Wifi, color: 'text-green-600' },
      PENDING: { variant: 'secondary', icon: Clock, color: 'text-yellow-600' },
      FAILED: { variant: 'destructive', icon: WifiOff, color: 'text-red-600' },
      DISCONNECTED: { variant: 'outline', icon: WifiOff, color: 'text-gray-600' },
    };
    
    const config = variants[connectionStatus] || variants.PENDING;
    const Icon = config.icon;
    
    return (
      <div className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        <span className="text-xs text-muted-foreground">{connectionStatus}</span>
      </div>
    );
  };
  
  const pendingCount = hospitals.filter(h => h.status === 'PENDING').length;
  const activeCount = hospitals.filter(h => h.status === 'ACTIVE').length;
  
  return (
    <AppLayout title="Hospital Management">
      <div className="space-y-6">
        {/* Header Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hospitals</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hospitals.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingCount}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCount}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connected APIs</CardTitle>
              <Wifi className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {hospitals.filter(h => h.connection_status === 'CONNECTED').length}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Hospital Registrations</CardTitle>
            <CardDescription>Manage and approve hospital registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Search by name, code, license, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="w-full sm:w-48">
                <Label htmlFor="status">Status Filter</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <Button onClick={loadHospitals} variant="outline" disabled={isLoading}>
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
                      <TableHead>Code</TableHead>
                      <TableHead>License</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>API Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHospitals.map((hospital) => (
                      <TableRow key={hospital.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{hospital.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {hospital.city}, {hospital.state}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{hospital.code}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{hospital.license_number}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{hospital.email}</div>
                            <div className="text-muted-foreground">{hospital.phone}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(hospital.status)}</TableCell>
                        <TableCell>{getConnectionBadge(hospital.connection_status)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(hospital.created_at).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {hospital.status === 'PENDING' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => {
                                    setSelectedHospital(hospital);
                                    setApproveDialog(true);
                                  }}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setSelectedHospital(hospital);
                                    setRejectDialog(true);
                                  }}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleVerifyAPI(hospital)}
                              disabled={verifyingId === hospital.id}
                            >
                              {verifyingId === hospital.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Wifi className="h-3 w-3" />
                              )}
                            </Button>
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
        
        {/* Approve Dialog */}
        <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Hospital Registration</DialogTitle>
              <DialogDescription>
                Are you sure you want to approve this hospital registration?
              </DialogDescription>
            </DialogHeader>
            
            {selectedHospital && (
              <div className="space-y-2 py-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Hospital Name:</div>
                  <div className="font-medium">{selectedHospital.name}</div>
                  
                  <div className="text-muted-foreground">License Number:</div>
                  <div className="font-medium">{selectedHospital.license_number}</div>
                  
                  <div className="text-muted-foreground">Hospital Code:</div>
                  <div className="font-mono">{selectedHospital.code}</div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setApproveDialog(false);
                  setSelectedHospital(null);
                }}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleApprove} disabled={actionLoading}>
                {actionLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve Hospital
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Reject Dialog */}
        <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Hospital Registration</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this hospital registration.
              </DialogDescription>
            </DialogHeader>
            
            {selectedHospital && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Hospital Name:</div>
                  <div className="font-medium">{selectedHospital.name}</div>
                  
                  <div className="text-muted-foreground">License Number:</div>
                  <div className="font-medium">{selectedHospital.license_number}</div>
                </div>
                
                <div>
                  <Label htmlFor="reason">Reason for Rejection</Label>
                  <Textarea
                    id="reason"
                    placeholder="Enter the reason for rejection..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectDialog(false);
                  setSelectedHospital(null);
                  setRejectReason('');
                }}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject Hospital
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default HospitalManagement;
