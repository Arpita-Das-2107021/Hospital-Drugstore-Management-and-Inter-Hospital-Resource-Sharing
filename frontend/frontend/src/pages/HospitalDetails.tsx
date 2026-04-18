import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { hospitalsApi } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L, { type Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bed,
  Building2,
  Globe,
  IdCard,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import HospitalLogo from '@/components/HospitalLogo';
import { resolveMediaUrl } from '@/utils/media';
import { hasAnyPermission } from '@/lib/rbac';

const markerIcon: Icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type UnknownRecord = Record<string, unknown>;

interface HospitalDetailsData {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  region?: string;
  phone?: string;
  email?: string;
  website?: string;
  status?: string;
  verifiedAt?: string;
  hospitalType?: string;
  registrationNumber?: string;
  totalStaff?: number;
  totalInventory?: number;
  totalDepartments?: number;
  totalBeds?: number;
  coordinatesLat?: string;
  coordinatesLng?: string;
  apiBaseUrl?: string;
  apiAuthType?: string;
  apiUsername?: string;
  imageUrl?: string;
  logo?: string | null;
}

interface HospitalFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  hospital_type: string;
  registration_number: string;
  latitude: string;
  longitude: string;
  api_base_url: string;
  api_auth_type: string;
  api_username: string;
  api_key: string;
  api_password: string;
}

interface DetailFieldData {
  label: string;
  value: string;
  mono?: boolean;
}

interface EditableFieldConfig {
  key: keyof HospitalFormData;
  label: string;
  sourceKeys: string[];
  type?: 'text' | 'email' | 'password';
  fullWidth?: boolean;
  placeholder?: string;
  group: 'overview' | 'contact' | 'location' | 'admin';
}

const PLACEHOLDER_TOKENS = new Set([
  'n/a',
  'na',
  'not available',
  'null',
  'undefined',
  'none',
  '-',
  '--',
]);

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const pickRawValue = (record: UnknownRecord, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
};

const toMeaningfulString = (value: unknown, options?: { allowZero?: boolean }): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const normalized = trimmed.toLowerCase();
    if (PLACEHOLDER_TOKENS.has(normalized)) return undefined;
    if (!options?.allowZero && normalized === '0') return undefined;
    return trimmed;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!options?.allowZero && value === 0) return undefined;
    return String(value);
  }

  return undefined;
};

const toMeaningfulNumber = (value: unknown, options?: { allowZero?: boolean }): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!options?.allowZero && value === 0) return undefined;
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    if (!options?.allowZero && parsed === 0) return undefined;
    return parsed;
  }

  return undefined;
};

const toFormString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const hasMeaningfulBackendValue = (value: unknown, options?: { allowZero?: boolean }): boolean => {
  return (
    toMeaningfulString(value, options) !== undefined ||
    toMeaningfulNumber(value, options) !== undefined
  );
};

const toField = (
  label: string,
  value: string | number | undefined,
  options?: { allowZero?: boolean; mono?: boolean },
): DetailFieldData | null => {
  const normalized =
    typeof value === 'number'
      ? toMeaningfulNumber(value, { allowZero: options?.allowZero })
      : toMeaningfulString(value, { allowZero: options?.allowZero });

  if (normalized === undefined) return null;

  return {
    label,
    value: String(normalized),
    mono: options?.mono,
  };
};

const formatDateValue = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString();
};

const mapHospitalData = (record: UnknownRecord, fallbackId?: string): HospitalDetailsData => {
  const mediaSource = pickRawValue(record, ['logo', 'image']);

  return {
    id: toMeaningfulString(pickRawValue(record, ['id']), { allowZero: true }) || fallbackId || '',
    name: toMeaningfulString(pickRawValue(record, ['name'])),
    address: toMeaningfulString(pickRawValue(record, ['address'])),
    city: toMeaningfulString(pickRawValue(record, ['city'])),
    state: toMeaningfulString(pickRawValue(record, ['state'])),
    country: toMeaningfulString(pickRawValue(record, ['country'])),
    region: toMeaningfulString(pickRawValue(record, ['region'])),
    phone: toMeaningfulString(pickRawValue(record, ['phone'])),
    email: toMeaningfulString(pickRawValue(record, ['email'])),
    website: toMeaningfulString(pickRawValue(record, ['website'])),
    status: toMeaningfulString(pickRawValue(record, ['verified_status', 'status'])),
    verifiedAt: toMeaningfulString(pickRawValue(record, ['verified_at'])),
    hospitalType: toMeaningfulString(pickRawValue(record, ['hospital_type'])),
    registrationNumber: toMeaningfulString(pickRawValue(record, ['registration_number', 'license_number'])),
    totalStaff: toMeaningfulNumber(pickRawValue(record, ['total_staff', 'staff_count'])),
    totalInventory: toMeaningfulNumber(pickRawValue(record, ['total_inventory'])),
    totalDepartments: toMeaningfulNumber(pickRawValue(record, ['total_departments', 'department_count'])),
    totalBeds: toMeaningfulNumber(pickRawValue(record, ['bed_count', 'total_beds'])),
    coordinatesLat: toMeaningfulString(pickRawValue(record, ['latitude', 'coordinates_lat']), { allowZero: true }),
    coordinatesLng: toMeaningfulString(pickRawValue(record, ['longitude', 'coordinates_lng']), { allowZero: true }),
    apiBaseUrl: toMeaningfulString(pickRawValue(record, ['api_base_url'])),
    apiAuthType: toMeaningfulString(pickRawValue(record, ['api_auth_type'])),
    apiUsername: toMeaningfulString(pickRawValue(record, ['api_username'])),
    imageUrl: resolveMediaUrl(toMeaningfulString(mediaSource, { allowZero: true }) || null),
    logo: toMeaningfulString(pickRawValue(record, ['logo']), { allowZero: true }) || null,
  };
};

const buildHospitalFormData = (record: UnknownRecord): HospitalFormData => {
  return {
    name: toFormString(pickRawValue(record, ['name'])),
    address: toFormString(pickRawValue(record, ['address'])),
    city: toFormString(pickRawValue(record, ['city'])),
    state: toFormString(pickRawValue(record, ['state'])),
    country: toFormString(pickRawValue(record, ['country'])),
    phone: toFormString(pickRawValue(record, ['phone'])),
    email: toFormString(pickRawValue(record, ['email'])),
    website: toFormString(pickRawValue(record, ['website'])),
    hospital_type: toFormString(pickRawValue(record, ['hospital_type'])),
    registration_number: toFormString(pickRawValue(record, ['registration_number', 'license_number'])),
    latitude: toFormString(pickRawValue(record, ['latitude', 'coordinates_lat'])),
    longitude: toFormString(pickRawValue(record, ['longitude', 'coordinates_lng'])),
    api_base_url: toFormString(pickRawValue(record, ['api_base_url'])),
    api_auth_type: toFormString(pickRawValue(record, ['api_auth_type'])),
    api_username: toFormString(pickRawValue(record, ['api_username'])),
    api_key: '',
    api_password: '',
  };
};

const DetailField = ({ label, value, mono = false }: DetailFieldData) => {
  return (
    <div className="grid gap-2 border-b border-border/60 py-3 last:border-b-0 md:grid-cols-[minmax(170px,220px)_minmax(0,1fr)] md:items-start">
      <dt className="break-words text-[11px] font-semibold uppercase tracking-[0.08em] leading-5 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-sm font-medium leading-relaxed text-foreground', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
};

const DetailCard = ({
  title,
  description,
  icon: Icon,
  fields,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  fields: DetailFieldData[];
}) => {
  if (fields.length === 0) return null;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
      <CardHeader className="space-y-2 border-b border-border/60 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription className="leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <dl>
          {fields.map((field) => (
            <DetailField key={field.label} {...field} />
          ))}
        </dl>
      </CardContent>
    </Card>
  );
};

const EDITABLE_FIELDS: EditableFieldConfig[] = [
  { key: 'name', label: 'Hospital Name', sourceKeys: ['name'], group: 'overview' },
  { key: 'hospital_type', label: 'Hospital Type', sourceKeys: ['hospital_type'], group: 'overview' },
  { key: 'registration_number', label: 'Registration Number', sourceKeys: ['registration_number', 'license_number'], group: 'overview' },
  { key: 'phone', label: 'Phone', sourceKeys: ['phone'], group: 'contact' },
  { key: 'email', label: 'Email', sourceKeys: ['email'], type: 'email', group: 'contact' },
  { key: 'website', label: 'Website', sourceKeys: ['website'], fullWidth: true, group: 'contact' },
  { key: 'address', label: 'Address', sourceKeys: ['address'], fullWidth: true, group: 'location' },
  { key: 'city', label: 'City', sourceKeys: ['city'], group: 'location' },
  { key: 'state', label: 'State', sourceKeys: ['state'], group: 'location' },
  { key: 'country', label: 'Country', sourceKeys: ['country'], group: 'location' },
  { key: 'latitude', label: 'Latitude', sourceKeys: ['latitude', 'coordinates_lat'], group: 'location' },
  { key: 'longitude', label: 'Longitude', sourceKeys: ['longitude', 'coordinates_lng'], group: 'location' },
  { key: 'api_base_url', label: 'API Base URL', sourceKeys: ['api_base_url'], fullWidth: true, group: 'admin' },
  { key: 'api_auth_type', label: 'API Auth Type', sourceKeys: ['api_auth_type'], group: 'admin' },
  { key: 'api_username', label: 'API Username', sourceKeys: ['api_username'], group: 'admin' },
  {
    key: 'api_key',
    label: 'API Key',
    sourceKeys: ['api_key'],
    type: 'password',
    placeholder: 'Leave blank to keep unchanged',
    group: 'admin',
  },
  {
    key: 'api_password',
    label: 'API Password',
    sourceKeys: ['api_password'],
    type: 'password',
    placeholder: 'Leave blank to keep unchanged',
    group: 'admin',
  },
];

const HospitalDetails = () => {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [hospital, setHospital] = useState<HospitalDetailsData | null>(null);
  const [rawHospital, setRawHospital] = useState<UnknownRecord | null>(null);
  const [formData, setFormData] = useState<HospitalFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const canManageAnyHospital = hasAnyPermission(user, ['platform:hospital.manage', 'platform:hospital.review']);
  const canUpdateHospital = hasAnyPermission(user, ['hospital:hospital.update']);
  const canEditMyHospital = canUpdateHospital && String(user?.hospital_id || '') === String(hospitalId || '');
  const canEditHospital = canManageAnyHospital || canEditMyHospital;

  const fetchHospitalDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = canEditMyHospital
        ? await hospitalsApi.getMyHospital()
        : await hospitalsApi.getById(hospitalId || '');

      const payload = (response as { data?: unknown })?.data ?? response;
      if (!isRecord(payload)) {
        throw new Error('Hospital payload is invalid.');
      }

      const mapped = mapHospitalData(payload, hospitalId);

      setRawHospital(payload);
      setHospital(mapped);
      setFormData(buildHospitalFormData(payload));
      setImageLoadFailed(false);
    } catch (fetchError) {
      console.error('Failed to fetch hospital details:', fetchError);
      setError('Failed to load hospital details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [canEditMyHospital, hospitalId]);

  useEffect(() => {
    if (!hospitalId) return;
    void fetchHospitalDetails();
  }, [hospitalId, fetchHospitalDetails]);

  const handleInputChange = (field: keyof HospitalFormData, value: string) => {
    setFormData((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const visibleEditableFields = useMemo(() => {
    if (!rawHospital) return [];

    return EDITABLE_FIELDS.filter((field) => {
      if (field.key === 'api_key' || field.key === 'api_password') {
        return canManageAnyHospital;
      }

      return field.sourceKeys.some((key) => {
        const rawValue = rawHospital[key];
        return hasMeaningfulBackendValue(rawValue, {
          allowZero: key === 'latitude' || key === 'longitude' || key === 'coordinates_lat' || key === 'coordinates_lng',
        });
      });
    });
  }, [rawHospital, canManageAnyHospital]);

  const visibleEditableFieldKeys = useMemo(() => {
    return new Set<keyof HospitalFormData>(visibleEditableFields.map((field) => field.key));
  }, [visibleEditableFields]);

  const handleSave = async () => {
    if (!formData) return;

    const payload: Record<string, unknown> = {};
    const appendField = (fieldKey: keyof HospitalFormData, payloadKey?: string) => {
      if (!visibleEditableFieldKeys.has(fieldKey)) return;
      const rawValue = formData[fieldKey].trim();
      payload[payloadKey || fieldKey] = rawValue.length > 0 ? rawValue : null;
    };

    appendField('name');
    appendField('address');
    appendField('city');
    appendField('state');
    appendField('country');
    appendField('phone');
    appendField('email');
    appendField('website');
    appendField('hospital_type');
    appendField('registration_number');
    appendField('latitude');
    appendField('longitude');
    appendField('api_base_url');
    appendField('api_auth_type');
    appendField('api_username');
    appendField('api_key');
    appendField('api_password');

    if (Object.keys(payload).length === 0) {
      toast({
        title: 'No editable fields',
        description: 'There are no backend-provided fields available to update in this profile.',
      });
      return;
    }

    try {
      setIsSaving(true);

      const response = canEditMyHospital
        ? await hospitalsApi.updateMyHospital(payload)
        : await hospitalsApi.update(hospitalId || '', payload);

      const pendingRequest = (response as { data?: { pending_update_request?: unknown } })?.data?.pending_update_request;
      if (pendingRequest) {
        toast({
          title: 'Update submitted for review',
          description: 'Non-sensitive fields were applied. Sensitive field changes are pending SUPER_ADMIN approval.',
        });
      } else {
        toast({
          title: 'Hospital updated',
          description: 'Hospital details have been saved successfully.',
        });
      }

      await fetchHospitalDetails();
    } catch (saveError) {
      console.error('Failed to update hospital:', saveError);
      toast({
        title: 'Update failed',
        description: 'Failed to update hospital details.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const lat = hospital?.coordinatesLat ? Number(hospital.coordinatesLat) : Number.NaN;
  const lng = hospital?.coordinatesLng ? Number(hospital.coordinatesLng) : Number.NaN;
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

  if (loading) {
    return (
      <AppLayout title="Loading Healthcare Details...">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading hospital details...</span>
        </div>
      </AppLayout>
    );
  }

  if (error || !hospital) {
    return (
      <AppLayout title="Healthcare Details">
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <AlertTriangle className="mx-auto mb-4 h-12 w-12" />
              <p>{error || 'Hospital not found'}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => navigate(canManageAnyHospital ? '/admin/hospitals' : '/hospitals')}>
                  Back to Healthcares
                </Button>
                <Button onClick={fetchHospitalDetails} variant="outline">Retry</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (!formData) return null;

  const addressLine = [hospital.address, hospital.city, hospital.state, hospital.country]
    .filter((value): value is string => Boolean(value))
    .join(', ');

  const quickMetrics: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Staff Members', value: hospital.totalStaff || 0, icon: Users },
    { label: 'Inventory Items', value: hospital.totalInventory || 0, icon: Package },
    { label: 'Departments', value: hospital.totalDepartments || 0, icon: Building2 },
    { label: 'Total Beds', value: hospital.totalBeds || 0, icon: Bed },
  ].filter((metric) => metric.value > 0);

  const hospitalOverviewFields = [
    toField('Name', hospital.name),
    toField('Hospital Type', hospital.hospitalType),
    toField('Status', hospital.status),
    toField('Verified On', formatDateValue(hospital.verifiedAt)),
  ].filter((field): field is DetailFieldData => field !== null);

  const contactFields = [
    toField('Phone', hospital.phone),
    toField('Email', hospital.email),
    toField('Website', hospital.website),
  ].filter((field): field is DetailFieldData => field !== null);

  const operationalFields = [
    toField('Registration Number', hospital.registrationNumber),
    toField('Departments', hospital.totalDepartments),
    toField('Staff Members', hospital.totalStaff),
  ].filter((field): field is DetailFieldData => field !== null);

  const capacityFields = [
    toField('Total Beds', hospital.totalBeds),
    toField('Inventory Items', hospital.totalInventory),
  ].filter((field): field is DetailFieldData => field !== null);

  const administrativeFields = [
    toField('API Base URL', hospital.apiBaseUrl),
    toField('API Auth Type', hospital.apiAuthType),
    toField('API Username', hospital.apiUsername),
  ].filter((field): field is DetailFieldData => field !== null);

  const locationFields = [
    toField('Address', hospital.address),
    toField('City', hospital.city),
    toField('State', hospital.state),
    toField('Country', hospital.country),
    toField('Region', hospital.region),
    hasCoordinates ? toField('Coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { allowZero: true, mono: true }) : null,
  ].filter((field): field is DetailFieldData => field !== null);

  const statusVariant = hospital.status?.toLowerCase() === 'active' || hospital.status?.toLowerCase() === 'verified'
    ? 'default'
    : 'secondary';

  const groupedEditableFields = {
    overview: visibleEditableFields.filter((field) => field.group === 'overview'),
    contact: visibleEditableFields.filter((field) => field.group === 'contact'),
    location: visibleEditableFields.filter((field) => field.group === 'location'),
    admin: visibleEditableFields.filter((field) => field.group === 'admin'),
  };

  const websiteHref = hospital.website
    ? /^https?:\/\//i.test(hospital.website)
      ? hospital.website
      : `https://${hospital.website}`
    : null;

  return (
    <AppLayout title={hospital.name || 'Hospital Details'}>
      <div className="mx-auto max-w-7xl space-y-8 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate(canManageAnyHospital ? '/admin/hospitals' : '/hospitals')}
            className="mb-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Hospitals
          </Button>
          {canEditHospital ? (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          ) : null}
        </div>

        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="grid lg:grid-cols-[300px_1fr]">
              <div className="relative flex min-h-[260px] items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-background">
                {hospital.imageUrl && !imageLoadFailed ? (
                  <img
                    src={hospital.imageUrl}
                    alt={hospital.name || 'Hospital'}
                    className="h-full w-full object-cover"
                    onError={() => setImageLoadFailed(true)}
                  />
                ) : (
                  <HospitalLogo
                    name={hospital.name || ''}
                    logo={hospital.logo}
                    className="h-32 w-32"
                    imageClassName="object-cover shadow-lg"
                  />
                )}
                <span className="absolute left-4 top-4 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
                  Facility Snapshot
                </span>
              </div>

              <div className="space-y-6 p-6 lg:p-8">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {hospital.name ? <h1 className="text-3xl font-semibold tracking-tight leading-tight">{hospital.name}</h1> : null}
                    {hospital.status ? (
                      <Badge variant={statusVariant} className="capitalize">
                        {hospital.status}
                      </Badge>
                    ) : null}
                    {hospital.hospitalType ? (
                      <Badge variant="outline" className="capitalize">
                        {hospital.hospitalType}
                      </Badge>
                    ) : null}
                  </div>

                  {addressLine ? (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4" />
                      <span>{addressLine}</span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 text-xs">
                    {hospital.registrationNumber ? (
                      <span className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-muted-foreground">
                        Reg: {hospital.registrationNumber}
                      </span>
                    ) : null}
                    {hospital.verifiedAt ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-800">
                        Verified on {formatDateValue(hospital.verifiedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {hospital.phone ? (
                    <Button variant="outline" onClick={() => window.open(`tel:${hospital.phone}`)}>
                      <Phone className="mr-2 h-4 w-4" />
                      Call
                    </Button>
                  ) : null}
                  {hospital.email ? (
                    <Button variant="outline" onClick={() => window.open(`mailto:${hospital.email}`)}>
                      <Mail className="mr-2 h-4 w-4" />
                      Email
                    </Button>
                  ) : null}
                  {websiteHref ? (
                    <Button onClick={() => window.open(websiteHref, '_blank', 'noopener,noreferrer')}>
                      <Globe className="mr-2 h-4 w-4" />
                      Visit Website
                    </Button>
                  ) : null}
                </div>

                {quickMetrics.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {quickMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm"
                      >
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <metric.icon className="h-4 w-4" />
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em]">{metric.label}</p>
                        </div>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">{metric.value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid items-start gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <DetailCard
              title="Hospital Overview"
              description="Primary identity and verification metadata from backend records."
              icon={Building2}
              fields={hospitalOverviewFields}
            />
            <DetailCard
              title="Operational Details"
              description="Operational profile and staffing signals available in this record."
              icon={Activity}
              fields={operationalFields}
            />
            <DetailCard
              title="Capacity and Resources"
              description="Capacity and inventory figures returned by the backend."
              icon={Package}
              fields={capacityFields}
            />

            {hasCoordinates ? (
              <Card className="rounded-2xl border-border/70 shadow-sm">
                <CardHeader className="space-y-1 border-b border-border/60 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-4 w-4 text-primary" />
                    Location Map
                  </CardTitle>
                  <CardDescription>Mapped coordinates returned by the backend for this hospital.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-md border border-border/70">
                    <MapContainer
                      center={[lat, lng]}
                      zoom={13}
                      style={{ height: '320px', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker position={[lat, lng]} icon={markerIcon} />
                    </MapContainer>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <DetailCard
              title="Contact Information"
              description="Direct communication channels currently available for this facility."
              icon={Phone}
              fields={contactFields}
            />
            <DetailCard
              title="Location Details"
              description="Address and geospatial metadata for this facility."
              icon={MapPin}
              fields={locationFields}
            />
            <DetailCard
              title="Administrative Metadata"
              description="Administrative integration and API identity details."
              icon={ShieldCheck}
              fields={administrativeFields}
            />
          </div>
        </div>

        {canEditHospital && visibleEditableFields.length > 0 ? (
          <Card className="rounded-2xl border-border/80 shadow-sm">
            <CardHeader className="space-y-1 border-b border-border/60 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <IdCard className="h-4 w-4 text-primary" />
                Edit Hospital Information
              </CardTitle>
              <CardDescription>
                Edit backend-exposed fields for this profile and save changes when ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!canManageAnyHospital ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Sensitive field updates are submitted for SUPER_ADMIN approval.
                </div>
              ) : null}

              {groupedEditableFields.overview.length > 0 ? (
                <section className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hospital Overview</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {groupedEditableFields.overview.map((field) => (
                      <div key={field.key} className={cn('space-y-2', field.fullWidth && 'md:col-span-2')}>
                        <p className="text-sm text-muted-foreground">{field.label}</p>
                        <Input
                          type={field.type || 'text'}
                          value={formData[field.key]}
                          onChange={(event) => handleInputChange(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {groupedEditableFields.contact.length > 0 ? (
                <section className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact Information</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {groupedEditableFields.contact.map((field) => (
                      <div key={field.key} className={cn('space-y-2', field.fullWidth && 'md:col-span-2')}>
                        <p className="text-sm text-muted-foreground">{field.label}</p>
                        <Input
                          type={field.type || 'text'}
                          value={formData[field.key]}
                          onChange={(event) => handleInputChange(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {groupedEditableFields.location.length > 0 ? (
                <section className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Location Details</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {groupedEditableFields.location.map((field) => (
                      <div key={field.key} className={cn('space-y-2', field.fullWidth && 'md:col-span-2')}>
                        <p className="text-sm text-muted-foreground">{field.label}</p>
                        <Input
                          type={field.type || 'text'}
                          value={formData[field.key]}
                          onChange={(event) => handleInputChange(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {groupedEditableFields.admin.length > 0 ? (
                <section className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Administrative Information</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {groupedEditableFields.admin.map((field) => (
                      <div key={field.key} className={cn('space-y-2', field.fullWidth && 'md:col-span-2')}>
                        <p className="text-sm text-muted-foreground">{field.label}</p>
                        <Input
                          type={field.type || 'text'}
                          value={formData[field.key]}
                          onChange={(event) => handleInputChange(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!canEditHospital ? (
          <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
            <CardHeader className="space-y-2 border-b border-border/60 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-4 w-4 text-primary" />
                Access Notice
              </CardTitle>
              <CardDescription className="leading-relaxed">
                This profile is currently available in read-only mode for your account.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
};

export default HospitalDetails;
