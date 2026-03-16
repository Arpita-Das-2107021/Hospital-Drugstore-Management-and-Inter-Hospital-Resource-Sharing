import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { analyticsApi } from '@/services/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Target, ShieldCheck, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { ForecastData } from '@/types/healthcare';

const InventoryForecast = () => {
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ accuracy: '—', eoq: '—', safetyStock: '—' });

  useEffect(() => {
    analyticsApi.get()
      .then((res: any) => {
        const data = res?.data || res || {};
        const raw: any[] = data.forecast_data || data.forecasts || data.weekly_trends || [];
        setForecastData(raw.map((d: any) => ({
          month: d.month || d.period || d.name || '',
          actual: d.actual,
          predicted: d.predicted || d.value || 0,
          lowerBound: d.lower_bound || d.lowerBound || 0,
          upperBound: d.upper_bound || d.upperBound || 0,
        })));
        setStats({
          accuracy: data.forecast_accuracy != null ? `${data.forecast_accuracy}%` : '—',
          eoq: data.eoq_recommended != null ? String(data.eoq_recommended) : '—',
          safetyStock: data.safety_stock_level != null ? String(data.safety_stock_level) : '—',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout title="Demand Forecasting" subtitle="AI-powered consumption predictions">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="flex items-center gap-4 p-6"><div className="rounded-lg bg-chart-1/10 p-3"><TrendingUp className="h-6 w-6 text-chart-1" /></div><div><p className="text-2xl font-bold">{stats.accuracy}</p><p className="text-sm text-muted-foreground">Forecast Accuracy</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-6"><div className="rounded-lg bg-chart-2/10 p-3"><Target className="h-6 w-6 text-chart-2" /></div><div><p className="text-2xl font-bold">{stats.eoq}</p><p className="text-sm text-muted-foreground">EOQ Recommended</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-6"><div className="rounded-lg bg-chart-4/10 p-3"><ShieldCheck className="h-6 w-6 text-chart-4" /></div><div><p className="text-2xl font-bold">{stats.safetyStock}</p><p className="text-sm text-muted-foreground">Safety Stock Level</p></div></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Demand Forecast (6-Month)</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="upperBound" stroke="transparent" fill="hsl(var(--chart-1) / 0.1)" />
                    <Area type="monotone" dataKey="lowerBound" stroke="transparent" fill="hsl(var(--background))" />
                    <Area type="monotone" dataKey="predicted" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1) / 0.2)" strokeWidth={2} name="Predicted" />
                    <Area type="monotone" dataKey="actual" stroke="hsl(var(--chart-2))" fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="Actual" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default InventoryForecast;