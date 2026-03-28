// All runtime data is fetched from the API.
// This file re-exports types for backward compatibility.
export type { ResourceWithVisibility } from '@/types/healthcare';

// Legacy empty stubs — pages should import from API services, not these
export const mockRequests: unknown[] = [];
export const mockConversations: unknown[] = [];
export const mockMessages: unknown[] = [];
export const mockEmployees: unknown[] = [];
export const mockHospitals: unknown[] = [];
export const mockSharedResources: unknown[] = [];
export const hospitals: unknown[] = [];
export const categories: string[] = [];
