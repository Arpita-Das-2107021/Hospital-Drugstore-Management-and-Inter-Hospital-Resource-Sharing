import { RolePermission, AuditLog } from '@/types/healthcare';

export const mockRolePermissions: RolePermission[] = [
  { role: 'admin', permissions: { inventory: { read: true, write: true, admin: true }, sharing: { read: true, write: true, admin: true }, communication: { read: true, write: true, admin: true }, admin: { read: true, write: true, admin: true }, reports: { read: true, write: true, admin: true } } },
  { role: 'pharmacist', permissions: { inventory: { read: true, write: true, admin: false }, sharing: { read: true, write: true, admin: false }, communication: { read: true, write: true, admin: false }, admin: { read: false, write: false, admin: false }, reports: { read: true, write: false, admin: false } } },
  { role: 'doctor', permissions: { inventory: { read: true, write: false, admin: false }, sharing: { read: true, write: true, admin: false }, communication: { read: true, write: true, admin: false }, admin: { read: false, write: false, admin: false }, reports: { read: true, write: false, admin: false } } },
  { role: 'coordinator', permissions: { inventory: { read: true, write: false, admin: false }, sharing: { read: true, write: true, admin: true }, communication: { read: true, write: true, admin: false }, admin: { read: true, write: false, admin: false }, reports: { read: true, write: true, admin: false } } },
  { role: 'regulator', permissions: { inventory: { read: true, write: false, admin: false }, sharing: { read: true, write: false, admin: false }, communication: { read: true, write: false, admin: false }, admin: { read: true, write: false, admin: false }, reports: { read: true, write: false, admin: false } } },
];

export const mockAuditLogs: AuditLog[] = [
  { id: '1', action: 'Stock Updated', user: 'James Wilson', resource: 'Amoxicillin 500mg', details: 'Added 500 units to inventory', timestamp: '2024-12-28T10:30:00' },
  { id: '2', action: 'Request Approved', user: 'Dr. Sarah Chen', resource: 'O-Negative Blood', details: 'Approved transfer to City Medical Center', timestamp: '2024-12-28T06:45:00' },
  { id: '3', action: 'Permission Modified', user: 'System Admin', resource: 'Pharmacist Role', details: 'Added write access to reports module', timestamp: '2024-12-27T14:20:00' },
  { id: '4', action: 'Data Import', user: 'Michael Brown', resource: 'Inventory', details: 'Imported 156 items from CSV', timestamp: '2024-12-26T09:15:00' },
  { id: '5', action: 'Alert Resolved', user: 'James Wilson', resource: 'Morphine 10mg', details: 'Stock replenishment order placed', timestamp: '2024-12-28T11:00:00' },
];