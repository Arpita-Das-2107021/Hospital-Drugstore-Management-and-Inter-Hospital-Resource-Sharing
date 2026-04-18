import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { salesApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SaleDetailView {
  id: string;
  facility: string;
  facilityName: string;
  resourceCatalog: string;
  resourceName: string;
  eventDate: string;
  quantitySold: number;
  unit: string;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string;
  channel: string;
  clientReference: string;
  notes: string;
  soldBy: string;
  soldByEmail: string;
  createdAt: string;
  updatedAt: string;
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const asNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDetail = (payload: unknown): SaleDetailView => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const node = Object.keys(data).length > 0 ? data : root;

  return {
    id: asString(node.id),
    facility: asString(node.facility),
    facilityName: asString(node.facility_name),
    resourceCatalog: asString(node.resource_catalog),
    resourceName:
      asString(node.resource_name) ||
      asString(node.medicine_name) ||
      asString(node.resource_catalog_name),
    eventDate: asString(node.event_date),
    quantitySold: Number(node.quantity_sold ?? 0),
    unit: asString(node.unit),
    unitPrice: asNumberOrNull(node.unit_price),
    totalAmount: asNumberOrNull(node.total_amount),
    currency: asString(node.currency) || 'BDT',
    channel: asString(node.channel),
    clientReference: asString(node.client_reference),
    notes: asString(node.notes),
    soldBy: asString(node.sold_by),
    soldByEmail: asString(node.sold_by_email),
    createdAt: asString(node.created_at),
    updatedAt: asString(node.updated_at),
  };
};

const toDateTime = (value: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const toCurrency = (value: number | null, currency: string): string => {
  if (value === null || !Number.isFinite(value)) return '-';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'BDT',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || ''} ${value.toFixed(2)}`.trim();
  }
};

const DetailField = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium break-words">{value || '-'}</p>
  </div>
);

const SaleDetail = () => {
  const { saleId } = useParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<SaleDetailView | null>(null);

  useEffect(() => {
    const loadDetail = async () => {
      if (!saleId) {
        setSale(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await salesApi.getById(saleId);
        setSale(normalizeDetail(response));
      } catch (error: unknown) {
        setSale(null);
        toast({
          title: 'Failed to load sales detail',
          description: error instanceof Error ? error.message : 'Unable to fetch the selected sale.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [saleId, toast]);

  const statusLabel = useMemo(() => {
    if (!sale) return 'Unknown';
    if (!sale.updatedAt) return 'Recorded';
    return sale.updatedAt === sale.createdAt ? 'Recorded' : 'Updated';
  }, [sale]);

  return (
    <AppLayout
      title="Sales Detail"
      // subtitle="Read-only view of a single internal sale record"
    >
      <div className="space-y-6">
        <div>
          <Button variant="outline" asChild>
            <Link to="/sales">Back to Sales</Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sale Record {sale?.id ? `#${sale.id}` : ''}</CardTitle>
            <Badge variant="outline">{statusLabel}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading sale detail...
              </div>
            ) : !sale ? (
              <p className="py-8 text-center text-muted-foreground">Sale record not found.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="Facility" value={sale.facilityName || sale.facility} />
                <DetailField label="Resource" value={sale.resourceName || '-'} />
                <DetailField label="Resource Catalog ID" value={sale.resourceCatalog} />
                <DetailField label="Event Date" value={toDateTime(sale.eventDate)} />
                <DetailField
                  label="Quantity Sold"
                  value={`${sale.quantitySold}${sale.unit ? ` ${sale.unit}` : ''}`}
                />
                <DetailField label="Unit Price" value={toCurrency(sale.unitPrice, sale.currency)} />
                <DetailField label="Total Amount" value={toCurrency(sale.totalAmount, sale.currency)} />
                <DetailField label="Currency" value={sale.currency || '-'} />
                <DetailField label="Channel" value={sale.channel || '-'} />
                <DetailField label="Client Reference" value={sale.clientReference || '-'} />
                <DetailField label="Created By" value={sale.soldByEmail || sale.soldBy || '-'} />
                <DetailField label="Created At" value={toDateTime(sale.createdAt)} />
                <DetailField label="Updated At" value={toDateTime(sale.updatedAt)} />
                <div className="sm:col-span-2 lg:col-span-3 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{sale.notes || '-'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default SaleDetail;
