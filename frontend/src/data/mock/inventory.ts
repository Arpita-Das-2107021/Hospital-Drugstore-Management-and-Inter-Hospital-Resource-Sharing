import { InventoryItem } from '@/types/healthcare';

export const mockInventory: InventoryItem[] = [
  { id: '1', name: 'Amoxicillin 500mg', category: 'Antibiotics', abcClassification: 'A', vedClassification: 'V', currentStock: 1500, reorderLevel: 500, maxStock: 3000, unitPrice: 0.45, expiryDate: '2025-06-15', supplier: 'PharmaCorp', lastUpdated: '2024-12-20', hospital: 'Metro General Hospital' },
  { id: '2', name: 'Insulin Glargine', category: 'Diabetes', abcClassification: 'A', vedClassification: 'V', currentStock: 200, reorderLevel: 100, maxStock: 500, unitPrice: 45.00, expiryDate: '2025-03-20', supplier: 'DiabetaCare', lastUpdated: '2024-12-22', hospital: 'Metro General Hospital' },
  { id: '3', name: 'Paracetamol 500mg', category: 'Pain Relief', abcClassification: 'A', vedClassification: 'E', currentStock: 5000, reorderLevel: 1000, maxStock: 10000, unitPrice: 0.10, expiryDate: '2026-01-10', supplier: 'GenericMeds', lastUpdated: '2024-12-21', hospital: 'Metro General Hospital' },
  { id: '4', name: 'Metformin 850mg', category: 'Diabetes', abcClassification: 'A', vedClassification: 'V', currentStock: 800, reorderLevel: 300, maxStock: 2000, unitPrice: 0.35, expiryDate: '2025-08-25', supplier: 'DiabetaCare', lastUpdated: '2024-12-19', hospital: 'Metro General Hospital' },
  { id: '5', name: 'Lisinopril 10mg', category: 'Cardiovascular', abcClassification: 'A', vedClassification: 'V', currentStock: 450, reorderLevel: 200, maxStock: 1000, unitPrice: 0.28, expiryDate: '2025-09-15', supplier: 'CardioPharm', lastUpdated: '2024-12-23', hospital: 'Metro General Hospital' },
  { id: '6', name: 'Omeprazole 20mg', category: 'Gastrointestinal', abcClassification: 'B', vedClassification: 'E', currentStock: 1200, reorderLevel: 400, maxStock: 2500, unitPrice: 0.55, expiryDate: '2025-07-30', supplier: 'GastroMed', lastUpdated: '2024-12-20', hospital: 'Metro General Hospital' },
  { id: '7', name: 'Amlodipine 5mg', category: 'Cardiovascular', abcClassification: 'A', vedClassification: 'V', currentStock: 320, reorderLevel: 150, maxStock: 800, unitPrice: 0.32, expiryDate: '2025-11-20', supplier: 'CardioPharm', lastUpdated: '2024-12-18', hospital: 'Metro General Hospital' },
  { id: '8', name: 'Salbutamol Inhaler', category: 'Respiratory', abcClassification: 'B', vedClassification: 'V', currentStock: 150, reorderLevel: 80, maxStock: 400, unitPrice: 8.50, expiryDate: '2025-04-10', supplier: 'RespiraCare', lastUpdated: '2024-12-22', hospital: 'Metro General Hospital' },
  { id: '9', name: 'Morphine 10mg', category: 'Pain Relief', abcClassification: 'B', vedClassification: 'V', currentStock: 50, reorderLevel: 30, maxStock: 150, unitPrice: 2.80, expiryDate: '2025-02-28', supplier: 'ControlledMeds', lastUpdated: '2024-12-21', hospital: 'Metro General Hospital' },
  { id: '10', name: 'Vitamin D3 1000IU', category: 'Vitamins', abcClassification: 'C', vedClassification: 'D', currentStock: 2000, reorderLevel: 500, maxStock: 5000, unitPrice: 0.08, expiryDate: '2026-06-01', supplier: 'VitaSupply', lastUpdated: '2024-12-20', hospital: 'Metro General Hospital' },
  { id: '11', name: 'Ceftriaxone 1g', category: 'Antibiotics', abcClassification: 'A', vedClassification: 'V', currentStock: 80, reorderLevel: 50, maxStock: 200, unitPrice: 12.50, expiryDate: '2025-05-15', supplier: 'PharmaCorp', lastUpdated: '2024-12-23', hospital: 'Metro General Hospital' },
  { id: '12', name: 'Warfarin 5mg', category: 'Cardiovascular', abcClassification: 'B', vedClassification: 'V', currentStock: 180, reorderLevel: 100, maxStock: 500, unitPrice: 0.65, expiryDate: '2025-10-05', supplier: 'CardioPharm', lastUpdated: '2024-12-19', hospital: 'Metro General Hospital' },
];

export const categories = [
  'Antibiotics',
  'Cardiovascular',
  'Diabetes',
  'Pain Relief',
  'Respiratory',
  'Gastrointestinal',
  'Vitamins',
];