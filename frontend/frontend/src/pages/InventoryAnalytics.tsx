import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  Activity,
  Loader2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { inventoryApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899'];

const InventoryAnalytics = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [user]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryApi.getAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'good': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (loading) {
    return (
      <AppLayout title="Inventory Performance Analytics" subtitle="Comprehensive inventory insights">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading analytics...</span>
        </div>
      </AppLayout>
    );
  }

  if (error || !analytics) {
    return (
      <AppLayout title="Inventory Performance Analytics" subtitle="Comprehensive inventory insights">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <p>{error || 'No data available'}</p>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const { summary, days_of_supply, clinical_impact, expiry_risk, turnover_by_category, top_value_items, attention_required } = analytics;

  return (
    <AppLayout title="Inventory Performance Analytics" subtitle="Comprehensive inventory insights and performance tracking">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_items}</div>
              <p className="text-xs text-muted-foreground">
                Total inventory value: ${summary.total_value.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.critical_items}</div>
              <p className="text-xs text-muted-foreground">
                Requiring immediate attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <TrendingDown className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summary.low_stock_items}</div>
              <p className="text-xs text-muted-foreground">
                Below optimal levels
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Adequate Stock</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.adequate_items}</div>
              <p className="text-xs text-muted-foreground">
                Within optimal range
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Different Analytics */}
        <Tabs defaultValue="supply" className="space-y-4">
          <TabsList>
            <TabsTrigger value="supply">Days of Supply</TabsTrigger>
            <TabsTrigger value="clinical">Clinical Impact</TabsTrigger>
            <TabsTrigger value="expiry">Expiry Risk</TabsTrigger>
            <TabsTrigger value="value">Value Analysis</TabsTrigger>
          </TabsList>

          {/* Days of Supply */}
          <TabsContent value="supply" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Days of Supply by Category</CardTitle>
                <CardDescription>Estimated days until stock depletion</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={days_of_supply}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="days" fill="#3b82f6">
                      {days_of_supply.map((entry: any, index: number) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.status === 'good' ? '#10b981' : entry.status === 'warning' ? '#f59e0b' : '#ef4444'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status Summary */}
            <div className="grid gap-4 md:grid-cols-3">
              {days_of_supply.map((item: any) => (
                <Card key={item.category}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{item.category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{item.days} days</div>
                    <Badge className={`mt-2 ${getStatusColor(item.status)}`}>
                      {item.status.toUpperCase()}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Clinical Impact */}
          <TabsContent value="clinical" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Clinical Impact Analysis (VED Classification)</CardTitle>
                <CardDescription>Vital, Essential, and Desirable medications stock status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={clinical_impact}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="classification" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="adequate" name="Adequate Stock" fill="#10b981" />
                    <Bar dataKey="critical" name="Critical Stock" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Clinical Priority Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              {clinical_impact.map((item: any) => (
                <Card key={item.classification}>
                  <CardHeader>
                    <CardTitle className="text-sm">{item.classification}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Adequate:</span>
                        <span className="font-bold text-green-600">{item.adequate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Critical:</span>
                        <span className="font-bold text-red-600">{item.critical}</span>
                      </div>
                      <Progress 
                        value={(item.adequate / (item.adequate + item.critical)) * 100} 
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Expiry Risk */}
          <TabsContent value="expiry" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Expiry Risk Timeline</CardTitle>
                <CardDescription>Items expiring in different time windows</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: '0-30 Days', value: expiry_risk['0-30'] },
                        { name: '31-60 Days', value: expiry_risk['31-60'] },
                        { name: '61-90 Days', value: expiry_risk['61-90'] },
                        { name: '90+ Days', value: expiry_risk['90+'] }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[0, 1, 2, 3].map((index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">0-30 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{expiry_risk['0-30']}</div>
                  <p className="text-xs text-muted-foreground">Urgent attention required</p>
                </CardContent>
              </Card>
              <Card className="border-yellow-200 bg-yellow-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">31-60 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{expiry_risk['31-60']}</div>
                  <p className="text-xs text-muted-foreground">Monitor closely</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">61-90 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{expiry_risk['61-90']}</div>
                  <p className="text-xs text-muted-foreground">Plan usage</p>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">90+ Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{expiry_risk['90+']}</div>
                  <p className="text-xs text-muted-foreground">Safe stock</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Value Analysis */}
          <TabsContent value="value" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Items by Value</CardTitle>
                <CardDescription>Highest value inventory items</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {top_value_items.slice(0, 10).map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-muted-foreground">{item.category} • {item.stock} units</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">${item.value.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Items Requiring Attention */}
        {attention_required.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Items Requiring Immediate Attention
              </CardTitle>
              <CardDescription>Critical stock levels that need action</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {attention_required.map((item: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.category} • VED: {item.ved_classification}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">
                        {item.current_stock} / {item.reorder_level}
                      </div>
                      <Badge className="bg-red-100 text-red-800 border-red-300">Critical</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default InventoryAnalytics;
