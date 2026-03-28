export interface HospitalInfo {
  id: string;
  name: string;
  city: string;
  region: string;
  address: string;
  image: string;
  coordinates: { lat: number; lng: number };
  beds: number;
  specialties: string[];
}

export const mockHospitals: HospitalInfo[] = [
  {
    id: '1',
    name: 'Metro General Hospital',
    city: 'New York',
    region: 'Northeast',
    address: '123 Medical Center Dr, New York, NY 10001',
    image: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=400&h=300&fit=crop',
    coordinates: { lat: 40.7128, lng: -74.006 },
    beds: 850,
    specialties: ['Cardiology', 'Oncology', 'Neurology', 'Emergency Medicine']
  },
  {
    id: '2',
    name: 'City Medical Center',
    city: 'Los Angeles',
    region: 'West Coast',
    address: '456 Health Blvd, Los Angeles, CA 90012',
    image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400&h=300&fit=crop',
    coordinates: { lat: 34.0522, lng: -118.2437 },
    beds: 620,
    specialties: ['Pediatrics', 'Orthopedics', 'Trauma Center']
  },
  {
    id: '3',
    name: 'Regional Healthcare',
    city: 'Chicago',
    region: 'Midwest',
    address: '789 Care Ave, Chicago, IL 60601',
    image: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=400&h=300&fit=crop',
    coordinates: { lat: 41.8781, lng: -87.6298 },
    beds: 480,
    specialties: ['Internal Medicine', 'Surgery', 'Radiology']
  },
  {
    id: '4',
    name: 'University Hospital',
    city: 'Boston',
    region: 'Northeast',
    address: '321 Academic Way, Boston, MA 02115',
    image: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=400&h=300&fit=crop',
    coordinates: { lat: 42.3601, lng: -71.0589 },
    beds: 920,
    specialties: ['Research', 'Transplant Center', 'Rare Diseases']
  },
  {
    id: '5',
    name: 'Community Health Center',
    city: 'Houston',
    region: 'South',
    address: '567 Wellness St, Houston, TX 77001',
    image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=400&h=300&fit=crop',
    coordinates: { lat: 29.7604, lng: -95.3698 },
    beds: 320,
    specialties: ['Family Medicine', 'Women\'s Health', 'Geriatrics']
  },
  {
    id: '6',
    name: 'Pacific Coast Medical',
    city: 'San Francisco',
    region: 'West Coast',
    address: '890 Bay View Rd, San Francisco, CA 94102',
    image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=400&h=300&fit=crop',
    coordinates: { lat: 37.7749, lng: -122.4194 },
    beds: 550,
    specialties: ['Dermatology', 'Ophthalmology', 'Mental Health']
  },
  {
    id: '7',
    name: 'Mountain View Hospital',
    city: 'Denver',
    region: 'Mountain',
    address: '234 Alpine Dr, Denver, CO 80202',
    image: 'https://images.unsplash.com/photo-1632833239869-a37e3a5806d2?w=400&h=300&fit=crop',
    coordinates: { lat: 39.7392, lng: -104.9903 },
    beds: 410,
    specialties: ['Sports Medicine', 'Pulmonology', 'Rehabilitation']
  },
  {
    id: '8',
    name: 'Sunrise Medical Center',
    city: 'Phoenix',
    region: 'Southwest',
    address: '678 Desert Blvd, Phoenix, AZ 85001',
    image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop',
    coordinates: { lat: 33.4484, lng: -112.074 },
    beds: 380,
    specialties: ['Urology', 'Gastroenterology', 'Endocrinology']
  }
];

export const hospitals = [
  'Metro General Hospital',
  'City Medical Center',
  'Regional Healthcare',
  'University Hospital',
  'Community Health Center',
  'Pacific Coast Medical',
  'Mountain View Hospital',
  'Sunrise Medical Center',
];