import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inventoryApi } from '@/services/api';
import { useState, useEffect } from 'react';
import { Search, Eye, EyeOff, AlertTriangle, CheckCircle, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

type VisibilityItem = {
  id: string;
  inventoryId: string;
  catalogItemId: string;
  name: string;
  type: 'drugs' | 'blood' | 'organs' | 'equipment';
  totalQuantity: number;
  sharedQuantity: number;
  shareRecordId?: string;
};

const normalizeType = (value: string): VisibilityItem['type'] => {
  const v = (value || '').toLowerCase();
  if (['drug', 'drugs', 'medication', 'medicine'].includes(v)) return 'drugs';
  if (['blood', 'blood_product', 'blood-products'].includes(v)) return 'blood';
  if (['organ', 'organs'].includes(v)) return 'organs';
  return 'equipment';
};

const extractList = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.results)) return res.results;
  return [];
};

const mapVisibilityItem = (item: any): VisibilityItem => {
  const totalQty = Number(
    item.total_quantity ??
      item.quantity_available ??
      item.total_inventory ??
      item.quantity ??
      0
  );

  const sharedQty = Number(
    item.shared_quantity ??
      item.quantity_shared ??
      item.quantity_offered ??
      0
  );

  const inventoryId = String(item.inventory_id || item.id || '');
  const catalogItemId = String(item.catalog_item || item.catalog_item_id || item.catalog_item_uuid || '');
  const resolvedName =
    item.product_name ||
    item.catalog_item_name ||
    item.resource_name ||
    item.name ||
    item.catalog_item_details?.name ||
    item.catalog_item_obj?.name ||
    'Unknown item';

  return {
    id: String(item.id || inventoryId || catalogItemId || crypto.randomUUID()),
    inventoryId,
    catalogItemId,
    name: String(resolvedName),
    type: normalizeType(item.resource_type || item.catalog_item_type || item.type || ''),
    totalQuantity: Number.isFinite(totalQty) ? totalQty : 0,
    sharedQuantity: Number.isFinite(sharedQty) ? sharedQty : 0,
    shareRecordId: item.share_record_id || item.resource_share_id || item.share_id,
  };
};

const ResourceVisibility = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = (user?.role || '').toUpperCase();
  const canAccess = role === 'HOSPITAL_ADMIN';
  const [items, setItems] = useState<VisibilityItem[]>([]);
  const [draftSharedQty, setDraftSharedQty] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');

  // API only allows HOSPITAL_ADMIN for inventory share visibility.
  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const loadVisibility = async () => {
    try {
      setLoading(true);
      const res = await inventoryApi.getShareVisibility();
      const raw = extractList(res);
      const mapped = raw.map(mapVisibilityItem);
      setItems(mapped);

      const drafts: Record<string, string> = {};
      mapped.forEach((entry) => {
        drafts[entry.id] = String(entry.sharedQuantity);
      });
      setDraftSharedQty(drafts);
    } catch (err: any) {
      toast({
        title: 'Failed to load visibility data',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
      setItems([]);
      setDraftSharedQty({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisibility();
  }, []);

  const filtered = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = type === 'all' || item.type === type;
    return matchesSearch && matchesType;
  });

  const visibleCount = items.filter((i) => i.sharedQuantity > 0).length;
  const hiddenCount = items.filter((i) => i.sharedQuantity <= 0).length;

  const saveSharedQuantity = async (item: VisibilityItem) => {
    const rawValue = draftSharedQty[item.id] ?? String(item.sharedQuantity);
    const sharedQuantity = Math.max(0, Number(rawValue));

    if (!Number.isFinite(sharedQuantity)) {
      toast({ title: 'Invalid quantity', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    if (sharedQuantity > item.totalQuantity) {
      toast({
        title: 'Quantity exceeds inventory',
        description: `Shared quantity cannot exceed total inventory (${item.totalQuantity}).`,
        variant: 'destructive',
      });
      return;
    }

    setSavingIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const response = await inventoryApi.updateShareVisibility({
        inventory_id: item.inventoryId,
        catalog_item: item.catalogItemId,
        shared_quantity: sharedQuantity,
        share_record_id: item.shareRecordId,
      });

      const updatedPayload = response?.data || response;
      const mappedUpdated = mapVisibilityItem({
        ...item,
        ...updatedPayload,
        shared_quantity: updatedPayload?.shared_quantity ?? sharedQuantity,
      });

      setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, ...mappedUpdated } : entry)));
      setDraftSharedQty((prev) => ({ ...prev, [item.id]: String(sharedQuantity) }));

      toast({
        title: 'Share quantity updated',
        description: `${item.name} shared quantity set to ${sharedQuantity}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Failed to update share quantity',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleBulkSet = async (value: number) => {
    const targets = filtered.map((item) => ({
      ...item,
      targetValue: Math.max(0, Math.min(value, item.totalQuantity)),
    }));

    const results = await Promise.allSettled(
      targets.map((entry) =>
        inventoryApi.updateShareVisibility({
          inventory_id: entry.inventoryId,
          catalog_item: entry.catalogItemId,
          shared_quantity: entry.targetValue,
          share_record_id: entry.shareRecordId,
        })
      )
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast({
        title: 'Partial update',
        description: `${failed} items failed to update.`,
        variant: 'destructive',
      });
    }

    await loadVisibility();
  };

  return (
    <AppLayout title="Resource Visibility" subtitle="Control which resources are shared with other hospitals">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" /><span className="ml-2">Loading resources...</span>
        </div>
      ) : (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{visibleCount}</p>
                  <p className="text-sm text-muted-foreground">Visible Resources</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hiddenCount}</p>
                  <p className="text-sm text-muted-foreground">Hidden Resources</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{items.length}</p>
                  <p className="text-sm text-muted-foreground">Total Resources</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="border-info/20 bg-info/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-info mt-0.5" />
              <div>
                <h4 className="font-medium">Visibility Control</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Resources marked as <strong>visible</strong> can be requested by other hospitals. 
                  Hidden resources are only available for internal use at your hospital.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search resources..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="pl-9" 
              />
            </div>
            <Tabs value={type} onValueChange={setType}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="drugs">Drugs</TabsTrigger>
                <TabsTrigger value="blood">Blood</TabsTrigger>
                <TabsTrigger value="organs">Organs</TabsTrigger>
                <TabsTrigger value="equipment">Equipment</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkSet(1)}>
              <Eye className="mr-2 h-4 w-4" />
              Show All
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkSet(0)}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide All
            </Button>
          </div>
        </div>

        {/* Visibility Editor Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Product</th>
                    <th className="px-4 py-3 text-left font-medium">Total Inventory</th>
                    <th className="px-4 py-3 text-left font-medium">Shared Quantity</th>
                    <th className="px-4 py-3 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 last:border-b-0">
                      <td className="px-4 py-3">{item.name}</td>
                      <td className="px-4 py-3">{item.totalQuantity}</td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          max={item.totalQuantity}
                          value={draftSharedQty[item.id] ?? String(item.sharedQuantity)}
                          onChange={(e) => {
                            setDraftSharedQty((prev) => ({ ...prev, [item.id]: e.target.value }));
                          }}
                          className="w-36"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          onClick={() => saveSharedQuantity(item)}
                          disabled={!!savingIds[item.id]}
                        >
                          {savingIds[item.id] ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Save
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <EyeOff className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No resources found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
      )}
    </AppLayout>
  );
};

export default ResourceVisibility;