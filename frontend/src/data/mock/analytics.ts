import { ForecastData, KPIData } from '@/types/healthcare';

export const mockForecastData: ForecastData[] = [
  { month: 'Jul 2024', actual: 1200, predicted: 1180, lowerBound: 1100, upperBound: 1260 },
  { month: 'Aug 2024', actual: 1350, predicted: 1300, lowerBound: 1220, upperBound: 1380 },
  { month: 'Sep 2024', actual: 1100, predicted: 1150, lowerBound: 1070, upperBound: 1230 },
  { month: 'Oct 2024', actual: 1450, predicted: 1400, lowerBound: 1320, upperBound: 1480 },
  { month: 'Nov 2024', actual: 1600, predicted: 1550, lowerBound: 1470, upperBound: 1630 },
  { month: 'Dec 2024', actual: 1750, predicted: 1700, lowerBound: 1620, upperBound: 1780 },
  { month: 'Jan 2025', predicted: 1650, lowerBound: 1550, upperBound: 1750 },
  { month: 'Feb 2025', predicted: 1500, lowerBound: 1380, upperBound: 1620 },
  { month: 'Mar 2025', predicted: 1400, lowerBound: 1260, upperBound: 1540 },
];

export const mockKPIData: KPIData = {
  stockOutRate: 2.3,
  stockOutTrend: -0.5,
  expiringStock: 8,
  expiringTrend: 2,
  inventoryTurnover: 4.2,
  turnoverTrend: 0.3,
  pendingRequests: 3,
  requestsTrend: -1,
};

export const trendData = [
  { name: 'Mon', stockOuts: 2, requests: 5, transfers: 3 },
  { name: 'Tue', stockOuts: 1, requests: 8, transfers: 4 },
  { name: 'Wed', stockOuts: 3, requests: 6, transfers: 5 },
  { name: 'Thu', stockOuts: 0, requests: 4, transfers: 2 },
  { name: 'Fri', stockOuts: 2, requests: 7, transfers: 6 },
  { name: 'Sat', stockOuts: 1, requests: 3, transfers: 2 },
  { name: 'Sun', stockOuts: 0, requests: 2, transfers: 1 },
];

export const wastageData = [
  { month: 'Jul', expired: 45, damaged: 12 },
  { month: 'Aug', expired: 32, damaged: 8 },
  { month: 'Sep', expired: 28, damaged: 15 },
  { month: 'Oct', expired: 51, damaged: 10 },
  { month: 'Nov', expired: 38, damaged: 7 },
  { month: 'Dec', expired: 22, damaged: 5 },
];

export const abcVedData = [
  { name: 'A-V', value: 35, fill: 'hsl(var(--chart-1))' },
  { name: 'A-E', value: 20, fill: 'hsl(var(--chart-2))' },
  { name: 'B-V', value: 15, fill: 'hsl(var(--chart-3))' },
  { name: 'B-E', value: 12, fill: 'hsl(var(--chart-4))' },
  { name: 'C-D', value: 18, fill: 'hsl(var(--chart-5))' },
];

// Enhanced mock data with clinical metrics
export const daysOfSupplyData = [
  { category: 'ICU', days: 5, status: 'critical', trend: -12 },
  { category: 'Emergency', days: 8, status: 'warning', trend: -5 },
  { category: 'Surgery', days: 15, status: 'good', trend: 3 },
  { category: 'Pharmacy', days: 22, status: 'good', trend: 8 },
  { category: 'Blood Bank', days: 3, status: 'critical', trend: -18 },
  { category: 'Cardiology', days: 12, status: 'good', trend: 2 }
];

export const clinicalImpactData = [
  { month: 'Jul', proceduresEnabled: 245, patientsServed: 189, resourcesShared: 34 },
  { month: 'Aug', proceduresEnabled: 289, patientsServed: 221, resourcesShared: 42 },
  { month: 'Sep', proceduresEnabled: 312, patientsServed: 267, resourcesShared: 38 },
  { month: 'Oct', proceduresEnabled: 278, patientsServed: 203, resourcesShared: 45 },
  { month: 'Nov', proceduresEnabled: 334, patientsServed: 291, resourcesShared: 52 },
  { month: 'Dec', proceduresEnabled: 356, patientsServed: 298, resourcesShared: 48 }
];

export const expiryRiskData = [
  { timeframe: '7 days', medications: 23, blood: 8, supplies: 12, total: 43 },
  { timeframe: '30 days', medications: 67, blood: 15, supplies: 34, total: 116 },
  { timeframe: '90 days', medications: 145, blood: 28, supplies: 89, total: 262 }
];

export const emergencyDepletionData = [
  { resource: 'O- Blood', current: 8, minimum: 15, depletionRate: 2.1, daysLeft: 4 },
  { resource: 'Ventilators', current: 3, minimum: 8, depletionRate: 0.8, daysLeft: 4 },
  { resource: 'Insulin', current: 45, minimum: 100, depletionRate: 12, daysLeft: 4 },
  { resource: 'Epinephrine', current: 12, minimum: 25, depletionRate: 3.2, daysLeft: 4 },
  { resource: 'ICU Monitors', current: 2, minimum: 6, depletionRate: 0.5, daysLeft: 4 }
];

export const responseTimeData = [
  { urgency: 'Emergency (<2h)', fulfilled: 45, total: 47, percentage: 95.7 },
  { urgency: 'Urgent (2-8h)', fulfilled: 89, total: 95, percentage: 93.7 },
  { urgency: 'Routine (24h+)', fulfilled: 156, total: 162, percentage: 96.3 }
];

export const fulfillmentTrendData = [
  { week: 'Week 1', emergency: 94, urgent: 92, routine: 98 },
  { week: 'Week 2', emergency: 96, urgent: 89, routine: 95 },
  { week: 'Week 3', emergency: 91, urgent: 94, routine: 97 },
  { week: 'Week 4', emergency: 98, urgent: 91, routine: 96 }
];