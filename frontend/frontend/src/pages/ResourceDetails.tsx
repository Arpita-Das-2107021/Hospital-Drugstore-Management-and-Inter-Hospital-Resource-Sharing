import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { useLanguage } from '@/components/layout/LanguageToggle';
import MedicineInfoPanel from '@/components/MedicineInfoPanel';
import { catalogApi, inventoryApi, resourceSharesApi } from '@/services/api';
import { useMedicineInfoStore } from '@/store/medicineInfoStore';
import { type ResourceWithVisibility } from '@/types/healthcare';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Clock, 
  AlertTriangle, 
  Package,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type UnknownRecord = Record<string, unknown>;

type ResourceRouteState = {
  resource?: ResourceWithVisibility;
  share?: UnknownRecord;
};

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const extractSingle = (payload: unknown): UnknownRecord | null => {
  if (!isRecord(payload)) return null;

  const data = payload.data;
  if (isRecord(data)) return data;

  return payload;
};

const extractList = (payload: unknown): UnknownRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const directData = payload.data;
  if (Array.isArray(directData)) {
    return directData.filter(isRecord);
  }

  if (isRecord(directData)) {
    const nestedResults = directData.results;
    if (Array.isArray(nestedResults)) {
      return nestedResults.filter(isRecord);
    }
  }

  const directResults = payload.results;
  if (Array.isArray(directResults)) {
    return directResults.filter(isRecord);
  }

  return [];
};

const pickValue = (record: UnknownRecord | null | undefined, keys: string[]): unknown => {
  if (!record) return undefined;

  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
};

const pickString = (record: UnknownRecord | null | undefined, keys: string[]): string | undefined => {
  const value = pickValue(record, keys);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
};

const pickNumber = (record: UnknownRecord | null | undefined, keys: string[]): number | undefined => {
  const value = pickValue(record, keys);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const pickBoolean = (record: UnknownRecord | null | undefined, keys: string[]): boolean | undefined => {
  const value = pickValue(record, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const pickStringArray = (record: UnknownRecord | null | undefined, keys: string[]): string[] => {
  const value = pickValue(record, keys);

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
};

const toIdString = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized && normalized !== '[object Object]' ? normalized : undefined;
  }

  if (isRecord(value)) {
    return pickString(value, ['id', 'uuid', 'pk']);
  }

  return undefined;
};

const pickId = (record: UnknownRecord | null | undefined, keys: string[]): string | undefined => {
  if (!record) return undefined;

  for (const key of keys) {
    const normalized = toIdString(record[key]);
    if (normalized) return normalized;
  }

  return undefined;
};

const formatDateTime = (value: string | undefined): string => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const resolveShareId = (share: UnknownRecord): string => {
  return pickString(share, ['id', 'share_id', 'resource_share_id', 'share_record_id']) || '';
};

const normalizeType = (value: string | undefined): ResourceWithVisibility['type'] => {
  const normalized = (value || '').toLowerCase();
  if (['drug', 'drugs', 'medication', 'medicine'].includes(normalized)) return 'drugs';
  if (['blood', 'blood_product', 'blood-products'].includes(normalized)) return 'blood';
  if (['organ', 'organs'].includes(normalized)) return 'organs';
  return 'equipment';
};

const buildFallbackShare = (resource: ResourceWithVisibility): UnknownRecord => ({
  id: resource.id,
  hospital: resource.hospitalId,
  hospital_name: resource.hospital,
  catalog_item: resource.catalogItemId,
  catalog_item_name: resource.name,
  resource_type_name: resource.type,
  quantity_offered: resource.quantity,
  status: resource.availability === 'unavailable' ? 'closed' : 'active',
  notes: resource.description,
  valid_until: resource.expiryDate,
  updated_at: resource.lastUpdated,
});

const mapShareToResource = (
  share: UnknownRecord,
  fallback?: ResourceWithVisibility | null,
): ResourceWithVisibility => {
  const id = resolveShareId(share) || fallback?.id || '';
  const quantity =
    pickNumber(share, ['quantity_offered', 'quantity_available', 'quantity']) ??
    fallback?.quantity ??
    0;
  const status = (pickString(share, ['status']) || '').toLowerCase();

  const availability: ResourceWithVisibility['availability'] =
    status === 'closed' || quantity <= 0
      ? 'unavailable'
      : quantity <= 5
        ? 'limited'
        : 'available';

  return {
    id,
    name:
      pickString(share, ['catalog_item_name', 'resource_name', 'name']) ||
      fallback?.name ||
      'Resource',
    type: normalizeType(
      pickString(share, ['resource_type_name', 'resource_type', 'type']) ||
        fallback?.type,
    ),
    hospital:
      pickString(share, ['hospital_name', 'offering_hospital_name', 'supplying_hospital_name']) ||
      fallback?.hospital ||
      'Unknown facility',
    hospitalId:
      pickId(share, [
        'hospital',
        'hospital_id',
        'offering_hospital',
        'offering_hospital_id',
        'supplying_hospital',
        'supplying_hospital_id',
      ]) ||
      toIdString(fallback?.hospitalId) ||
      fallback?.hospitalId,
    catalogItemId:
      pickString(share, ['catalog_item', 'catalog_item_id']) || fallback?.catalogItemId,
    quantity,
    availability,
    isEmergency:
      Boolean(pickValue(share, ['is_emergency', 'emergency'])) ||
      Boolean(fallback?.isEmergency),
    region: pickString(share, ['region']) || fallback?.region || '',
    lastUpdated:
      pickString(share, ['updated_at', 'created_at']) ||
      fallback?.lastUpdated ||
      new Date().toISOString(),
    isVisibleToOthers: true,
    requestCount: pickNumber(share, ['request_count']) || fallback?.requestCount || 0,
    image: pickString(share, ['image_url']) || fallback?.image,
    description: pickString(share, ['description', 'notes']) || fallback?.description,
    bloodType: pickString(share, ['blood_type']) || fallback?.bloodType,
    expiryDate: pickString(share, ['valid_until', 'expiry_date']) || fallback?.expiryDate,
  };
};

const findInventoryMatch = (
  inventoryRows: UnknownRecord[],
  catalogItemId: string | undefined,
  sourceHospitalName: string | undefined,
): UnknownRecord | null => {
  if (inventoryRows.length === 0) return null;

  const byCatalog = catalogItemId
    ? inventoryRows.filter((row) => pickString(row, ['catalog_item', 'catalog_item_id']) === catalogItemId)
    : inventoryRows;

  if (byCatalog.length === 0) return null;

  if (sourceHospitalName) {
    const lowered = sourceHospitalName.toLowerCase();
    const byHospital = byCatalog.find((row) => {
      const hospitalName = pickString(row, ['hospital_name']);
      return hospitalName?.toLowerCase() === lowered;
    });
    if (byHospital) return byHospital;
  }

  return byCatalog[0];
};

const DetailItem = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="rounded-md border p-3 space-y-1">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn('text-sm font-medium break-words', mono && 'font-mono text-xs')}>{value}</p>
  </div>
);

const ResourceDetails = () => {
  const { resourceId: routeResourceId } = useParams<{ resourceId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state as ResourceRouteState | null) ?? null;
  const fallbackResource = routeState?.resource ?? null;
  const fallbackShare = routeState?.share && isRecord(routeState.share) ? routeState.share : null;

  const [resource, setResource] = useState<ResourceWithVisibility | null>(fallbackResource);
  const [sharePayload, setSharePayload] = useState<UnknownRecord | null>(fallbackShare);
  const [catalogPayload, setCatalogPayload] = useState<UnknownRecord | null>(null);
  const [inventoryPayload, setInventoryPayload] = useState<UnknownRecord | null>(null);
  const [isOwnShareByEndpoint, setIsOwnShareByEndpoint] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const medicineCache = useMedicineInfoStore((state) => state.cache);
  const medicineLoading = useMedicineInfoStore((state) => state.loading);
  const medicineError = useMedicineInfoStore((state) => state.error);
  const fetchMedicineInfo = useMedicineInfoStore((state) => state.fetchMedicineInfo);

  const { language } = useLanguage();
  const { user } = useAuth();
  const myHospitalId = String(user?.hospital_id || '').trim();

  const resolvedResourceId = useMemo(() => {
    if (routeResourceId) return safeDecode(routeResourceId);
    if (fallbackShare) return resolveShareId(fallbackShare);
    return fallbackResource?.id || '';
  }, [routeResourceId, fallbackResource?.id, fallbackShare]);

  useEffect(() => {
    let cancelled = false;

    const loadResourceDetails = async () => {
      setLoading(true);
      setNotFound(false);
      setWarningMessage(null);
      setCatalogPayload(null);
      setInventoryPayload(null);
      setIsOwnShareByEndpoint(null);

      let share = fallbackShare;
      if (!share && fallbackResource) {
        share = buildFallbackShare(fallbackResource);
      }

      if (resolvedResourceId) {
        try {
          const detailResponse = await resourceSharesApi.getById(resolvedResourceId);
          const detailPayload = extractSingle(detailResponse);
          if (detailPayload) {
            share = detailPayload;
          }
        } catch {
          try {
            const listResponse = await resourceSharesApi.getAll({ limit: '100', search: resolvedResourceId });
            const listRows = extractList(listResponse);
            const found = listRows.find((item) => resolveShareId(item) === resolvedResourceId);
            if (found) {
              share = found;
            }
          } catch {
            // Keep fallback share data if available.
          }
        }
      }

      if (!share) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const mappedResource = mapShareToResource(share, fallbackResource);
      if (!mappedResource.id) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSharePayload(share);
        setResource(mappedResource);
      }

      const catalogItemId =
        pickString(share, ['catalog_item', 'catalog_item_id']) || mappedResource.catalogItemId;
      const sourceHospitalName =
        pickString(share, ['hospital_name', 'offering_hospital_name', 'supplying_hospital_name']) ||
        mappedResource.hospital;
      const catalogSearchTerm =
        pickString(share, ['catalog_item_name', 'resource_name', 'name']) || mappedResource.name;

      if (catalogItemId) {
        try {
          const catalogResponse = await catalogApi.getById(catalogItemId, {
            include_medicine_info: 'true',
            language,
          });
          const catalogRecord = extractSingle(catalogResponse);
          if (!cancelled && catalogRecord) {
            setCatalogPayload(catalogRecord);
          }
        } catch {
          if (!cancelled) {
            setWarningMessage(
              'Detailed medicine enrichment is currently unavailable. Showing available catalog/share data only.',
            );
          }
        }
      }

      if (myHospitalId) {
        try {
          const ownSharesResponse = await resourceSharesApi.getMine({ limit: '200' });
          const ownShares = extractList(ownSharesResponse)
            .map(extractSingle)
            .filter((item): item is UnknownRecord => item !== null);

          const currentShareId = resolveShareId(share) || mappedResource.id;
          const isMine = ownShares.some((item) => resolveShareId(item) === currentShareId);

          if (!cancelled) {
            setIsOwnShareByEndpoint(isMine);
          }
        } catch {
          if (!cancelled) {
            setIsOwnShareByEndpoint(null);
          }
        }
      }

      try {
        const inventoryParams: Record<string, string> = { limit: '100' };
        if (catalogSearchTerm) {
          inventoryParams.search = catalogSearchTerm;
        }

        const inventoryResponse = await inventoryApi.getAll(inventoryParams);
        const inventoryRows = extractList(inventoryResponse)
          .map(extractSingle)
          .filter((item): item is UnknownRecord => item !== null);

        const matchedInventory = findInventoryMatch(inventoryRows, catalogItemId, sourceHospitalName);
        if (!cancelled) {
          setInventoryPayload(matchedInventory);
        }
      } catch {
        // Inventory enrichment is optional for detail enrichment.
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    void loadResourceDetails();

    return () => {
      cancelled = true;
    };
  }, [resolvedResourceId, fallbackResource, fallbackShare, myHospitalId, language]);

  const medicineCatalogItemId = useMemo(() => {
    const fromShare = pickString(sharePayload, ['catalog_item', 'catalog_item_id']);
    if (fromShare) return fromShare;
    return resource?.catalogItemId || '';
  }, [sharePayload, resource?.catalogItemId]);

  useEffect(() => {
    if (!medicineCatalogItemId) return;
    void fetchMedicineInfo(medicineCatalogItemId, false, language);
  }, [medicineCatalogItemId, fetchMedicineInfo, language]);

  if (loading) {
    return (
      <AppLayout title="Resource Details">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" /><span className="ml-2">Loading resource...</span>
        </div>
      </AppLayout>
    );
  }

  if (notFound || !resource) {
    return (
      <AppLayout title="Resource Not Found">
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">Resource not found</h3>
          <p className="text-muted-foreground">The resource you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/sharing')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Shared Resources
          </Button>
        </div>
      </AppLayout>
    );
  }

  const shareId = sharePayload ? resolveShareId(sharePayload) : resource.id;

  const sourceFacility =
    pickString(sharePayload, ['hospital_name', 'offering_hospital_name', 'supplying_hospital_name']) ||
    resource.hospital ||
    'Not available';
  const sourceFacilityId =
    pickId(sharePayload, [
      'hospital',
      'hospital_id',
      'offering_hospital',
      'offering_hospital_id',
      'supplying_hospital',
      'supplying_hospital_id',
    ]) ||
    toIdString(resource.hospitalId) ||
    resource.hospitalId;

  const quantityOfferedDirect = pickNumber(sharePayload, ['quantity_offered']);
  const quantityAvailableForShare = pickNumber(sharePayload, [
    'shared_quantity',
    'remaining_shared_quantity',
    'remaining_share_quantity',
    'available_shared_quantity',
    'available_share_quantity',
    'quantity_available_for_share',
    'quantity_remaining_for_share',
    'quantity_available',
  ]);
  const committedRequestCount = pickNumber(sharePayload, ['committed_request_count']);

  const quantityOffered =
    quantityOfferedDirect ??
    (quantityAvailableForShare !== undefined && committedRequestCount !== undefined
      ? quantityAvailableForShare + committedRequestCount
      : quantityAvailableForShare ?? resource.quantity);

  const quantityShareAvailable = quantityAvailableForShare ?? quantityOffered;
  const unitOfMeasure =
    pickString(catalogPayload, ['unit_of_measure']) ||
    pickString(inventoryPayload, ['unit']) ||
    'units';

  const shareStatus = pickString(sharePayload, ['status']) || 'Unknown';
  const expiryDate =
    pickString(sharePayload, ['valid_until', 'expiry_date']) ||
    pickString(inventoryPayload, ['expiry_date']) ||
    resource.expiryDate;

  const catalogMedicineInfoRaw = pickValue(catalogPayload, ['medicine_info']);
  const catalogMedicineInfo = isRecord(catalogMedicineInfoRaw) ? catalogMedicineInfoRaw : null;
  const cachedMedicineEntry = medicineCatalogItemId ? medicineCache[medicineCatalogItemId] : undefined;
  const cachedMedicineInfo = cachedMedicineEntry?.data;
  const medicineInfo = isRecord(cachedMedicineInfo) ? cachedMedicineInfo : catalogMedicineInfo;
  const hasCachedMedicineInfo = Boolean(cachedMedicineEntry);
  const medicineRequestError = medicineCatalogItemId ? medicineError : null;
  const medicineBlockingError =
    medicineRequestError && !hasCachedMedicineInfo && !catalogMedicineInfo
      ? medicineRequestError
      : null;
  const medicineWarning = medicineRequestError && !medicineBlockingError ? medicineRequestError : null;
  const medicineStale = cachedMedicineEntry?.stale ?? false;
  const isMedicineBackgroundRefreshing = medicineLoading && hasCachedMedicineInfo;
  const showMedicineInitialLoading = medicineLoading && !medicineInfo && !medicineBlockingError;

  const medicineFound = pickBoolean(medicineInfo, ['found']) ?? false;
  const medicineSource = pickString(medicineInfo, ['source']) || 'Not available';

  const medicineName =
    pickString(medicineInfo, ['name']) ||
    pickString(catalogPayload, ['name']) ||
    pickString(sharePayload, ['catalog_item_name', 'resource_name', 'name']) ||
    resource.name;
  const genericName =
    pickString(medicineInfo, ['generic_name']) ||
    pickString(catalogPayload, ['generic_name', 'generic']) ||
    pickString(sharePayload, ['generic_name']) ||
    'Not provided';
  const categoryType =
    pickString(catalogPayload, ['resource_type_name', 'category', 'type']) ||
    pickString(sharePayload, ['resource_type_name']) ||
    resource.type;
  const dosageStrength =
    pickString(catalogPayload, ['dosage_strength', 'dosage', 'strength']) ||
    pickString(sharePayload, ['dosage_strength', 'dosage', 'strength']) ||
    'Not provided';
  const manufacturer =
    pickString(catalogPayload, ['manufacturer', 'manufacturer_name']) ||
    pickString(sharePayload, ['manufacturer']) ||
    'Not provided';

  const descriptionUsage =
    pickString(catalogPayload, ['description', 'usage', 'indications']) ||
    pickString(sharePayload, ['description', 'notes']) ||
    resource.description ||
    'Not provided';

  // const manualSummary =
  //   pickString(medicineInfo, ['summary']) ||
  //   descriptionUsage ||
  //   'No medicine manual summary is currently available for this resource.';

  const useCases = pickStringArray(medicineInfo, ['use_cases']);
  const indications = pickStringArray(medicineInfo, ['indications']);
  const warnings = pickStringArray(medicineInfo, ['warnings']);
  const dosageGuidance = pickStringArray(medicineInfo, ['dosage_guidance']);
  const ageGuidance = pickStringArray(medicineInfo, ['age_guidance']);
  const storageGuidance = pickStringArray(medicineInfo, ['storage_guidance']);

  const storageInstructions =
    pickString(catalogPayload, ['storage_instructions', 'storage', 'storage_notes']) ||
    pickString(sharePayload, ['storage_instructions']) ||
    'Not provided';

  const storageGuidanceItems =
    storageGuidance.length > 0
      ? storageGuidance
      : storageInstructions !== 'Not provided'
        ? [storageInstructions]
        : [];

  const quantityAvailable = pickNumber(inventoryPayload, ['quantity_available']);
  const quantityFree = pickNumber(inventoryPayload, ['quantity_free']);
  const stockAvailability =
    quantityAvailable !== undefined
      ? quantityFree !== undefined
        ? `${quantityAvailable} total (${quantityFree} free)`
        : `${quantityAvailable} in stock`
      : `${quantityShareAvailable} ${unitOfMeasure} available for sharing`;

  const sourceFacilityIdNormalized = String(sourceFacilityId || '').trim();
  const myHospitalNameNormalized = String(user?.hospital_name || '').trim().toLowerCase();
  const sourceFacilityNameNormalized = sourceFacility.toLowerCase();
  const isOwnByHospital = Boolean(myHospitalId && sourceFacilityIdNormalized && myHospitalId === sourceFacilityIdNormalized);
  const isOwnByName = Boolean(!sourceFacilityIdNormalized && myHospitalNameNormalized && myHospitalNameNormalized === sourceFacilityNameNormalized);
  const isOwnResource =
    isOwnShareByEndpoint !== null
      ? isOwnShareByEndpoint
      : (isOwnByHospital || isOwnByName);
  const ownershipLabel = isOwnResource ? 'Own Facility Resource' : 'Partner Facility Resource';

  const handleRefreshMedicineInfo = () => {
    if (!medicineCatalogItemId) return;
    void fetchMedicineInfo(medicineCatalogItemId, true, language);
  };

  const availabilityLabel =
    resource.availability === 'available'
      ? 'Available'
      : resource.availability === 'limited'
        ? 'Limited'
        : 'Unavailable';
  const availabilityClass =
    resource.availability === 'available'
      ? 'bg-success text-success-foreground'
      : resource.availability === 'limited'
        ? 'bg-warning text-warning-foreground'
        : 'bg-destructive text-destructive-foreground';

  return (
    <AppLayout title={medicineName}
      // subtitle="Resource Details"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)} data-navigation>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last updated {formatDateTime(resource.lastUpdated)}</span>
          </div>
          {/* <Badge className={availabilityClass}>{availabilityLabel}</Badge>
          <Badge variant="outline" className="capitalize">{shareStatus}</Badge>
          <Badge variant={isOwnResource ? 'default' : 'secondary'}>{ownershipLabel}</Badge> */}
        </div>


        {warningMessage ? (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4 text-sm text-warning-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <p>{warningMessage}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-3">
          <MedicineInfoPanel
            className="xl:col-span-2"
            medicineName={medicineName}
            genericName={genericName}
            medicineSource={medicineSource}
            medicineFound={medicineFound}
            // manualSummary={manualSummary}
            useCases={useCases}
            indications={indications}
            dosageGuidance={dosageGuidance}
            ageGuidance={ageGuidance}
            warnings={warnings}
            storageGuidanceItems={storageGuidanceItems}
            stale={medicineStale}
            isRefreshing={isMedicineBackgroundRefreshing}
            showInitialLoading={showMedicineInitialLoading}
            warningMessage={medicineWarning}
            errorMessage={medicineBlockingError}
            canRefresh={Boolean(medicineCatalogItemId)}
            onRefresh={handleRefreshMedicineInfo}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Resource Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailItem label="Source Facility" value={sourceFacility} />
              <DetailItem label="Category / Type" value={categoryType} />        
              <DetailItem label="Quantity Offered" value={`${quantityOffered} ${unitOfMeasure}`} />
              <DetailItem label="Available for Sharing" value={`${quantityShareAvailable} ${unitOfMeasure}`} />
              <DetailItem label="Stock Snapshot" value={stockAvailability} />
              <DetailItem label="Expiry" value={formatDateTime(expiryDate)} />    
              <DetailItem label="Manufacturer" value={manufacturer} />
              <DetailItem label="Share ID" value={shareId || 'Not available'} mono />
            </CardContent>
          </Card>
        </div>

        {/* <Card>
          <CardHeader>
            <CardTitle>Product Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Category / Type" value={categoryType} />
            <DetailItem label="Dosage / Strength" value={dosageStrength} />
            <DetailItem label="Manufacturer" value={manufacturer} />
            <DetailItem label="Storage Instructions" value={storageInstructions} />
            <DetailItem
              label="Manual Coverage"
              value={medicineFound ? 'External medicine manual data available' : 'External medicine manual data unavailable'}
            />
          </CardContent>
        </Card> */}

        {resource.isEmergency ? (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">Emergency Resource</p>
                  <p className="text-sm text-destructive/80 mt-1">
                    This resource is marked as emergency and may require immediate handling.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {resource.bloodType ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Clinical Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailItem label="Blood Type" value={resource.bloodType} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
};

export default ResourceDetails;
