import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Calendar, Loader2, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { inventoryApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

const Reports = () => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInventoryData();
  }, [user]);

  const fetchInventoryData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params: Record<string, string> = {};
      if (user?.hospital_id) {
        params.hospital = user.hospital_id;
      }
      
      const data = await inventoryApi.getAll(params);
      
      // Handle backend response format {count, results} and map field names
      const inventoryData = data.results || data;
      
      // Map backend field names to frontend expected format
      const mappedInventory = inventoryData.map((item: any) => ({
        id: item.id,
        name: item.resource_name,
        category: item.resource_category,
        current_stock: item.available_quantity,
        max_stock: item.max_level,
        reorder_level: item.reorder_level,
        unit_price: item.unit_price,
        total_value: item.total_value || (item.available_quantity * item.unit_price),
        stock_status: item.stock_status,
        is_expiring_soon: item.is_expiring_soon,
      }));
      
      setInventory(mappedInventory);
    } catch (err) {
      console.error('Failed to fetch inventory for reports:', err);
      setError('Failed to load inventory data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Calculate report statistics
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((sum, item) => sum + (item.total_value || 0), 0);
  const lowStockItems = inventory.filter(item => item.current_stock <= item.reorder_level).length;
  const expiringItems = inventory.filter(item => item.is_expiring_soon).length;

  if (loading) {
    return (
      <AppLayout title="Reports & KPIs" subtitle="Generate and export reports">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading reports...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Reports & KPIs" subtitle="Generate and export reports">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <p>{error}</p>
              <Button onClick={fetchInventoryData} className="mt-4">Retry</Button>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Reports & KPIs" subtitle="Generate and export reports">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Report Generator</CardTitle>
            <div className="flex gap-2">
              <Select defaultValue="inventory"><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inventory">Inventory</SelectItem><SelectItem value="sharing">Sharing</SelectItem><SelectItem value="forecast">Forecasting</SelectItem></SelectContent></Select>
              <Button variant="outline"><Calendar className="mr-2 h-4 w-4" />Date Range</Button>
              <Button><Download className="mr-2 h-4 w-4" />Export PDF</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{totalItems}</p><p className="text-sm text-muted-foreground">Total Items</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">${totalValue.toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Value</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{lowStockItems}</p><p className="text-sm text-muted-foreground">Low Stock</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{expiringItems}</p><p className="text-sm text-muted-foreground">Expiring Soon</p></CardContent></Card>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Stock</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {inventory.slice(0, 6).map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.current_stock?.toLocaleString()}</TableCell>
                    <TableCell>${item.total_value?.toFixed(2)}</TableCell>
                    <TableCell>{item.current_stock <= item.reorder_level ? '⚠️ Low' : '✓ OK'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Reports;