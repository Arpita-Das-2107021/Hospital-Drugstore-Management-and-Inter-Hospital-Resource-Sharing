import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, ChevronLeft, ChevronRight, FileDown, Loader2, Printer, RefreshCw } from 'lucide-react';
import {
  analyticsApi,
  auditApi,
  hospitalRegistrationApi,
  hospitalUpdateRequestsApi,
  hospitalsApi,
  inventoryApi,
  offboardingApi,
  requestsApi,
  salesApi,
  shipmentsApi,
} from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasAnyPermission } from '@/lib/rbac';
import { resolveUserContext } from '@/lib/accessResolver';

type ReportType =
  | 'inventory'
  | 'shipments'
  | 'incoming_requests'
  | 'outgoing_requests'
  | 'payments'
  | 'sales'
  | 'hospital_registrations'
  | 'hospital_directory'
  | 'hospital_update_requests'
  | 'offboarding_requests'
  | 'analytics'
  | 'role_audit_log';

type TimeWindow = 'today' | 'week' | 'month' | 'year' | 'custom';
type SortField = 'none' | 'date' | 'amount';
type SortDirection = 'asc' | 'desc';
type ReportRow = Record<string, string | number | null>;

interface PaymentReportSummary {
  total_sent: number;
  total_received: number;
  currency: string;
  pending: number;
  failed: number;
}

const DATE_FIELD_CANDIDATES = [
  'date_time',
  'timestamp',
  'created_at',
  'updated_at',
  'submitted_at',
  'sold_at',
  'reviewed_at',
  'captured_at',
  'date',
];

const AMOUNT_FIELD_CANDIDATES = [
  'amount',
  'total_amount',
  'total_price',
  'unit_price',
  'value',
  'total_value',
  'total_sent',
  'total_received',
  'credits',
  'balance',
];

const LIST_FIELD_CANDIDATES = ['results', 'items', 'transactions', 'payments', 'entries', 'records'];
const PAGE_SIZE = 15;

const REPORT_COLUMN_ORDER: Partial<Record<ReportType, string[]>> = {
  inventory: ['name', 'category', 'available', 'reorder_level', 'total_value', 'updated_at'],
  shipments: ['shipment', 'from', 'to', 'status', 'updated_at'],
  incoming_requests: ['id', 'resource', 'quantity', 'status', 'priority', 'requester', 'supplier', 'created_at'],
  outgoing_requests: ['id', 'resource', 'quantity', 'status', 'priority', 'requester', 'supplier', 'created_at'],
  payments: ['transaction_id', 'request_id', 'amount', 'currency', 'status', 'date_time', 'payer', 'payee', 'gateway'],
  sales: ['id', 'medicine', 'quantity', 'unit_price', 'total_price', 'sold_by', 'sold_at'],
  hospital_registrations: ['hospital_name', 'registration_number', 'status', 'inventory_source_type', 'data_submission_type', 'submitted_at'],
  hospital_directory: ['hospital_name', 'registration_number', 'city', 'state', 'verified_status', 'account_status', 'created_at'],
  hospital_update_requests: ['hospital_name', 'requested_by', 'status', 'created_at', 'reviewed_at'],
  offboarding_requests: ['hospital_name', 'requested_by', 'status', 'reason', 'created_at'],
  analytics: [
    'healthcare_registered_count',
    'healthcare_pending_count',
    'staff_system_count',
    'ml_count',
    'healthcare_admin_count',
    'others_count',
    'healthcare_verified_count',
    'healthcare_pending_verification_count',
    'pending_registration_requests_count',
    'total_users_count',
    'active_users_count',
    'inactive_users_count',
    'pending_staff_invitations_count',
    'generated_at',
  ],
  role_audit_log: ['timestamp', 'actor', 'action', 'target', 'target_id', 'details'],
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
};

const toDisplayString = (value: unknown): string => {
  if (value == null) return '-';
  if (typeof value === 'string') return value.trim() ? value : '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length === 0 ? '-' : `${value.length} item${value.length > 1 ? 's' : ''}`;
  if (value && typeof value === 'object') {
    const summary = Object.entries(asRecord(value))
      .slice(0, 3)
      .map(([key, itemValue]) => `${key}: ${String(itemValue)}`)
      .join(' | ');
    return summary || '-';
  }
  return String(value);
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumber = (value: unknown): number => {
  return toFiniteNumber(value) ?? 0;
};

const parseDateValue = (value: unknown): Date | null => {
  if (value == null) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number') {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateValue = (value: unknown): string => {
  const parsed = parseDateValue(value);
  if (!parsed) return toDisplayString(value);
  return parsed.toLocaleString();
};

const formatColumnLabel = (column: string): string =>
  column
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());

const isDateColumn = (column: string): boolean => /(date|time|timestamp|_at)$/i.test(column);
const isAmountColumn = (column: string): boolean => /(amount|price|value|total|balance|credits|sent|received|quantity|count)/i.test(column);

const summarizeAuditDetails = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) return `${value.length} item${value.length > 1 ? 's' : ''}`;

  const details = Object.entries(asRecord(value ?? {}))
    .slice(0, 4)
    .map(([key, item]) => `${formatColumnLabel(key)}: ${toDisplayString(item)}`)
    .join(' | ');

  return details || '-';
};

const extractRows = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  const rootData = root.data;

  if (Array.isArray(rootData)) return rootData;

  const nestedData = asRecord(rootData);
  for (const key of LIST_FIELD_CANDIDATES) {
    if (Array.isArray(nestedData[key])) {
      return nestedData[key] as unknown[];
    }
  }

  for (const key of LIST_FIELD_CANDIDATES) {
    if (Array.isArray(root[key])) {
      return root[key] as unknown[];
    }
  }

  return Array.isArray(payload) ? payload : [];
};

const resolveRowDate = (row: ReportRow): Date | null => {
  for (const field of DATE_FIELD_CANDIDATES) {
    const parsed = parseDateValue(row[field]);
    if (parsed) return parsed;
  }

  for (const [column, value] of Object.entries(row)) {
    if (!isDateColumn(column)) continue;
    const parsed = parseDateValue(value);
    if (parsed) return parsed;
  }

  return null;
};

const resolveRowAmount = (row: ReportRow): number | null => {
  for (const field of AMOUNT_FIELD_CANDIDATES) {
    const parsed = toFiniteNumber(row[field]);
    if (parsed != null) return parsed;
  }

  for (const [column, value] of Object.entries(row)) {
    if (!isAmountColumn(column)) continue;
    const parsed = toFiniteNumber(value);
    if (parsed != null) return parsed;
  }

  return null;
};

const getTimeWindowBounds = (
  timeWindow: TimeWindow,
  customStartDate: string,
  customEndDate: string,
): { start: Date | null; end: Date | null } => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (timeWindow === 'today') {
    return { start, end: now };
  }

  if (timeWindow === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    return { start, end: now };
  }

  if (timeWindow === 'month') {
    start.setDate(1);
    return { start, end: now };
  }

  if (timeWindow === 'year') {
    start.setMonth(0, 1);
    return { start, end: now };
  }

  if (timeWindow === 'custom') {
    const startDate = customStartDate ? new Date(customStartDate) : null;
    const endDate = customEndDate ? new Date(customEndDate) : null;

    if (startDate && !Number.isNaN(startDate.getTime())) {
      startDate.setHours(0, 0, 0, 0);
    }

    if (endDate && !Number.isNaN(endDate.getTime())) {
      endDate.setHours(23, 59, 59, 999);
    }

    return {
      start: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      end: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
    };
  }

  return { start: null, end: null };
};

const normalizePaymentReport = (payload: unknown): PaymentReportSummary => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  return {
    total_sent: toNumber(data.total_sent ?? data.sent_total ?? root.total_sent ?? 0),
    total_received: toNumber(data.total_received ?? data.received_total ?? root.total_received ?? 0),
    currency: String(data.currency ?? root.currency ?? 'BDT'),
    pending: toNumber(data.pending ?? root.pending ?? 0),
    failed: toNumber(data.failed ?? root.failed ?? 0),
  };
};
const buildPaymentRows = (payload: unknown, summary: PaymentReportSummary): ReportRow[] => {
  const records = extractRows(payload);
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const defaultCurrency = String(data.currency ?? root.currency ?? summary.currency ?? 'BDT');

  const transactionRows = (Array.isArray(records) ? records : []).map((entry) => {
    const item = asRecord(entry);
    const amount = toNumber(
      item.amount
        ?? item.total_amount
        ?? item.payment_amount
        ?? item.paid_amount
        ?? item.value
        ?? 0,
    );

    return {
      transaction_id: String(
        item.transaction_id
          ?? item.txn_id
          ?? item.payment_id
          ?? item.provider_transaction_id
          ?? item.gateway_transaction_id
          ?? item.id
          ?? '-',
      ),
      request_id: String(item.request_id ?? item.request ?? item.resource_request_id ?? '-'),
      amount,
      currency: String(item.currency ?? defaultCurrency),
      status: String(item.status ?? item.payment_status ?? item.transaction_status ?? '-'),
      date_time: String(item.created_at ?? item.updated_at ?? item.paid_at ?? item.timestamp ?? item.date ?? '-'),
      payer: String(item.payer ?? item.payer_name ?? item.requesting_hospital_name ?? item.from_hospital_name ?? '-'),
      payee: String(item.payee ?? item.payee_name ?? item.supplying_hospital_name ?? item.to_hospital_name ?? '-'),
      gateway: String(item.gateway ?? item.provider ?? item.payment_gateway ?? '-'),
    };
  });

  if (transactionRows.length > 0) {
    return transactionRows;
  }

  const snapshotTime = new Date().toISOString();
  return [
    {
      transaction_id: 'summary-total-sent',
      request_id: '-',
      amount: summary.total_sent,
      currency: summary.currency,
      status: 'TOTAL_SENT',
      date_time: snapshotTime,
      payer: '-',
      payee: '-',
      gateway: '-',
    },
    {
      transaction_id: 'summary-total-received',
      request_id: '-',
      amount: summary.total_received,
      currency: summary.currency,
      status: 'TOTAL_RECEIVED',
      date_time: snapshotTime,
      payer: '-',
      payee: '-',
      gateway: '-',
    },
    {
      transaction_id: 'summary-pending',
      request_id: '-',
      amount: summary.pending,
      currency: summary.currency,
      status: 'PENDING_COUNT',
      date_time: snapshotTime,
      payer: '-',
      payee: '-',
      gateway: '-',
    },
    {
      transaction_id: 'summary-failed',
      request_id: '-',
      amount: summary.failed,
      currency: summary.currency,
      status: 'FAILED_COUNT',
      date_time: snapshotTime,
      payer: '-',
      payee: '-',
      gateway: '-',
    },
  ];
};

const collectColumns = (rows: ReportRow[], reportType: ReportType): string[] => {
  if (rows.length === 0) return [];

  const discovered = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => discovered.add(key));
  });

  const preferred = REPORT_COLUMN_ORDER[reportType] ?? [];
  const ordered = preferred.filter((key) => discovered.has(key));

  discovered.forEach((key) => {
    if (!ordered.includes(key)) ordered.push(key);
  });

  return ordered;
};

const Reports = () => {
  const { user } = useAuth();
  const accessContext = resolveUserContext(user);
  const isPlatformContext = accessContext === 'PLATFORM';
  const canViewRoleAuditReport = isPlatformContext && hasAnyPermission(user, ['platform:audit.view']);
  const canViewPlatformAnalyticsReport = isPlatformContext && hasAnyPermission(user, ['reports:analytics.view', 'platform:audit.view']);
  const canViewHospitalRegistrationsReport = hasAnyPermission(user, ['platform:hospital.review']);
  const canViewHospitalDirectoryReport = hasAnyPermission(user, ['platform:hospital.view', 'platform:hospital.manage']);
  const canViewHospitalUpdateRequestsReport = hasAnyPermission(user, ['platform:hospital.review']);
  const canViewOffboardingRequestsReport = hasAnyPermission(user, ['platform:hospital.review']);

  const availableReports: { value: ReportType; label: string }[] = useMemo(() => {
    if (isPlatformContext) {
      const platformReports: { value: ReportType; label: string }[] = [];

      if (canViewHospitalRegistrationsReport) {
        platformReports.push({ value: 'hospital_registrations', label: 'Hospital Registrations Report' });
      }
      if (canViewHospitalDirectoryReport) {
        platformReports.push({ value: 'hospital_directory', label: 'Hospital Directory Report' });
      }
      if (canViewHospitalUpdateRequestsReport) {
        platformReports.push({ value: 'hospital_update_requests', label: 'Hospital Update Requests Report' });
      }
      if (canViewOffboardingRequestsReport) {
        platformReports.push({ value: 'offboarding_requests', label: 'Offboarding Requests Report' });
      }
      if (canViewRoleAuditReport) {
        platformReports.push({ value: 'role_audit_log', label: 'Role Audit Log' });
      }
      if (canViewPlatformAnalyticsReport) {
        platformReports.push({ value: 'analytics', label: 'Platform Analytics Report' });
      }

      return platformReports;
    }

    const healthcareReports: { value: ReportType; label: string }[] = [
      { value: 'inventory', label: 'Inventory Report' },
      { value: 'shipments', label: 'Transport Report' },
      { value: 'incoming_requests', label: 'Incoming Requests Report' },
      { value: 'outgoing_requests', label: 'Outgoing Requests Report' },
      { value: 'payments', label: 'Payments Report' },
      { value: 'sales', label: 'Sales Report' },
    ];

    return healthcareReports;
  }, [
    canViewHospitalDirectoryReport,
    canViewHospitalRegistrationsReport,
    canViewHospitalUpdateRequestsReport,
    canViewOffboardingRequestsReport,
    canViewPlatformAnalyticsReport,
    canViewRoleAuditReport,
    isPlatformContext,
  ]);

  const [reportType, setReportType] = useState<ReportType>(() => availableReports[0]?.value ?? 'inventory');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentReportSummary | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPaymentSummary(null);

      if (!availableReports.some((report) => report.value === reportType)) {
        setRows([]);
        return;
      }

      let nextRows: ReportRow[] = [];

      if (reportType === 'inventory') {
        const res = await inventoryApi.getAll();
        const raw = extractRows(res);
        nextRows = (Array.isArray(raw) ? raw : []).map((item) => {
          const row = asRecord(item);
          return {
            name: String(row.catalog_item_name ?? row.name ?? row.resource_name ?? 'Unknown'),
            category: String(row.resource_type_name ?? row.category ?? 'General'),
            available: toNumber(row.quantity_available ?? row.available_quantity ?? 0),
            reorder_level: toNumber(row.reorder_level ?? 0),
            total_value: toNumber(row.total_value ?? (toNumber(row.quantity_available ?? 0) * toNumber(row.unit_price ?? 0))),
            updated_at: String(row.updated_at ?? row.created_at ?? '-'),
          };
        });
      }

      if (reportType === 'shipments') {
        const res = await shipmentsApi.getAll();
        const raw = extractRows(res);
        nextRows = (Array.isArray(raw) ? raw : []).map((shipment) => {
          const row = asRecord(shipment);
          return {
            shipment: String(row.shipment_number ?? row.id ?? '-'),
            from: String(row.origin_hospital_name ?? row.from_hospital_name ?? '-'),
            to: String(row.destination_hospital_name ?? row.to_hospital_name ?? '-'),
            status: String(row.status ?? '-'),
            updated_at: String(row.updated_at ?? row.created_at ?? '-'),
          };
        });
      }

      if (reportType === 'incoming_requests' || reportType === 'outgoing_requests') {
        const res = await requestsApi.getAll();
        const raw = extractRows(res);
        const hospitalId = user?.hospital_id || '';

        const filtered = (Array.isArray(raw) ? raw : []).filter((request) => {
          if (!hospitalId) return true;
          const item = asRecord(request);
          const supplyingHospital = String(item.supplying_hospital ?? item.supplying_hospital_id ?? '');
          const requestingHospital = String(item.requesting_hospital ?? item.requesting_hospital_id ?? item.hospital_id ?? '');

          if (reportType === 'incoming_requests') {
            return supplyingHospital === hospitalId;
          }
          return requestingHospital === hospitalId;
        });

        nextRows = filtered.map((request) => {
          const row = asRecord(request);
          return {
            id: String(row.id ?? '-'),
            resource: String(row.catalog_item_name ?? row.resource_name ?? '-'),
            quantity: toNumber(row.quantity_requested ?? row.quantity ?? 0),
            status: String(row.status ?? '-'),
            priority: String(row.priority ?? 'normal'),
            requester: String(row.requesting_hospital_name ?? '-'),
            supplier: String(row.supplying_hospital_name ?? '-'),
            created_at: String(row.created_at ?? '-'),
          };
        });
      }

      if (reportType === 'payments') {
        const res = await requestsApi.getPaymentsReport();
        const summary = normalizePaymentReport(res);
        setPaymentSummary(summary);
        nextRows = buildPaymentRows(res, summary);
      }

      if (reportType === 'hospital_registrations') {
        const res = await hospitalRegistrationApi.listAdminRegistrations();
        const registrations = extractRows(res);
        nextRows = (Array.isArray(registrations) ? registrations : []).map((registration) => {
          const item = asRecord(registration);
          return {
            hospital_name: String(item.name ?? item.hospital_name ?? '-'),
            registration_number: String(item.registration_number ?? '-'),
            status: String(item.status ?? 'pending'),
            inventory_source_type: String(item.inventory_source_type ?? '-'),
            data_submission_type: String(item.data_submission_type ?? '-'),
            submitted_at: String(item.submitted_at ?? item.created_at ?? '-'),
          };
        });
      }

      if (reportType === 'hospital_directory') {
        const res = await hospitalsApi.getAll();
        const hospitals = extractRows(res);
        nextRows = (Array.isArray(hospitals) ? hospitals : []).map((hospital) => {
          const item = asRecord(hospital);
          const isActive = item.is_active === false ? 'inactive' : 'active';
          return {
            hospital_name: String(item.name ?? item.hospital_name ?? '-'),
            registration_number: String(item.registration_number ?? '-'),
            city: String(item.city ?? '-'),
            state: String(item.state ?? '-'),
            verified_status: String(item.verified_status ?? '-'),
            account_status: isActive,
            created_at: String(item.created_at ?? '-'),
          };
        });
      }

      if (reportType === 'hospital_update_requests') {
        const res = await hospitalUpdateRequestsApi.getAll();
        const updateRequests = extractRows(res);
        nextRows = (Array.isArray(updateRequests) ? updateRequests : []).map((request) => {
          const item = asRecord(request);
          const requestedBy = asRecord(item.requested_by);
          const hospital = asRecord(item.hospital);
          return {
            hospital_name: String(item.hospital_name ?? hospital.name ?? '-'),
            requested_by: String(item.requested_by_name ?? requestedBy.full_name ?? '-'),
            status: String(item.status ?? '-'),
            created_at: String(item.created_at ?? '-'),
            reviewed_at: String(item.reviewed_at ?? '-'),
          };
        });
      }

      if (reportType === 'offboarding_requests') {
        const res = await offboardingApi.listAdminRequests();
        const offboardingRequests = extractRows(res);
        nextRows = (Array.isArray(offboardingRequests) ? offboardingRequests : []).map((request) => {
          const item = asRecord(request);
          const requestedBy = asRecord(item.requested_by);
          const hospital = asRecord(item.hospital);
          return {
            hospital_name: String(item.hospital_name ?? hospital.name ?? '-'),
            requested_by: String(item.requested_by_name ?? requestedBy.full_name ?? '-'),
            status: String(item.status ?? '-'),
            reason: String(item.reason ?? '-'),
            created_at: String(item.created_at ?? item.requested_at ?? '-'),
          };
        });
      }

      if (reportType === 'sales') {
        try {
          const res = await salesApi.getAll();
          const raw = extractRows(res);
          nextRows = (Array.isArray(raw) ? raw : []).map((sale) => {
            const item = asRecord(sale);
            return {
              id: String(item.id ?? item.sale_id ?? '-'),
              medicine: String(item.medicine_name ?? item.catalog_item_name ?? item.resource_name ?? '-'),
              quantity: toNumber(item.quantity_sold ?? item.quantity ?? 0),
              unit_price: toNumber(item.unit_price ?? item.price_per_unit ?? 0),
              total_price: toNumber(item.total_price ?? item.total_amount ?? 0),
              sold_by: String(item.sold_by_email ?? item.sold_by_name ?? '-'),
              sold_at: String(item.sold_at ?? item.created_at ?? '-'),
            };
          });
        } catch {
          nextRows = [];
          setError(null);
        }
      }

      if (reportType === 'analytics') {
        const summary = await analyticsApi.getPlatformSummary();
        nextRows = summary ? [{ ...summary }] : [];
      }

      if (reportType === 'role_audit_log') {
        const res = await auditApi.getAll({ limit: '100', page: '1' });
        const raw = extractRows(res);

        nextRows = (Array.isArray(raw) ? raw : []).map((entry) => {
          const item = asRecord(entry);
          const detailsSource = item.metadata ?? item.details ?? item.message ?? item.description;

          return {
            timestamp: String(item.created_at ?? item.timestamp ?? '-'),
            actor: String(item.actor_email ?? item.user_name ?? item.actor ?? 'System'),
            action: String(item.event_type ?? item.action_type ?? item.action ?? '-'),
            target: String(item.object_type ?? item.resource_name ?? '-'),
            target_id: String(item.object_id ?? item.target_id ?? '-'),
            details: summarizeAuditDetails(detailsSource),
          };
        });
      }

      setRows(nextRows);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, [availableReports, reportType, user?.hospital_id]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (availableReports.some((report) => report.value === reportType)) {
      return;
    }

    if (availableReports.length > 0) {
      setReportType(availableReports[0].value);
      return;
    }

    setRows([]);
  }, [availableReports, reportType]);

  const filteredRows = useMemo(() => {
    if (rows.length === 0) return rows;

    const { start, end } = getTimeWindowBounds(timeWindow, customStartDate, customEndDate);

    return rows.filter((row) => {
      const rowDate = resolveRowDate(row);
      if (!rowDate) return true;
      if (start && rowDate < start) return false;
      if (end && rowDate > end) return false;
      return true;
    });
  }, [customEndDate, customStartDate, rows, timeWindow]);

  const sortedRows = useMemo(() => {
    if (sortField === 'none') {
      return filteredRows;
    }

    const sorted = [...filteredRows];

    sorted.sort((left, right) => {
      if (sortField === 'date') {
        const leftDate = resolveRowDate(left);
        const rightDate = resolveRowDate(right);

        if (!leftDate && !rightDate) return 0;
        if (!leftDate) return 1;
        if (!rightDate) return -1;

        return sortDirection === 'asc'
          ? leftDate.getTime() - rightDate.getTime()
          : rightDate.getTime() - leftDate.getTime();
      }

      const leftAmount = resolveRowAmount(left);
      const rightAmount = resolveRowAmount(right);

      if (leftAmount == null && rightAmount == null) return 0;
      if (leftAmount == null) return 1;
      if (rightAmount == null) return -1;

      return sortDirection === 'asc' ? leftAmount - rightAmount : rightAmount - leftAmount;
    });

    return sorted;
  }, [filteredRows, sortDirection, sortField]);

  const columns = useMemo(() => collectColumns(sortedRows, reportType), [sortedRows, reportType]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, sortedRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportType, timeWindow, customStartDate, customEndDate, sortField, sortDirection]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const exportCSV = () => {
    if (sortedRows.length === 0 || columns.length === 0) return;

    const csvRows = sortedRows.map((row) =>
      columns.map((column) => `"${String(row[column] ?? '').replace(/"/g, '""')}"`).join(',')
    );

    const csv = [columns.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout
      title="Reports"
      // subtitle="Generate, print, and export API-backed reports"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Report Generator</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={sortedRows.length === 0}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
            <CardDescription>
              Use a unified time window, sorting, and pagination for all platform and healthcare report tables.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[220px] flex-1 max-w-sm space-y-1">
                <Label htmlFor="report-type">Report</Label>
                <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
                  <SelectTrigger id="report-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReports.map((report) => (
                      <SelectItem key={report.value} value={report.value}>
                        {report.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[200px] flex-1 max-w-xs space-y-1">
                <Label htmlFor="report-time-window">Time Window</Label>
                <Select value={timeWindow} onValueChange={(value) => setTimeWindow(value as TimeWindow)}>
                  <SelectTrigger id="report-time-window">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {timeWindow === 'custom' ? (
                <>
                  <div className="min-w-[170px] flex-1 max-w-xs space-y-1">
                    <Label htmlFor="report-custom-start">Start Date</Label>
                    <Input
                      id="report-custom-start"
                      type="date"
                      value={customStartDate}
                      onChange={(event) => setCustomStartDate(event.target.value)}
                    />
                  </div>

                  <div className="min-w-[170px] flex-1 max-w-xs space-y-1">
                    <Label htmlFor="report-custom-end">End Date</Label>
                    <Input
                      id="report-custom-end"
                      type="date"
                      value={customEndDate}
                      onChange={(event) => setCustomEndDate(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="min-w-[180px] flex-1 max-w-xs space-y-1">
                <Label htmlFor="report-sort-field">Sort By</Label>
                <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                  <SelectTrigger id="report-sort-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                    <SelectItem value="none">No Sorting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[180px] flex-1 max-w-xs space-y-1">
                <Label htmlFor="report-sort-direction">Direction</Label>
                <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
                  <SelectTrigger id="report-sort-direction" disabled={sortField === 'none'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm" onClick={loadReport}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" disabled>
                  <Calendar className="mr-2 h-4 w-4" />
                  Snapshot Mode
                </Button>
              </div>
            </div>

            {reportType === 'payments' && paymentSummary ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Sent</p>
                    <p className="text-xl font-semibold">{paymentSummary.total_sent.toLocaleString()} {paymentSummary.currency}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Received</p>
                    <p className="text-xl font-semibold">{paymentSummary.total_received.toLocaleString()} {paymentSummary.currency}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-semibold">{paymentSummary.pending.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className="text-xl font-semibold">{paymentSummary.failed.toLocaleString()}</p>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : availableReports.length === 0 ? (
              <div className="text-sm text-muted-foreground">No reports are available for your current scope and permissions.</div>
            ) : sortedRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No report data available for the selected filters.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((column) => (
                          <TableHead key={column} className={isAmountColumn(column) ? 'text-right' : ''}>
                            {formatColumnLabel(column)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRows.map((row, rowIndex) => (
                        <TableRow key={`${reportType}-${rowIndex}`}>
                          {columns.map((column) => {
                            const value = row[column];
                            const displayValue = isDateColumn(column) ? formatDateValue(value) : toDisplayString(value);

                            return (
                              <TableCell
                                key={`${reportType}-${rowIndex}-${column}`}
                                className={isAmountColumn(column) ? 'text-right font-medium tabular-nums' : ''}
                              >
                                {displayValue}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length} rows
                  </span>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>

                    <span className="min-w-[90px] text-center">Page {currentPage} of {totalPages}</span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Reports;
