// All runtime data is fetched from the API.
// This file re-exports types for backward compatibility.
export type { ResourceWithVisibility } from '@/types/healthcare';

// Legacy empty stubs — pages should import from API services, not these
export const mockRequests: any[] = [];
export const mockConversations: any[] = [];
export const mockMessages: any[] = [];
export const mockEmployees: any[] = [];
export const mockHospitals: any[] = [];
export const mockSharedResources: any[] = [];
export const hospitals: any[] = [];
export const categories: string[] = [];
