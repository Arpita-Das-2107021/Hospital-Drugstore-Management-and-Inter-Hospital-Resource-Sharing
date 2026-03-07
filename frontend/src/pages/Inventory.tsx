import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { inventoryApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  abc_classification: string;
  ved_classification: string;
  current_stock: number;
  reorder_level: number;
  max_stock: number;
  unit_price: number;
  expiry_date: string | null;
  supplier: string;
  hospital: string;
  last_updated: string;
}

const Inventory = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract unique categories from inventory
  const categories = [...new Set(inventory.map(item => item.category))].sort();

  useEffect(() => {
    fetchInventory();
  }, [user]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch inventory filtered by user's hospital if available
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
        expiry_date: item.expiry_date,
        batch_number: item.batch_number,
        unit_price: item.unit_price,
        storage_location: item.storage_location,
        hospital_name: item.hospital_name,
        hospital_id: item.hospital_id,
        resource_type: item.resource_type,
        resource_unit: item.resource_unit,
        reserved_quantity: item.reserved_quantity,
        stock_status: item.stock_status,
        is_expiring_soon: item.is_expiring_soon,
        total_value: item.total_value,
        code: item.resource_code,
        // Add missing fields with default values
        abc_classification: 'A', // Default classification
        ved_classification: 'V', // Default classification
        supplier: 'Hospital Stock', // Default supplier
      }));
      
      setInventory(mappedInventory);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
      setError('Failed to load inventory. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || item.category === category;
    return matchesSearch && matchesCategory;
  });

  const getStockStatus = (current: number, reorder: number, max: number) => {
    const ratio = current / max;
    if (current <= reorder) return { label: 'Low', variant: 'destructive' as const };
    if (ratio < 0.4) return { label: 'Medium', variant: 'warning' as const };
    return { label: 'Good', variant: 'success' as const };
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const expiry = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 90;
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  if (loading) {
    return (
      <AppLayout title="Inventory Management" subtitle="View and manage stock levels">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading inventory...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Inventory Management" subtitle="View and manage stock levels">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <p>{error}</p>
              <Button onClick={fetchInventory} className="mt-4">Retry</Button>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Inventory Management" subtitle="View and manage stock levels">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">
                Stock List <span className="text-sm text-muted-foreground ml-2">({filtered.length} items)</span>
              </CardTitle>
              <div className="flex gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search items..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                    className="pl-9" 
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-40">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>ABC-VED</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No items found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => {
                    const status = getStockStatus(item.current_stock, item.reorder_level, item.max_stock);
                    const expiring = isExpiringSoon(item.expiry_date);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.abc_classification}-{item.ved_classification}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.current_stock.toLocaleString()} / {item.max_stock.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={status.variant === 'success' ? 'default' : status.variant === 'warning' ? 'secondary' : 'destructive'}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className={expiring ? 'text-warning' : ''}>
                          {expiring && <Clock className="inline mr-1 h-3 w-3" />}
                          {formatDate(item.expiry_date)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.supplier}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Inventory;
