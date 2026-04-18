import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronsUpDown, Loader2, Plus, RefreshCw } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { hospitalsApi, salesApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { hasAnyPermission } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface SaleRow {
  id: string;
  eventDate: string;
  resourceName: string;
  quantitySold: number;
  unit: string;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string;
  channel: string;
  soldBy: string;
  soldByEmail: string;
}

interface HospitalOption {
  id: string;
  name: string;
}

interface SaleFormState {
  hospital_id: string;
  medicine_option_id: string;
  quantity_sold: string;
  event_date: string;
  unit_price: string;
  total_amount: string;
  currency: string;
  channel: string;
  client_reference: string;
  notes: string;
}

interface SaleFormErrors {
  medicine_option_id?: string;
  quantity_sold?: string;
  event_date?: string;
  channel?: string;
}

interface MedicineOption {
  id: string;
  resourceName: string;
  stock: number | null;
  unit: string;
}

type SalesChannelValue = 'walk_in' | 'prescription' | 'online' | 'other';

const PAGE_SIZE = 25;

const CHANNEL_OPTIONS: Array<{ label: string; value: SalesChannelValue }> = [
  { label: 'Counter', value: 'walk_in' },
  { label: 'Prescription', value: 'prescription' },
  { label: 'Online', value: 'online' },
  { label: 'Other', value: 'other' },
];

const emptyForm: SaleFormState = {
  hospital_id: '',
  medicine_option_id: '',
  quantity_sold: '',
  event_date: '',
  unit_price: '',
  total_amount: '',
  currency: 'BDT',
  channel: '',
  client_reference: '',
  notes: '',
};

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

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractList = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  const candidates = [root.results, data.results, root.data, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

const extractTotalCount = (payload: unknown, fallback: number): number => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const meta = asRecord(root.meta);
  const nestedMeta = asRecord(data.meta);

  const candidate =
    root.count ??
    data.count ??
    root.total ??
    data.total ??
    meta.total ??
    meta.total_count ??
    nestedMeta.total ??
    nestedMeta.total_count;

  const parsed = Number(candidate);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
};

const mapSaleRow = (item: unknown): SaleRow => {
  const row = asRecord(item);
  return {
    id: asString(row.id),
    eventDate: asString(row.event_date),
    resourceName:
      asString(row.resource_name) ||
      asString(row.medicine_name) ||
      asString(row.resource_catalog_name) ||
      'Unknown resource',
    quantitySold: asNumber(row.quantity_sold),
    unit: asString(row.unit),
    unitPrice: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price),
    totalAmount: row.total_amount === null || row.total_amount === undefined ? null : Number(row.total_amount),
    currency: asString(row.currency) || 'BDT',
    channel: asString(row.channel),
    soldBy: asString(row.sold_by),
    soldByEmail: asString(row.sold_by_email),
  };
};

const mapSalesResourceOption = (item: unknown): MedicineOption | null => {
  const row = asRecord(item);
  const id = asString(row.id);
  const resourceName = asString(row.resource_name);

  if (!id || !resourceName) {
    return null;
  }

  const stockValue = row.available_stock;
  const stock = stockValue === null || stockValue === undefined || stockValue === ''
    ? null
    : Number(stockValue);

  return {
    id,
    resourceName,
    stock: Number.isFinite(stock) ? stock : null,
    unit: asString(row.unit),
  };
};

const formatMedicineOptionLabel = (option: MedicineOption): string => {
  if (option.stock !== null) {
    return `${option.resourceName} (Stock: ${option.stock})`;
  }
  return option.resourceName;
};

const toMessageList = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(toMessageList);
  }

  if (value && typeof value === 'object') {
    const row = asRecord(value);
    const direct = [row.message, row.detail].flatMap(toMessageList);
    if (direct.length > 0) {
      return direct;
    }

    return Object.values(row).flatMap(toMessageList);
  }

  return [];
};

const pickFirstFieldMessage = (
  candidates: Array<Record<string, unknown>>,
  keys: string[]
): string | undefined => {
  for (const candidate of candidates) {
    for (const key of keys) {
      if (!(key in candidate)) continue;
      const messages = toMessageList(candidate[key]);
      if (messages.length > 0) {
        return messages[0];
      }
    }
  }

  return undefined;
};

const extractCreateError = (error: unknown): { fieldErrors: SaleFormErrors; message: string | undefined } => {
  const errorRecord = asRecord(error);
  const payload = asRecord(errorRecord.payload);
  const payloadError = asRecord(payload.error);
  const payloadData = asRecord(payload.data);
  const candidates = [payload, payloadError, payloadData];

  const fieldErrors: SaleFormErrors = {
    medicine_option_id: pickFirstFieldMessage(candidates, ['resource_catalog_id', 'medicine_option_id', 'medicine']),
    quantity_sold: pickFirstFieldMessage(candidates, ['quantity_sold']),
    event_date: pickFirstFieldMessage(candidates, ['event_date']),
    channel: pickFirstFieldMessage(candidates, ['channel']),
  };

  Object.keys(fieldErrors).forEach((key) => {
    const typedKey = key as keyof SaleFormErrors;
    if (!fieldErrors[typedKey]) {
      delete fieldErrors[typedKey];
    }
  });

  const messageCandidates = [
    ...toMessageList(payload.non_field_errors),
    ...toMessageList(payloadError.non_field_errors),
    ...toMessageList(payload.message),
    ...toMessageList(payload.detail),
    ...toMessageList(payloadError.message),
    ...toMessageList(payloadError.detail),
    ...toMessageList(payloadData.message),
    ...toMessageList(payloadData.detail),
  ];

  if (messageCandidates.length > 0) {
    return {
      fieldErrors,
      message: messageCandidates[0],
    };
  }

  const firstFieldMessage = Object.values(fieldErrors).find((value) => typeof value === 'string' && value.trim());
  if (firstFieldMessage) {
    return {
      fieldErrors,
      message: firstFieldMessage,
    };
  }

  if (error instanceof Error && error.message) {
    return {
      fieldErrors,
      message: error.message,
    };
  }

  return {
    fieldErrors,
    message: undefined,
  };
};

const toDisplayDate = (value: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
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

const Sales = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [records, setRecords] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('all');

  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [formState, setFormState] = useState<SaleFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<SaleFormErrors>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [medicineOptions, setMedicineOptions] = useState<MedicineOption[]>([]);
  const [medicineLoading, setMedicineLoading] = useState(false);
  const [medicineDropdownOpen, setMedicineDropdownOpen] = useState(false);
  const [medicineQuery, setMedicineQuery] = useState('');

  const canManageAcrossHospitals = hasAnyPermission(user, ['platform:hospital.view', 'platform:hospital.manage']);

  const loadSales = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(PAGE_SIZE),
      };

      if (canManageAcrossHospitals && hospitalFilter !== 'all') {
        params.hospital_id = hospitalFilter;
      }

      const response = await salesApi.getAll(params);
      const rows = extractList(response).map(mapSaleRow);
      setRecords(rows);
      setTotalCount(extractTotalCount(response, rows.length));
    } catch (error: unknown) {
      toast({
        title: 'Failed to load sales records',
        description: error instanceof Error ? error.message : 'Unable to fetch sales records.',
        variant: 'destructive',
      });
      setRecords([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [canManageAcrossHospitals, hospitalFilter, page, toast]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!canManageAcrossHospitals) return;

    const loadHospitals = async () => {
      try {
        const response = await hospitalsApi.getAll({ limit: '200' });
        const options = extractList(response)
          .map((item) => {
            const row = asRecord(item);
            const id = asString(row.id || row.hospital_id);
            const name = asString(row.name || row.hospital_name || row.facility_name);
            if (!id || !name) return null;
            return { id, name };
          })
          .filter((item): item is HospitalOption => item !== null);

        setHospitals(options);
      } catch {
        setHospitals([]);
      }
    };

    loadHospitals();
  }, [canManageAcrossHospitals]);

  const loadMedicineOptions = useCallback(async () => {
    try {
      setMedicineLoading(true);
      const response = await salesApi.getResources();
      const mapped = extractList(response)
        .map(mapSalesResourceOption)
        .filter((item): item is MedicineOption => item !== null);

      // Keep one option per catalog id; inventory records can include repeats in some environments.
      const deduped = new Map<string, MedicineOption>();
      mapped.forEach((option) => {
        if (!deduped.has(option.id)) {
          deduped.set(option.id, option);
        }
      });

      const sorted = Array.from(deduped.values()).sort((a, b) => a.resourceName.localeCompare(b.resourceName));
      setMedicineOptions(sorted);
    } catch (error: unknown) {
      setMedicineOptions([]);
      toast({
        title: 'Failed to load medicine options',
        description: error instanceof Error ? error.message : 'Unable to fetch medicine options.',
        variant: 'destructive',
      });
    } finally {
      setMedicineLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!dialogOpen) return;
    loadMedicineOptions();
  }, [dialogOpen, loadMedicineOptions]);

  const hasClientFilters = Boolean(search.trim() || dateFrom || dateTo);

  const filteredRecords = useMemo(() => {
    const searchLower = search.trim().toLowerCase();

    return records.filter((record) => {
      if (searchLower && !record.resourceName.toLowerCase().includes(searchLower)) {
        return false;
      }

      const eventDate = record.eventDate ? record.eventDate.slice(0, 10) : '';
      if (dateFrom && eventDate && eventDate < dateFrom) {
        return false;
      }
      if (dateTo && eventDate && eventDate > dateTo) {
        return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, records, search]);

  const totalPages = useMemo(() => {
    if (hasClientFilters) return 1;
    if (totalCount <= 0) return 1;
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  }, [hasClientFilters, totalCount]);

  const updateFormField = (field: keyof SaleFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    if (field === 'medicine_option_id' || field === 'quantity_sold' || field === 'event_date' || field === 'channel') {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const resetForm = () => {
    setFormState(emptyForm);
    setFormErrors({});
    setMedicineQuery('');
    setMedicineDropdownOpen(false);
  };

  const selectedMedicineOption = useMemo(
    () => medicineOptions.find((option) => option.id === formState.medicine_option_id) || null,
    [formState.medicine_option_id, medicineOptions]
  );

  const filteredMedicineOptions = useMemo(() => {
    if (!medicineQuery.trim()) return medicineOptions;
    const lower = medicineQuery.trim().toLowerCase();
    return medicineOptions.filter((option) => {
      const stockText = option.stock === null ? '' : String(option.stock);
      return (
        option.resourceName.toLowerCase().includes(lower) ||
        option.unit.toLowerCase().includes(lower) ||
        stockText.includes(lower)
      );
    });
  }, [medicineOptions, medicineQuery]);

  const validateForm = (): { ok: boolean; parsedQuantity: number } => {
    const errors: SaleFormErrors = {};
    const parsedQuantity = Number(formState.quantity_sold);

    if (!formState.medicine_option_id) {
      errors.medicine_option_id = 'Medicine is required.';
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      errors.quantity_sold = 'Quantity sold must be greater than 0.';
    }

    if (!formState.event_date) {
      errors.event_date = 'Event date is required.';
    }

    if (!formState.channel.trim()) {
      errors.channel = 'Channel is required.';
    }

    setFormErrors(errors);
    return {
      ok: Object.keys(errors).length === 0,
      parsedQuantity: Number.isFinite(parsedQuantity) ? parsedQuantity : 0,
    };
  };

  const handleCreateSale = async () => {
    const validation = validateForm();
    if (!validation.ok) {
      return;
    }

    const payload: Record<string, unknown> = {
      quantity_sold: validation.parsedQuantity,
      resource_catalog_id: formState.medicine_option_id,
      event_date: formState.event_date,
      channel: formState.channel.trim(),
      currency: formState.currency.trim() || 'BDT',
    };

    if (canManageAcrossHospitals && formState.hospital_id.trim()) {
      payload.hospital_id = formState.hospital_id.trim();
    }

    if (formState.client_reference.trim()) {
      payload.client_reference = formState.client_reference.trim();
    }

    if (formState.notes.trim()) {
      payload.notes = formState.notes.trim();
    }

    const unitPrice = Number(formState.unit_price);
    if (Number.isFinite(unitPrice) && formState.unit_price.trim()) {
      payload.unit_price = unitPrice;
    }

    const totalAmount = Number(formState.total_amount);
    if (Number.isFinite(totalAmount) && formState.total_amount.trim()) {
      payload.total_amount = totalAmount;
    }

    try {
      setCreating(true);
      const response = await salesApi.create(payload);
      const root = asRecord(response.data);
      const data = asRecord(root.data);
      const node = Object.keys(data).length > 0 ? data : root;
      const idempotent = Boolean(node.idempotent ?? root.idempotent ?? false);

      if (response.status === 200 && idempotent) {
        toast({ title: 'Existing sale reused (idempotent)' });
      } else {
        toast({ title: 'Sale recorded' });
      }

      setDialogOpen(false);
      resetForm();
      if (page !== 1) {
        setPage(1);
      } else {
        loadSales();
      }
    } catch (error: unknown) {
      const parsedError = extractCreateError(error);
      if (Object.keys(parsedError.fieldErrors).length > 0) {
        setFormErrors((prev) => ({ ...prev, ...parsedError.fieldErrors }));
      }

      toast({
        title: 'Failed to record sale',
        description: parsedError.message || 'Unable to create sales record.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout
      title="Internal Sales"
      // subtitle="Track medicine and resource sales for your hospital"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sales Records</CardTitle>
            <CardDescription>Search, filter, and record internal sales transactions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="sales-search">Medicine/Resource Search</Label>
                <Input
                  id="sales-search"
                  placeholder="Search by medicine or resource name"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from">Date From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-to">Date To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                />
              </div>

              {canManageAcrossHospitals ? (
                <div className="space-y-2">
                  <Label>Hospital</Label>
                  <Select
                    value={hospitalFilter}
                    onValueChange={(value) => {
                      setHospitalFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All hospitals" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All hospitals</SelectItem>
                      {hospitals.map((hospital) => (
                        <SelectItem key={hospital.id} value={hospital.id}>
                          {hospital.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={loadSales} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Record Sale
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Sales Record</DialogTitle>
                    <DialogDescription>
                      Record a new internal sale using your hospital inventory context.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 md:grid-cols-2">
                    {canManageAcrossHospitals ? (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Hospital (optional)</Label>
                        <Select
                          value={formState.hospital_id || 'none'}
                          onValueChange={(value) => updateFormField('hospital_id', value === 'none' ? '' : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Use authenticated hospital context" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Use authenticated hospital context</SelectItem>
                            {hospitals.map((hospital) => (
                              <SelectItem key={hospital.id} value={hospital.id}>
                                {hospital.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="medicine-selector">Medicine Name *</Label>
                      <Popover open={medicineDropdownOpen} onOpenChange={setMedicineDropdownOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            id="medicine-selector"
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={medicineDropdownOpen}
                            className={cn(
                              'w-full justify-between font-normal',
                              !selectedMedicineOption && 'text-muted-foreground',
                              formErrors.medicine_option_id && 'border-destructive'
                            )}
                          >
                            {selectedMedicineOption
                              ? formatMedicineOptionLabel(selectedMedicineOption)
                              : medicineLoading
                                ? 'Loading medicine options...'
                                : 'Search and select medicine'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search medicine..."
                              value={medicineQuery}
                              onValueChange={setMedicineQuery}
                            />
                            <CommandList>
                              {medicineLoading ? (
                                <div className="p-3 text-sm text-muted-foreground">Loading medicine options...</div>
                              ) : (
                                <>
                                  <CommandEmpty>No medicine found.</CommandEmpty>
                                  <CommandGroup>
                                    {filteredMedicineOptions.map((option) => (
                                      <CommandItem
                                        key={option.id}
                                        value={`${option.resourceName} ${option.unit} ${option.stock ?? ''}`}
                                        onSelect={() => {
                                          updateFormField('medicine_option_id', option.id);
                                          setMedicineQuery('');
                                          setMedicineDropdownOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4 shrink-0',
                                            formState.medicine_option_id === option.id ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        <span>{formatMedicineOptionLabel(option)}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {formErrors.medicine_option_id ? (
                        <p className="text-sm text-destructive">{formErrors.medicine_option_id}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quantity_sold">Quantity Sold *</Label>
                      <Input
                        id="quantity_sold"
                        type="number"
                        min="1"
                        step="1"
                        value={formState.quantity_sold}
                        onChange={(event) => updateFormField('quantity_sold', event.target.value)}
                      />
                      {formErrors.quantity_sold ? (
                        <p className="text-sm text-destructive">{formErrors.quantity_sold}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="event_date">Event Date *</Label>
                      <Input
                        id="event_date"
                        type="date"
                        value={formState.event_date}
                        onChange={(event) => updateFormField('event_date', event.target.value)}
                      />
                        {formErrors.event_date ? (
                          <p className="text-sm text-destructive">{formErrors.event_date}</p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="unit_price">Unit Price (optional)</Label>
                      <Input
                        id="unit_price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.unit_price}
                        onChange={(event) => updateFormField('unit_price', event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="total_amount">Total Amount (optional)</Label>
                      <Input
                        id="total_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.total_amount}
                        onChange={(event) => updateFormField('total_amount', event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="channel">Channel *</Label>
                      <Select value={formState.channel} onValueChange={(value) => updateFormField('channel', value)}>
                        <SelectTrigger id="channel" className={cn(formErrors.channel && 'border-destructive')}>
                          <SelectValue placeholder="Select channel" />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formErrors.channel ? (
                        <p className="text-sm text-destructive">{formErrors.channel}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="client_reference">Client Reference (optional)</Label>
                      <Input
                        id="client_reference"
                        value={formState.client_reference}
                        onChange={(event) => updateFormField('client_reference', event.target.value)}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Textarea
                        id="notes"
                        value={formState.notes}
                        onChange={(event) => updateFormField('notes', event.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateSale} disabled={creating}>
                      {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save Sale
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Medicine/Resource</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="flex items-center justify-center py-6 text-muted-foreground">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading sales records...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        No sales records found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{toDisplayDate(record.eventDate)}</TableCell>
                        <TableCell>
                          <Link to={`/sales/${record.id}`} className="font-medium text-primary hover:underline">
                            {record.resourceName}
                          </Link>
                        </TableCell>
                        <TableCell>{record.quantitySold} {record.unit || ''}</TableCell>
                        <TableCell>{toCurrency(record.unitPrice, record.currency)}</TableCell>
                        <TableCell>{toCurrency(record.totalAmount, record.currency)}</TableCell>
                        <TableCell>{record.channel || '-'}</TableCell>
                        <TableCell>{record.soldByEmail || record.soldBy || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {hasClientFilters
                  ? `Showing ${filteredRecords.length} of ${records.length} loaded records`
                  : `Showing ${records.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount}`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={hasClientFilters || page <= 1 || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={hasClientFilters || loading || page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Sales;
