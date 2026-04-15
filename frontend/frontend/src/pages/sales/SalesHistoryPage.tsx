import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';
import { salesService } from '@/services/salesService';

const SALES_HISTORY_QUERY_KEY = ['retail-sales-history'];

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

const SalesHistoryPage = () => {
  const { canAny } = usePermission();

  const canViewHistory = canAny(['sale.history.view', 'hospital:sales.view']);
  const canCreateSale = canAny(['sale.create', 'sale.manage', 'sales.manage', 'hospital:sales.manage']);

  const historyQuery = useQuery({
    queryKey: SALES_HISTORY_QUERY_KEY,
    queryFn: () => salesService.list(),
    enabled: canViewHistory,
  });

  if (!canViewHistory) {
    return <Navigate to="/dashboard" replace />;
  }

  const history = historyQuery.data || [];

  return (
    <AppLayout title="Retail Sales History">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Retail Sales</CardTitle>
            <div className="flex gap-2">
              {canCreateSale ? (
                <Button asChild size="sm">
                  <Link to="/sales/create">Create Sale</Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => historyQuery.refetch()}
                disabled={historyQuery.isFetching}
              >
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {historyQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading sale history...
              </div>
            ) : historyQuery.isError ? (
              <div className="rounded border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                Failed to load sale history.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sold At</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Discount Amount</TableHead>
                    <TableHead>Final Total</TableHead>
                    <TableHead>Customer Reference</TableHead>
                    <TableHead className="text-right">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No sales found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{toDateTime(sale.sold_at)}</TableCell>
                        <TableCell>{sale.quantity}</TableCell>
                        <TableCell>{toCurrency(sale.discount_amount)}</TableCell>
                        <TableCell>{toCurrency(sale.final_total)}</TableCell>
                        <TableCell>{sale.customer_reference || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/sales/${sale.id}`}>View</Link>
                          </Button>
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

export default SalesHistoryPage;
