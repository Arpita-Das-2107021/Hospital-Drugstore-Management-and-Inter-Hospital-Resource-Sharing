import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { hospitalsApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { evaluateAccess, getAccessErrorMessage, getCanonicalHealthcareId } from '@/lib/accessResolver';

type InventorySourceType = 'API' | 'CSV' | 'DASHBOARD' | 'HYBRID';
type DataSubmissionType = 'api' | 'csv_upload' | 'manual';
type ApiAuthType = 'none' | 'api_key' | 'basic' | 'bearer';

interface HospitalOption {
  id: string;
  name: string;
}

type FacilitySourceScopeMode = 'auto' | 'platform' | 'hospital';

interface FacilitySourceSetupProps {
  scopeMode?: FacilitySourceScopeMode;
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const FacilitySourceSetup = ({ scopeMode = 'auto' }: FacilitySourceSetupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const hasPlatformFacilityPermissions = evaluateAccess(user, {
    requiredContext: 'PLATFORM',
    requiredPermissions: ['platform:hospital.view', 'platform:hospital.manage'],
  }).allowed;
  const canManageAcrossHospitals =
    scopeMode === 'platform' ? hasPlatformFacilityPermissions : scopeMode === 'hospital' ? false : hasPlatformFacilityPermissions;

  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [inventorySourceType, setInventorySourceType] = useState<InventorySourceType>('DASHBOARD');
  const [dataSubmissionType, setDataSubmissionType] = useState<DataSubmissionType>('manual');
  const [needsDashboard, setNeedsDashboard] = useState(true);

  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiAuthType, setApiAuthType] = useState<ApiAuthType>('none');
  const [apiKey, setApiKey] = useState('');
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [bearerToken, setBearerToken] = useState('');

  const isApiMode = inventorySourceType === 'API' || dataSubmissionType === 'api' || !needsDashboard;

  const switchToApiMode = () => {
    setInventorySourceType('API');
    setDataSubmissionType('api');
    setNeedsDashboard(false);
  };

  const switchToDashboardMode = () => {
    setInventorySourceType((prev) => (prev === 'API' ? 'DASHBOARD' : prev));
    setDataSubmissionType((prev) => (prev === 'api' ? 'manual' : prev));
    setNeedsDashboard(true);
  };

  const healthcareContextId = getCanonicalHealthcareId(user);
  const targetHospitalId = useMemo(() => {
    if (canManageAcrossHospitals) return selectedHospitalId;
    return healthcareContextId || '';
  }, [canManageAcrossHospitals, selectedHospitalId, healthcareContextId]);

  const loadHospitals = async () => {
    if (!canManageAcrossHospitals) return;

    try {
      const response = await hospitalsApi.getAll();
      const root = asRecord(response);
      const list = asArray(root.data ?? root.results ?? response);
      const mapped = list.map((item) => {
        const row = asRecord(item);
        return {
          id: String(row.id ?? ''),
          name: String(row.name ?? row.hospital_name ?? row.id ?? ''),
        };
      }).filter((row) => row.id);

      setHospitals(mapped);
      if (!selectedHospitalId && mapped.length > 0) {
        setSelectedHospitalId(mapped[0].id);
      }
    } catch (error) {
      toast({
        title: 'Failed to load facilities',
        description: getAccessErrorMessage(error, {
          forbiddenMessage: 'You are not authorized to view facility records.',
          fallbackMessage: 'Unable to load facility list.',
        }),
        variant: 'destructive',
      });
    }
  };

  const hydrateFromHospitalPayload = (payload: unknown) => {
    const root = asRecord(payload);
    const data = asRecord(root.data ?? payload);

    const sourceType = String(data.inventory_source_type ?? 'DASHBOARD').toUpperCase() as InventorySourceType;
    const submissionType = String(data.data_submission_type ?? 'manual').toLowerCase() as DataSubmissionType;
    const inferredApiMode = sourceType === 'API' || submissionType === 'api' || data.needs_inventory_dashboard === false;

    setInventorySourceType(inferredApiMode ? 'API' : sourceType);
    setDataSubmissionType(inferredApiMode ? 'api' : submissionType);
    setNeedsDashboard(inferredApiMode ? false : Boolean(data.needs_inventory_dashboard ?? true));

    setApiBaseUrl(String(data.api_base_url ?? ''));
    setApiAuthType(String(data.api_auth_type ?? 'none') as ApiAuthType);
    setApiKey('');
    setApiUsername(String(data.api_username ?? ''));
    setApiPassword('');
    setBearerToken('');
  };

  const loadCurrentConfig = async () => {
    try {
      setLoading(true);

      const response = canManageAcrossHospitals && targetHospitalId
        ? await hospitalsApi.getById(targetHospitalId)
        : await hospitalsApi.getMyHospital();

      hydrateFromHospitalPayload(response);
    } catch (error) {
      toast({
        title: 'Failed to load facility source config',
        description: getAccessErrorMessage(error, {
          forbiddenMessage: 'You are not authorized to view this facility configuration.',
          fallbackMessage: 'Unable to load current configuration.',
        }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHospitals();
  }, [canManageAcrossHospitals]);

  useEffect(() => {
    if (!canManageAcrossHospitals || selectedHospitalId) {
      loadCurrentConfig();
    }
  }, [canManageAcrossHospitals, selectedHospitalId, healthcareContextId]);

  const saveConfig = async () => {
    if (canManageAcrossHospitals && !targetHospitalId) {
      toast({ title: 'Facility selection required', description: 'Choose a facility first.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        inventory_source_type: inventorySourceType,
        data_submission_type: dataSubmissionType,
        needs_inventory_dashboard: needsDashboard,
      };

      if (isApiMode) {
        payload.api_base_url = apiBaseUrl || undefined;
        payload.api_auth_type = apiAuthType;
        if (apiAuthType === 'api_key' && apiKey) payload.api_key = apiKey;
        if ((apiAuthType === 'basic' || apiAuthType === 'bearer') && apiUsername) payload.api_username = apiUsername;
        if ((apiAuthType === 'basic' || apiAuthType === 'bearer') && apiPassword) payload.api_password = apiPassword;
        if (apiAuthType === 'bearer' && bearerToken) payload.bearer_token = bearerToken;
      }

      if (canManageAcrossHospitals && targetHospitalId) {
        await hospitalsApi.update(targetHospitalId, payload);
      } else {
        await hospitalsApi.updateMyHospital(payload);
      }

      toast({ title: 'Configuration saved', description: 'Facility source setup updated successfully.' });
      await loadCurrentConfig();
    } catch (error) {
      toast({
        title: 'Save failed',
        description: getAccessErrorMessage(error, {
          forbiddenMessage: 'You are not authorized to update facility source setup.',
          fallbackMessage: 'Unable to update facility source setup.',
        }),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Facility Source Setup"
      // subtitle="Configure how a facility submits and syncs inventory data"
    >
      <div className="space-y-6">
        {canManageAcrossHospitals ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target Facility</CardTitle>
            </CardHeader>
            <CardContent className="max-w-lg space-y-2">
              <Label>Facility</Label>
              <Select value={selectedHospitalId} onValueChange={setSelectedHospitalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select facility" />
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map((hospital) => (
                    <SelectItem key={hospital.id} value={hospital.id}>{hospital.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source Configuration</CardTitle>
            <CardDescription>Select inventory source mode and submission path.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Inventory Source Type</Label>
                    <Select
                      value={inventorySourceType}
                      onValueChange={(value) => {
                        if (value === 'API') {
                          switchToApiMode();
                          return;
                        }
                        setInventorySourceType(value as InventorySourceType);
                        if (dataSubmissionType === 'api') {
                          setDataSubmissionType('manual');
                        }
                        setNeedsDashboard(true);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isApiMode ? (
                          <SelectItem value="API">API</SelectItem>
                        ) : (
                          <>
                            <SelectItem value="DASHBOARD">DASHBOARD</SelectItem>
                            <SelectItem value="CSV">CSV</SelectItem>
                            <SelectItem value="HYBRID">HYBRID</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Data Submission Type</Label>
                    <Select
                      value={dataSubmissionType}
                      onValueChange={(value) => {
                        if (value === 'api') {
                          switchToApiMode();
                          return;
                        }
                        setDataSubmissionType(value as DataSubmissionType);
                        if (inventorySourceType === 'API') {
                          setInventorySourceType('DASHBOARD');
                        }
                        setNeedsDashboard(true);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isApiMode ? (
                          <SelectItem value="api">api</SelectItem>
                        ) : (
                          <>
                            <SelectItem value="csv_upload">csv_upload</SelectItem>
                            <SelectItem value="manual">manual</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border p-3">
                  <Input
                    id="needs-dashboard"
                    type="checkbox"
                    checked={needsDashboard}
                    onChange={(event) => {
                      if (event.target.checked) {
                        switchToDashboardMode();
                      } else {
                        switchToApiMode();
                      }
                    }}
                    className="h-4 w-4"
                    disabled={isApiMode}
                  />
                  <Label htmlFor="needs-dashboard" className="text-sm">Needs inventory dashboard enabled</Label>
                </div>

                {isApiMode ? (
                  <div className="rounded-md border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Integration Credentials</p>
                      <Badge variant="outline">Auth: {apiAuthType}</Badge>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="api-base-url">API Base URL</Label>
                        <Input id="api-base-url" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://facility.example.com/api" />
                      </div>

                      <div className="space-y-2">
                        <Label>Auth Type</Label>
                        <Select value={apiAuthType} onValueChange={(value) => setApiAuthType(value as ApiAuthType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">none</SelectItem>
                            <SelectItem value="api_key">api_key</SelectItem>
                            <SelectItem value="basic">basic</SelectItem>
                            <SelectItem value="bearer">bearer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {apiAuthType === 'api_key' ? (
                        <div className="space-y-2">
                          <Label htmlFor="api-key">API Key</Label>
                          <Input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
                        </div>
                      ) : null}

                      {apiAuthType === 'basic' || apiAuthType === 'bearer' ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="api-username">Username</Label>
                            <Input id="api-username" value={apiUsername} onChange={(event) => setApiUsername(event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="api-password">Password</Label>
                            <Input id="api-password" type="password" value={apiPassword} onChange={(event) => setApiPassword(event.target.value)} />
                          </div>
                        </>
                      ) : null}

                      {apiAuthType === 'bearer' ? (
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="bearer-token">Bearer Token</Label>
                          <Input id="bearer-token" type="password" value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    API integration fields are disabled while Inventory Management System mode is active.
                  </div>
                )}

                <Button onClick={saveConfig} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Configuration
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default FacilitySourceSetup;
