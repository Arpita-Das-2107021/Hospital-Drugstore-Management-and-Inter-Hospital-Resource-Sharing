import { ResourceRequest, Alert } from '@/types/healthcare';

export const mockRequests: ResourceRequest[] = [
  { id: '1', resourceName: 'O-Negative Blood', resourceType: 'blood', requestingHospital: 'City Medical Center', providingHospital: 'Metro General Hospital', quantity: 5, urgency: 'critical', status: 'approved', justification: 'Emergency surgery patient', requestedAt: '2024-12-28T06:30:00', updatedAt: '2024-12-28T06:45:00' },
  { id: '2', resourceName: 'Ventilator', resourceType: 'equipment', requestingHospital: 'Metro General Hospital', providingHospital: 'Regional Healthcare', quantity: 1, urgency: 'urgent', status: 'in_transit', justification: 'ICU capacity increase', requestedAt: '2024-12-27T14:00:00', updatedAt: '2024-12-28T08:00:00' },
  { id: '3', resourceName: 'Remdesivir 100mg', resourceType: 'drugs', requestingHospital: 'Regional Healthcare', providingHospital: 'Metro General Hospital', quantity: 30, urgency: 'routine', status: 'pending', requestedAt: '2024-12-28T09:00:00', updatedAt: '2024-12-28T09:00:00' },
  { id: '4', resourceName: 'Kidney (Compatible)', resourceType: 'organs', requestingHospital: 'City Medical Center', providingHospital: 'University Hospital', quantity: 1, urgency: 'critical', status: 'in_transit', justification: 'Transplant patient critical condition', requestedAt: '2024-12-28T05:45:00', updatedAt: '2024-12-28T07:30:00' },
  { id: '5', resourceName: 'A-Positive Blood', resourceType: 'blood', requestingHospital: 'Metro General Hospital', providingHospital: 'City Medical Center', quantity: 3, urgency: 'urgent', status: 'pending', requestedAt: '2024-12-28T08:15:00', updatedAt: '2024-12-28T08:15:00' },
  { id: '6', resourceName: 'Tocilizumab 400mg', resourceType: 'drugs', requestingHospital: 'Regional Healthcare', providingHospital: 'University Hospital', quantity: 10, urgency: 'routine', status: 'delivered', requestedAt: '2024-12-26T10:00:00', updatedAt: '2024-12-27T16:00:00' },
];

export const mockAlerts: Alert[] = [
  { id: '1', type: 'shortage', severity: 'critical', title: 'Critical Stock Alert', message: 'Morphine 10mg stock below minimum threshold (50 units remaining)', hospital: 'Metro General Hospital', resourceId: '9', isRead: false, createdAt: '2024-12-28T10:30:00' },
  { id: '2', type: 'expiry', severity: 'warning', title: 'Expiring Soon', message: 'Insulin Glargine batch expires in 82 days', hospital: 'Metro General Hospital', resourceId: '2', isRead: false, createdAt: '2024-12-28T09:00:00' },
  { id: '3', type: 'emergency', severity: 'critical', title: 'Emergency Request', message: 'Kidney transplant request from City Medical Center requires immediate attention', hospital: 'University Hospital', isRead: false, createdAt: '2024-12-28T06:00:00' },
  { id: '4', type: 'substitution', severity: 'info', title: 'Substitution Available', message: 'Generic alternative available for Omeprazole at 40% lower cost', hospital: 'Metro General Hospital', resourceId: '6', isRead: true, createdAt: '2024-12-27T15:30:00' },
  { id: '5', type: 'shortage', severity: 'warning', title: 'Low Stock Warning', message: 'Ceftriaxone 1g approaching reorder level (80 units)', hospital: 'Metro General Hospital', resourceId: '11', isRead: false, createdAt: '2024-12-28T08:45:00' },
  { id: '6', type: 'expiry', severity: 'critical', title: 'Batch Expiring', message: 'Morphine 10mg batch MOR-2024-0089 expires in 62 days - 30 units affected', hospital: 'Metro General Hospital', resourceId: '9', isRead: false, createdAt: '2024-12-28T07:15:00' },
];