// Re-export all mock data from centralized files
export { mockUsers, mockEmployees } from './mock/users';
export { mockHospitals, hospitals, type HospitalInfo } from './mock/hospitals';
export { mockInventory, categories } from './mock/inventory';
export { mockSharedResources, type ResourceWithVisibility } from './mock/resources';
export { mockRequests, mockAlerts } from './mock/requests';
export { mockConversations, mockMessages } from './mock/messages';
export { mockRolePermissions, mockAuditLogs } from './mock/admin';
export { 
  mockForecastData, 
  mockKPIData,
  trendData,
  wastageData,
  abcVedData,
  daysOfSupplyData,
  clinicalImpactData,
  expiryRiskData,
  emergencyDepletionData,
  responseTimeData,
  fulfillmentTrendData
} from './mock/analytics';