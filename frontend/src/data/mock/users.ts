import { User, Employee } from '@/types/healthcare';

export const mockUsers: User[] = [
  { id: '1', name: 'Dr. Sarah Chen', email: 'sarah.chen@metro.health', role: 'admin', hospital: 'Metro General Hospital' },
  { id: '2', name: 'James Wilson', email: 'james.wilson@metro.health', role: 'pharmacist', hospital: 'Metro General Hospital' },
  { id: '3', name: 'Dr. Emily Roberts', email: 'emily.roberts@city.health', role: 'doctor', hospital: 'City Medical Center' },
  { id: '4', name: 'Michael Brown', email: 'michael.brown@regional.health', role: 'coordinator', hospital: 'Regional Healthcare' },
  { id: '5', name: 'Lisa Thompson', email: 'lisa.thompson@health.gov', role: 'regulator', hospital: 'Health Authority' },
];

export const mockEmployees: Employee[] = [
  // Metro General Hospital
  { id: 'emp1', name: 'Dr. Sarah Chen', email: 'sarah.chen@metro.health', role: 'doctor', hospital: 'Metro General Hospital', department: 'Cardiology', isOnline: true, specialization: 'Interventional Cardiology', phoneNumber: '+1-555-0101' },
  { id: 'emp2', name: 'James Wilson', email: 'james.wilson@metro.health', role: 'pharmacist', hospital: 'Metro General Hospital', department: 'Pharmacy', isOnline: true, specialization: 'Clinical Pharmacy', phoneNumber: '+1-555-0102' },
  { id: 'emp3', name: 'Nurse Maria Rodriguez', email: 'maria.rodriguez@metro.health', role: 'nurse', hospital: 'Metro General Hospital', department: 'Emergency', isOnline: true, specialization: 'Emergency Nursing', phoneNumber: '+1-555-0103' },
  { id: 'emp4', name: 'Dr. Robert Kim', email: 'robert.kim@metro.health', role: 'doctor', hospital: 'Metro General Hospital', department: 'Neurology', isOnline: false, lastSeen: '2024-12-28T08:30:00', specialization: 'Neurosurgery', phoneNumber: '+1-555-0104' },
  { id: 'emp5', name: 'Nurse Jennifer Lee', email: 'jennifer.lee@metro.health', role: 'nurse', hospital: 'Metro General Hospital', department: 'ICU', isOnline: true, specialization: 'Critical Care', phoneNumber: '+1-555-0105' },
  { id: 'emp6', name: 'Tech David Park', email: 'david.park@metro.health', role: 'technician', hospital: 'Metro General Hospital', department: 'Radiology', isOnline: false, lastSeen: '2024-12-28T07:45:00', specialization: 'MRI Tech', phoneNumber: '+1-555-0106' },
  
  // City Medical Center
  { id: 'emp7', name: 'Dr. Emily Roberts', email: 'emily.roberts@city.health', role: 'doctor', hospital: 'City Medical Center', department: 'Pediatrics', isOnline: true, specialization: 'Pediatric Oncology', phoneNumber: '+1-555-0201' },
  { id: 'emp8', name: 'Dr. Alan Thompson', email: 'alan.thompson@city.health', role: 'doctor', hospital: 'City Medical Center', department: 'Orthopedics', isOnline: false, lastSeen: '2024-12-28T09:15:00', specialization: 'Spine Surgery', phoneNumber: '+1-555-0202' },
  { id: 'emp9', name: 'Pharmacist Lisa Chang', email: 'lisa.chang@city.health', role: 'pharmacist', hospital: 'City Medical Center', department: 'Pharmacy', isOnline: true, specialization: 'Pediatric Pharmacy', phoneNumber: '+1-555-0203' },
  { id: 'emp10', name: 'Nurse Tom Anderson', email: 'tom.anderson@city.health', role: 'nurse', hospital: 'City Medical Center', department: 'Pediatrics', isOnline: true, specialization: 'Pediatric Nursing', phoneNumber: '+1-555-0204' },
  { id: 'emp11', name: 'Admin Sarah Williams', email: 'sarah.williams@city.health', role: 'admin', hospital: 'City Medical Center', department: 'Administration', isOnline: true, phoneNumber: '+1-555-0205' },
  
  // Regional Healthcare
  { id: 'emp12', name: 'Michael Brown', email: 'michael.brown@regional.health', role: 'coordinator', hospital: 'Regional Healthcare', department: 'Logistics', isOnline: true, phoneNumber: '+1-555-0301' },
  { id: 'emp13', name: 'Dr. Patricia Davis', email: 'patricia.davis@regional.health', role: 'doctor', hospital: 'Regional Healthcare', department: 'Internal Medicine', isOnline: false, lastSeen: '2024-12-28T06:20:00', specialization: 'Gastroenterology', phoneNumber: '+1-555-0302' },
  { id: 'emp14', name: 'Nurse Chris Johnson', email: 'chris.johnson@regional.health', role: 'nurse', hospital: 'Regional Healthcare', department: 'Surgery', isOnline: true, specialization: 'OR Nursing', phoneNumber: '+1-555-0303' },
  { id: 'emp15', name: 'Pharmacist Amy White', email: 'amy.white@regional.health', role: 'pharmacist', hospital: 'Regional Healthcare', department: 'Pharmacy', isOnline: true, specialization: 'Hospital Pharmacy', phoneNumber: '+1-555-0304' },
  
  // University Hospital
  { id: 'emp16', name: 'Dr. Mark Sullivan', email: 'mark.sullivan@university.health', role: 'doctor', hospital: 'University Hospital', department: 'Transplant Center', isOnline: true, specialization: 'Kidney Transplant', phoneNumber: '+1-555-0401' },
  { id: 'emp17', name: 'Dr. Rachel Green', email: 'rachel.green@university.health', role: 'doctor', hospital: 'University Hospital', department: 'Research', isOnline: true, specialization: 'Clinical Research', phoneNumber: '+1-555-0402' },
  { id: 'emp18', name: 'Nurse Michelle Taylor', email: 'michelle.taylor@university.health', role: 'nurse', hospital: 'University Hospital', department: 'Transplant Center', isOnline: false, lastSeen: '2024-12-28T05:30:00', specialization: 'Transplant Nursing', phoneNumber: '+1-555-0403' },
  { id: 'emp19', name: 'Coordinator Steve Miller', email: 'steve.miller@university.health', role: 'coordinator', hospital: 'University Hospital', department: 'Research', isOnline: true, phoneNumber: '+1-555-0404' },
  
  // Community Health Center
  { id: 'emp20', name: 'Dr. Linda Garcia', email: 'linda.garcia@community.health', role: 'doctor', hospital: 'Community Health Center', department: 'Family Medicine', isOnline: true, specialization: 'Family Practice', phoneNumber: '+1-555-0501' },
  { id: 'emp21', name: 'Nurse Betty Martinez', email: 'betty.martinez@community.health', role: 'nurse', hospital: 'Community Health Center', department: 'Women\'s Health', isOnline: true, specialization: 'Women\'s Health', phoneNumber: '+1-555-0502' },
  { id: 'emp22', name: 'Dr. John Wilson', email: 'john.wilson@community.health', role: 'doctor', hospital: 'Community Health Center', department: 'Geriatrics', isOnline: false, lastSeen: '2024-12-28T08:00:00', specialization: 'Geriatric Medicine', phoneNumber: '+1-555-0503' }
];