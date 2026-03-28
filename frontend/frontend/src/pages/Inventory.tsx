import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { catalogApi, inventoryApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface InventoryRow {
  id: string;
  catalogItemId: string;
  resourceName: string;
  category: string;
  quantityAvailable: number;
  reservedQuantity: number;
  availableStock: number;
  unitPrice: number | null;
  lastUpdated: string;
}

const mapInventory = (item: unknown): InventoryRow => {
  const quantityAvailable = Number(item.quantity_available ?? 0);
  const reservedQuantity = Number(item.quantity_reserved ?? 0);
  return {
    id: String(item.id || ''),
    catalogItemId: String(item.catalog_item || item.catalog_item_id || ''),
    resourceName: item.catalog_item_name || item.name || 'Resource',
    category: item.resource_type_name || item.category || 'General',
    quantityAvailable,
    reservedQuantity,
    availableStock: quantityAvailable - reservedQuantity,
    unitPrice: Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : null,
    lastUpdated: String(item.updated_at || item.last_updated || ''),
  };
};

const Inventory = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [restockById, setRestockById] = useState<Record<string, string>>({});
  const [priceById, setPriceById] = useState<Record<string, string>>({});

  const inventoryQuery = useQuery({
    queryKey: ['inventory-list'],
    queryFn: async () => {
      const res: unknown = await inventoryApi.getAll();
      const raw = res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
      return (Array.isArray(raw) ? raw : []).map(mapInventory);
    },
  });

  const restockMutation = useMutation({
    mutationFn: async ({ id, quantityDelta }: { id: string; quantityDelta: number }) => {
      return inventoryApi.adjust(id, {
        quantity_delta: quantityDelta,
        transaction_type: 'restock',
        notes: 'Restocked via inventory dashboard',
      });
    },
    onSuccess: () => {
      toast({ title: 'Inventory restocked' });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    },
    onError: (error: unknown) => {
      toast({ title: 'Restock failed', description: error?.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const priceMutation = useMutation({
    mutationFn: async ({ catalogItemId, price }: { catalogItemId: string; price: number }) => {
      return catalogApi.update(catalogItemId, {
        unit_price: price,
        price_per_unit: price,
      });
    },
    onSuccess: () => {
      toast({ title: 'Price updated' });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    },
    onError: (error: unknown) => {
      toast({ title: 'Price update failed', description: error?.message || 'Please verify catalog permissions.', variant: 'destructive' });
    },
  });

  const filtered = useMemo(() => {
    const items = inventoryQuery.data || [];
    
    let result = items;
    
    // Filter by category
    if (categoryFilter !== 'all') {
      result = result.filter((item) => item.category === categoryFilter);
    }
    
    // Filter by search
    if (search.trim()) {
      result = result.filter((item) =>
        item.resourceName.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return result;
  }, [inventoryQuery.data, search, categoryFilter]);

  // Extract unique categories from inventory
  const categories = useMemo(() => {
    const items = inventoryQuery.data || [];
    const uniqueCategories = Array.from(new Set(items.map((item) => item.category))).sort();
    return uniqueCategories;
  }, [inventoryQuery.data]);

  return (
    <AppLayout title="Inventory" subtitle="Manage available, reserved, price, and restock actions">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Inventory Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1">
                <Input
                  placeholder="Search resources"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full"
                />
              </div>
              <div className="w-full sm:w-48">
                <Label htmlFor="category-filter" className="text-xs mb-1 block">Filter by Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger id="category-filter" className="w-full">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {inventoryQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading inventory...
              </div>
            ) : inventoryQuery.isError ? (
              <div className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Failed to load inventory.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quantity Available</TableHead>
                    <TableHead>Reserved Quantity</TableHead>
                    <TableHead>Available Stock</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">No inventory items found.</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.resourceName}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>{item.quantityAvailable}</TableCell>
                        <TableCell>{item.reservedQuantity}</TableCell>
                        <TableCell>
                          <Badge variant={item.availableStock > 0 ? 'default' : 'destructive'}>{item.availableStock}</Badge>
                        </TableCell>
                        <TableCell>{item.unitPrice === null ? '-' : item.unitPrice.toLocaleString()}</TableCell>
                        <TableCell className="min-w-80 space-y-3">
                          <div className="space-y-1">
                            <Label htmlFor={`price-${item.id}`} className="text-xs">Update price</Label>
                            <div className="flex gap-2">
                              <Input
                                id={`price-${item.id}`}
                                type="number"
                                min={0}
                                placeholder="Unit price"
                                value={priceById[item.id] ?? ''}
                                onChange={(event) => setPriceById((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (!item.catalogItemId) {
                                    toast({ title: 'Catalog item missing', variant: 'destructive' });
                                    return;
                                  }
                                  const parsedPrice = Number(priceById[item.id]);
                                  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
                                    toast({ title: 'Enter a valid price', variant: 'destructive' });
                                    return;
                                  }
                                  priceMutation.mutate({ catalogItemId: item.catalogItemId, price: parsedPrice });
                                }}
                                disabled={priceMutation.isPending}
                              >
                                Update
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor={`restock-${item.id}`} className="text-xs">Restock quantity</Label>
                            <div className="flex gap-2">
                              <Input
                                id={`restock-${item.id}`}
                                type="number"
                                min={1}
                                placeholder="Quantity to add"
                                value={restockById[item.id] ?? ''}
                                onChange={(event) => setRestockById((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  const parsedQty = Number(restockById[item.id]);
                                  if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
                                    toast({ title: 'Enter a valid restock quantity', variant: 'destructive' });
                                    return;
                                  }
                                  restockMutation.mutate({ id: item.id, quantityDelta: parsedQty });
                                }}
                                disabled={restockMutation.isPending}
                              >
                                Restock
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Inventory;
