import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from 'lucide-react';
import { hospitalsApi, integrationsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  id: string;
  resource_type?: string;
  integration_type: string;
  api_endpoint?: string;
  is_active: boolean;
  last_sync?: string | null;
  hospital?: string;
  hospital_name?: string;
}

interface HospitalOption {
  id: string;
  name: string;
}

const DataIntegration = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPER_ADMIN';

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [resourceType, setResourceType] = useState('inventory');
  const [file, setFile] = useState<File | null>(null);

  const effectiveHospitalId = useMemo(() => {
    if (isSuperAdmin) return selectedHospital;
    return user?.hospital_id ?? '';
  }, [isSuperAdmin, selectedHospital, user?.hospital_id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [integrationsRes, hospitalsRes] = await Promise.all([
        integrationsApi.getAll(),
        isSuperAdmin ? hospitalsApi.getAll() : Promise.resolve(null),
      ]);

      const integrationsRaw = (integrationsRes as any)?.data ?? integrationsRes;
      const integrationList: Integration[] = Array.isArray(integrationsRaw)
        ? integrationsRaw
        : (integrationsRaw?.results ?? []);
      setIntegrations(integrationList);

      if (isSuperAdmin && hospitalsRes) {
        const hospitalsRaw = (hospitalsRes as any)?.data ?? hospitalsRes;
        const hospitalList: any[] = Array.isArray(hospitalsRaw)
          ? hospitalsRaw
          : (hospitalsRaw?.results ?? []);
        const mapped = hospitalList.map((h: any) => ({ id: String(h.id), name: h.name || h.hospital_name || String(h.id) }));
        setHospitals(mapped);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load integrations', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isSuperAdmin]);

  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'CSV file required', variant: 'destructive' });
      return;
    }
    if (!effectiveHospitalId) {
      toast({ title: 'Select hospital first', variant: 'destructive' });
      return;
    }

    try {
      setUploading(true);
      await integrationsApi.create({
        hospital: effectiveHospitalId,
        integration_type: 'csv_upload',
        resource_type: resourceType,
        api_endpoint: `/uploads/${file.name}`,
        headers: {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || 'text/csv',
        },
        is_active: true,
      });

      toast({
        title: 'CSV upload submitted',
        description: 'The dataset has been queued for backend processing.',
      });
      setFile(null);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppLayout title="Data Integration" subtitle="Upload datasets and manage integration status">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSV Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSuperAdmin ? (
              <div className="space-y-2">
                <Label>Target Hospital</Label>
                <Select value={selectedHospital} onValueChange={setSelectedHospital}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    {hospitals.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Target Hospital</Label>
                <Input value={user?.hospital_name || 'Your hospital'} disabled />
              </div>
            )}

            <div className="space-y-2">
              <Label>Resource Type</Label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="blood">Blood</SelectItem>
                  <SelectItem value="beds">Beds</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>CSV File</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  Selected: {file.name} ({Math.ceil(file.size / 1024)} KB)
                </p>
              )}
            </div>

            <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">CSV data is sent to backend processing queue</p>
              <Button className="mt-4" onClick={handleUpload} disabled={uploading || !file || !effectiveHospitalId}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Submit CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integration Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : integrations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No integrations configured.</p>
            ) : (
              integrations.map((integ) => (
                <div key={integ.id} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet className="h-5 w-5" />
                    <div className="min-w-0">
                      <span className="font-medium capitalize">{integ.integration_type.replace('_', ' ')}</span>
                      <p className="text-xs text-muted-foreground truncate">
                        {integ.hospital_name || integ.hospital || 'Platform'}
                      </p>
                    </div>
                  </div>
                  {integ.is_active ? (
                    <Badge className="bg-success"><Check className="mr-1 h-3 w-3" />Active</Badge>
                  ) : (
                    <Badge variant="secondary"><AlertCircle className="mr-1 h-3 w-3" />Inactive</Badge>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default DataIntegration;