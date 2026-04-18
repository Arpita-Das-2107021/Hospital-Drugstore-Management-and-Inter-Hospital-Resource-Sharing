import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermission } from '@/hooks/usePermission';
import { salesService } from '@/services/salesService';

const toDateTime = (value: string): string => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const toCurrency = (value: number | null): string => {
  if (value === null) {
    return '-';
  }

  return `৳${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const SaleDetailPage = () => {
  const { canAny } = usePermission();
  const { id } = useParams<{ id: string }>();

  const canViewHistory = canAny(['sale.history.view', 'hospital:sales.view']);

  const detailQuery = useQuery({
    queryKey: ['retail-sale', id],
    queryFn: () => salesService.getById(id || ''),
    enabled: canViewHistory && Boolean(id),
  });

  if (!canViewHistory) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!id) {
    return <Navigate to="/sales/history" replace />;
  }

  const sale = detailQuery.data;

  return (
    <AppLayout title="Sale Detail">
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/sales/history">Back to History</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Retail Sale #{sale?.id || id}</CardTitle>
          </CardHeader>
          <CardContent>
            {detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading sale detail...
              </div>
            ) : detailQuery.isError || !sale ? (
              <div className="rounded border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                Failed to load sale detail.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Sold At</p>
                  <p className="text-sm font-medium">{toDateTime(sale.sold_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Inventory</p>
                  <p className="text-sm font-medium">{sale.inventory_name || sale.inventory || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-sm font-medium">{sale.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer Reference</p>
                  <p className="text-sm font-medium">{sale.customer_reference || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit Selling Price Snapshot</p>
                  <p className="text-sm font-medium">{toCurrency(sale.unit_selling_price_snapshot)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discount Amount</p>
                  <p className="text-sm font-medium">{toCurrency(sale.discount_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final Total</p>
                  <p className="text-sm font-medium">{toCurrency(sale.final_total)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm font-medium whitespace-pre-wrap">{sale.notes || '-'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default SaleDetailPage;
