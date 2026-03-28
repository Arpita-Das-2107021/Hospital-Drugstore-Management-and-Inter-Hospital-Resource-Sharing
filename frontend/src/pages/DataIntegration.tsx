import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';

const DataIntegration = () => {
  return (
    <AppLayout title="Data Integration" subtitle="Import data and manage connections">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">CSV Upload</CardTitle></CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-muted rounded-lg p-12 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-medium">Drop your CSV file here</h3>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <Button className="mt-4">Select File</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Integration Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5" /><span>Inventory System</span></div>
              <Badge className="bg-success"><Check className="mr-1 h-3 w-3" />Connected</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5" /><span>Hospital Network</span></div>
              <Badge className="bg-success"><Check className="mr-1 h-3 w-3" />Connected</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5" /><span>Regulatory API</span></div>
              <Badge variant="secondary"><AlertCircle className="mr-1 h-3 w-3" />Pending</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default DataIntegration;