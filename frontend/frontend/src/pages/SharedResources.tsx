import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { catalogApi, requestsApi, resourceSharesApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { type ResourceWithVisibility } from '@/types/healthcare';
import { ResourceCard } from '@/components/ResourceCard';
import { ResourceRequestForm } from '@/components/ResourceRequestForm';

interface ShareRow {
  id: string;
  hospitalId: string;
  hospitalName: string;
  catalogItemId: string;
  resourceName: string;
  resourceType: 'drugs' | 'blood' | 'organs' | 'equipment';
  resourceTypeName: string;
  quantityOffered: number;
  pricePerUnit: number | null;
  validUntil: string | null;
  status: string;
  notes: string;
  updatedAt: string;
}

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeType = (value: unknown): ShareRow['resourceType'] => {
  const normalized = String(value || '').toLowerCase();
  if (['drug', 'drugs', 'medication', 'medicine'].includes(normalized)) return 'drugs';
  if (['blood', 'blood_product', 'blood-products'].includes(normalized)) return 'blood';
  if (['organ', 'organs'].includes(normalized)) return 'organs';
  return 'equipment';
};

const mapShare = (item: unknown): ShareRow => ({
  id: String(item.id || ''),
  hospitalId: String(item.hospital || item.hospital_id || ''),
  hospitalName: String(item.hospital_name || item.offering_hospital_name || item.hospital_display_name || ''),
  catalogItemId: String(item.catalog_item || item.catalog_item_id || ''),
  resourceName: item.catalog_item_name || item.resource_name || item.product_name || 'Resource',
  resourceType: normalizeType(item.resource_type || item.catalog_item_type || item.type),
  resourceTypeName: item.resource_type_name || item.catalog_item_resource_type_name || 'General',
  quantityOffered: Number(item.quantity_offered ?? 0),
  pricePerUnit: normalizeNumber(item.price_snapshot ?? item.price_per_unit ?? item.unit_price),
  validUntil: item.valid_until || null,
  status: String(item.status || 'active'),
  notes: String(item.notes || ''),
  updatedAt: String(item.updated_at || item.created_at || ''),
});

const toCardResource = (share: ShareRow): ResourceWithVisibility => {
  const availability = share.quantityOffered > 5 ? 'available' : share.quantityOffered > 0 ? 'limited' : 'unavailable';
  return {
    id: share.id,
    name: share.resourceName,
    type: share.resourceType,
    hospital: share.hospitalName || 'Partner hospital',
    quantity: share.quantityOffered,
    availability,
    isEmergency: false,
    region: '',
    lastUpdated: share.updatedAt || new Date().toISOString(),
    isVisibleToOthers: true,
    requestCount: 0,
    description: share.notes || undefined,
    hospitalId: share.hospitalId,
    catalogItemId: share.catalogItemId,
  };
};

const SharedResources = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'discover' | 'manage'>('discover');
  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'drugs' | 'blood' | 'organs' | 'equipment'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedResource, setSelectedResource] = useState<ResourceWithVisibility | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [newShare, setNewShare] = useState({
    catalog_item: '',
    quantity_offered: '1',
    valid_until: '',
    notes: '',
  });
  const [editState, setEditState] = useState<Record<string, { quantity_offered: string; valid_until: string; status: string }>>({});

  const sharesQuery = useQuery({
    queryKey: ['shared-resources-list'],
    queryFn: async () => {
      const res: unknown = await resourceSharesApi.getAll();
      const raw = res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
      return (Array.isArray(raw) ? raw : []).map(mapShare);
    },
  });

  const catalogQuery = useQuery({
    queryKey: ['catalog-for-share'],
    queryFn: async () => {
      const res: unknown = await catalogApi.getAll();
      return res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
    },
  });

  const incomingRequestsQuery = useQuery({
    queryKey: ['incoming-request-count-for-share'],
    queryFn: async () => {
      const res: unknown = await requestsApi.getAll();
      return res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
    },
  });

  const myShares = useMemo(() => {
    const hospitalId = user?.hospital_id || '';
    return (sharesQuery.data || []).filter((item) => !hospitalId || item.hospitalId === hospitalId);
  }, [sharesQuery.data, user?.hospital_id]);

  const discoverableShares = useMemo(() => {
    const myHospitalId = user?.hospital_id || '';
    return (sharesQuery.data || []).filter((item) => {
      const status = item.status.toLowerCase();
      if (status !== 'active' || item.quantityOffered <= 0) return false;
      if (myHospitalId && item.hospitalId === myHospitalId) return false;
      if (hospitalFilter !== 'all' && item.hospitalId !== hospitalFilter) return false;
      if (typeFilter !== 'all' && item.resourceType !== typeFilter) return false;
      if (categoryFilter !== 'all' && item.resourceTypeName !== categoryFilter) return false;

      if (!item.validUntil) return true;
      return new Date(item.validUntil).getTime() > Date.now();
    });
  }, [sharesQuery.data, user?.hospital_id, hospitalFilter, typeFilter, categoryFilter]);

  const discoverResources = useMemo(
    () => discoverableShares.map(toCardResource),
    [discoverableShares]
  );

  const hospitalsForFilter = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of sharesQuery.data || []) {
      if (item.hospitalId) {
        map.set(item.hospitalId, item.hospitalName || item.hospitalId);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sharesQuery.data]);

  const categoriesForFilter = useMemo(() => {
    const items = sharesQuery.data || [];
    const uniqueCategories = Array.from(new Set(items.map((item) => item.resourceTypeName))).sort();
    return uniqueCategories;
  }, [sharesQuery.data]);

  const pendingIncomingCount = useMemo(() => {
    const hospitalId = user?.hospital_id || '';
    const rows = Array.isArray(incomingRequestsQuery.data) ? incomingRequestsQuery.data : [];
    return rows.filter((item: unknown) => {
      const status = String(item.status || '').toLowerCase();
      const supplier = String(item.supplying_hospital || item.supplying_hospital_id || '');
      return status === 'pending' && (!hospitalId || supplier === hospitalId);
    }).length;
  }, [incomingRequestsQuery.data, user?.hospital_id]);

  const createShareMutation = useMutation({
    mutationFn: async () => {
      return resourceSharesApi.create({
        catalog_item: newShare.catalog_item,
        quantity_offered: Number(newShare.quantity_offered),
        valid_until: newShare.valid_until || null,
        notes: newShare.notes,
      });
    },
    onSuccess: () => {
      toast({ title: 'Share offer created' });
      setNewShare({ catalog_item: '', quantity_offered: '1', valid_until: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['shared-resources-list'] });
    },
    onError: (error: unknown) => {
      toast({ title: 'Failed to create share', description: error?.message || 'Please verify quantity and visibility rules.', variant: 'destructive' });
    },
  });

  const updateShareMutation = useMutation({
    mutationFn: async ({ shareId, payload }: { shareId: string; payload: unknown }) => {
      return resourceSharesApi.update(shareId, payload);
    },
    onSuccess: () => {
      toast({ title: 'Share offer updated' });
      queryClient.invalidateQueries({ queryKey: ['shared-resources-list'] });
    },
    onError: (error: unknown) => {
      toast({ title: 'Update failed', description: error?.message || 'Please try again.', variant: 'destructive' });
    },
  });

  return (
    <AppLayout title="Shared Resources" subtitle="Discover partner offers and manage your hospital's share inventory">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'discover' | 'manage')}>
          <TabsList>
            <TabsTrigger value="discover">Discover Resources</TabsTrigger>
            <TabsTrigger value="manage">Manage Shared Offers</TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Available from Partner Hospitals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Hospitals" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hospitals</SelectItem>
                      {hospitalsForFilter.map((hospital) => (
                        <SelectItem key={hospital.id} value={hospital.id}>{hospital.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="drugs">Drugs</SelectItem>
                      <SelectItem value="blood">Blood</SelectItem>
                      <SelectItem value="organs">Organs</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categoriesForFilter.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <Button asChild className="w-full" variant="outline">
                      <Link to="/sharing/requests">View My Requests</Link>
                    </Button>
                  </div>
                </div>

                {sharesQuery.isLoading ? (
                  <div className="flex items-center py-8"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading shared resources...</div>
                ) : sharesQuery.isError ? (
                  <div className="text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Failed to load shares.</div>
                ) : discoverResources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active shared resources match your filters.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {discoverResources.map((resource) => (
                      <ResourceCard
                        key={resource.id}
                        resource={resource}
                        onRequest={(value) => {
                          setSelectedResource(value);
                          setRequestModalOpen(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create Share Offer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="catalog-item">Catalog item</Label>
                    <Select
                      value={newShare.catalog_item}
                      onValueChange={(value) => setNewShare((prev) => ({ ...prev, catalog_item: value }))}
                    >
                      <SelectTrigger id="catalog-item">
                        <SelectValue placeholder="Select catalog item" />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalogQuery.data || []).map((item: unknown) => (
                          <SelectItem key={String(item.id)} value={String(item.id)}>
                            {item.name || item.display_name || item.catalog_item_name || item.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Available catalog items: {(catalogQuery.data || []).length}</p>
                  </div>
                  <div>
                    <Label htmlFor="share-quantity">Quantity offered</Label>
                    <Input
                      id="share-quantity"
                      type="number"
                      min={1}
                      value={newShare.quantity_offered}
                      onChange={(event) => setNewShare((prev) => ({ ...prev, quantity_offered: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="valid-until">Valid until</Label>
                    <Input
                      id="valid-until"
                      type="datetime-local"
                      value={newShare.valid_until}
                      onChange={(event) => setNewShare((prev) => ({ ...prev, valid_until: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="share-notes">Notes</Label>
                    <Textarea
                      id="share-notes"
                      rows={2}
                      value={newShare.notes}
                      onChange={(event) => setNewShare((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => createShareMutation.mutate()}
                    disabled={createShareMutation.isPending || !newShare.catalog_item || Number(newShare.quantity_offered) <= 0}
                  >
                    Create offer
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/sharing/requests">
                      Request Workflow
                      {pendingIncomingCount > 0 ? <Badge className="ml-2" variant="secondary">{pendingIncomingCount}</Badge> : null}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My Shared Resources</CardTitle>
              </CardHeader>
              <CardContent>
                {sharesQuery.isLoading ? (
                  <div className="flex items-center py-8"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading shared resources...</div>
                ) : sharesQuery.isError ? (
                  <div className="text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Failed to load shares.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resource name</TableHead>
                        <TableHead>Quantity offered</TableHead>
                        <TableHead>Price per unit</TableHead>
                        <TableHead>Valid until</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myShares.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">No shared resources found.</TableCell>
                        </TableRow>
                      ) : (
                        myShares.map((share) => {
                          const editValue = editState[share.id] || {
                            quantity_offered: String(share.quantityOffered),
                            valid_until: share.validUntil ? new Date(share.validUntil).toISOString().slice(0, 16) : '',
                            status: share.status,
                          };

                          return (
                            <TableRow key={share.id}>
                              <TableCell className="font-medium">{share.resourceName}</TableCell>
                              <TableCell>{share.quantityOffered}</TableCell>
                              <TableCell>{share.pricePerUnit === null ? '-' : share.pricePerUnit.toLocaleString()}</TableCell>
                              <TableCell>{share.validUntil ? new Date(share.validUntil).toLocaleString() : '-'}</TableCell>
                              <TableCell><Badge variant="outline">{share.status}</Badge></TableCell>
                              <TableCell className="space-y-2 min-w-80">
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="Quantity"
                                  value={editValue.quantity_offered}
                                  onChange={(event) => setEditState((prev) => ({
                                    ...prev,
                                    [share.id]: { ...editValue, quantity_offered: event.target.value },
                                  }))}
                                />
                                <Input
                                  type="datetime-local"
                                  value={editValue.valid_until}
                                  onChange={(event) => setEditState((prev) => ({
                                    ...prev,
                                    [share.id]: { ...editValue, valid_until: event.target.value },
                                  }))}
                                />
                                <Input
                                  placeholder="Status (active, closed, ... )"
                                  value={editValue.status}
                                  onChange={(event) => setEditState((prev) => ({
                                    ...prev,
                                    [share.id]: { ...editValue, status: event.target.value },
                                  }))}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => updateShareMutation.mutate({
                                    shareId: share.id,
                                    payload: {
                                      quantity_offered: Number(editValue.quantity_offered),
                                      valid_until: editValue.valid_until || null,
                                      status: editValue.status,
                                    },
                                  })}
                                  disabled={updateShareMutation.isPending}
                                >
                                  Save
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ResourceRequestForm
          resource={selectedResource}
          isOpen={requestModalOpen}
          onClose={() => {
            setRequestModalOpen(false);
            setSelectedResource(null);
          }}
          onSubmitted={() => {
            queryClient.invalidateQueries({ queryKey: ['incoming-request-count-for-share'] });
          }}
        />
      </div>
    </AppLayout>
  );
};

export default SharedResources;