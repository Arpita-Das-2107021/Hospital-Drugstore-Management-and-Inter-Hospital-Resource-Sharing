import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { inventoryService, type InventoryItem } from '@/services/inventoryService';
import {
  salesService,
  type CreateRetailSalePayload,
  type RetailSale,
} from '@/services/salesService';

const INVENTORY_QUERY_KEY = ['retail-inventory'];
const SALES_HISTORY_QUERY_KEY = ['retail-sales-history'];

const toCurrency = (value: number | null): string => {
  if (value === null) {
    return '-';
  }

  return `৳${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const SalesCreatePage = () => {
  const { canAny } = usePermission();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const canCreateSale = canAny(['sale.create', 'sale.manage', 'sales.manage', 'hospital:sales.manage']);

  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [customerReference, setCustomerReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lastSale, setLastSale] = useState<RetailSale | null>(null);

  const inventoryQuery = useQuery({
    queryKey: INVENTORY_QUERY_KEY,
    queryFn: () => inventoryService.list(),
    enabled: canCreateSale,
  });

  const inventoryItems = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);

  useEffect(() => {
    const inventoryFromQuery = searchParams.get('inventory') || '';
    if (!inventoryFromQuery) {
      return;
    }

    const isPresent = inventoryItems.some((item) => item.id === inventoryFromQuery);
    if (isPresent) {
      setInventoryId(inventoryFromQuery);
    }
  }, [inventoryItems, searchParams]);

  const selectedInventory = useMemo(() => {
    return inventoryItems.find((item) => item.id === inventoryId) || null;
  }, [inventoryId, inventoryItems]);

  const createSaleMutation = useMutation({
    mutationFn: (payload: CreateRetailSalePayload) => salesService.create(payload),
    onSuccess: async (createdSale) => {
      setLastSale(createdSale);
      setQuantity('1');
      setCustomerReference('');
      setNotes('');

      toast({
        title: 'Sale completed',
        description: `Final total: ${toCurrency(createdSale.final_total)}`,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: SALES_HISTORY_QUERY_KEY }),
      ]);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Sale failed',
        description: error instanceof Error ? error.message : 'Could not create sale.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inventoryId) {
      toast({
        title: 'Inventory is required',
        variant: 'destructive',
      });
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast({
        title: 'Quantity must be greater than 0',
        variant: 'destructive',
      });
      return;
    }

    createSaleMutation.mutate({
      inventory_id: inventoryId,
      quantity: parsedQuantity,
      customer_reference: customerReference.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  if (!canCreateSale) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppLayout title="Create Retail Sale">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Quick Sale</CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading inventory list...
              </div>
            ) : inventoryQuery.isError ? (
              <div className="rounded border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                Failed to load inventory list.
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="inventory-id">Inventory Item</Label>
                  <Select value={inventoryId} onValueChange={setInventoryId}>
                    <SelectTrigger id="inventory-id">
                      <SelectValue placeholder="Select inventory item" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map((item: InventoryItem) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.catalog_item_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedInventory ? (
                    <p className="text-xs text-muted-foreground">
                      Available: {selectedInventory.quantity_free} | Price Snapshot Base: {toCurrency(selectedInventory.price_per_unit)}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-reference">Customer Reference (Optional)</Label>
                  <Input
                    id="customer-reference"
                    value={customerReference}
                    onChange={(event) => setCustomerReference(event.target.value)}
                    placeholder="Invoice or customer code"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional notes"
                  />
                </div>

                <Button type="submit" disabled={createSaleMutation.isPending}>
                  {createSaleMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating sale...
                    </>
                  ) : (
                    'Create Sale'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {lastSale ? (
          <Card>
            <CardHeader>
              <CardTitle>Backend Sale Response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Unit Selling Price Snapshot: <span className="font-medium">{toCurrency(lastSale.unit_selling_price_snapshot)}</span>
              </p>
              <p>
                Discount Amount: <span className="font-medium">{toCurrency(lastSale.discount_amount)}</span>
              </p>
              <p>
                Final Total: <span className="font-medium">{toCurrency(lastSale.final_total)}</span>
              </p>
              <div className="flex gap-2 pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/sales/history">View Sale History</Link>
                </Button>
                {lastSale.id ? (
                  <Button asChild size="sm">
                    <Link to={`/sales/${lastSale.id}`}>Open Sale Detail</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
};

export default SalesCreatePage;
