#!/usr/bin/env python
"""
Django shell script to set up initial data for the hospital resource sharing system.
This script creates resource categories and registers sample hospitals.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta
from django.utils import timezone

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hospital_backend.settings')
import django
django.setup()

from resources.models import ResourceCategory, ResourceHospital

def create_resource_categories():
    """Create basic resource categories."""
    print("Creating resource categories...")
    
    categories = [
        {
            'name': 'Medications',
            'type': 'medication',
            'unit_of_measure': 'units',
            'description': 'Pharmaceutical medications',
            'requires_cold_chain': False,
        },
        {
            'name': 'Blood Products',
            'type': 'blood',
            'unit_of_measure': 'units',
            'requires_cold_chain': True,
            'max_transport_hours': 6,
            'description': 'Blood and blood components'
        },
        {
            'name': 'Medical Equipment',
            'type': 'equipment',
            'unit_of_measure': 'units',
            'description': 'Shareable medical equipment',
            'requires_cold_chain': False,
        },
        {
            'name': 'Organs',
            'type': 'organ',
            'unit_of_measure': 'organs',
            'max_transport_hours': 24,
            'description': 'Human organs for transplantation',
            'requires_cold_chain': True,
        },
        {
            'name': 'Hospital Beds',
            'type': 'bed',
            'unit_of_measure': 'beds',
            'description': 'Available hospital beds',
            'requires_cold_chain': False,
        }
    ]
    
    for cat_data in categories:
        category, created = ResourceCategory.objects.get_or_create(
            name=cat_data['name'],
            defaults=cat_data
        )
        status = "Created" if created else "Already exists"
        print(f"  {status}: {category.name}")
    
    print(f"Total categories: {ResourceCategory.objects.count()}")

def register_sample_hospitals():
    """Register sample hospitals in the network."""
    print("\nRegistering sample hospitals...")
    
    hospitals = [
        {
            'external_hospital_id': uuid.uuid4(),
            'name': 'Metro General Hospital',
            'city': 'New York',
            'region': 'Northeast',
            'total_beds': 850,
            'trust_level': 'high',
            'contact_email': 'admin@metro-general.com',
            'contact_phone': '+1-555-0100',
            'specialties': ['Cardiology', 'Oncology', 'Neurology', 'Emergency Medicine'],
            'coordinates_lat': 40.7128,
            'coordinates_lng': -74.0060,
            'is_active': True
        },
        {
            'external_hospital_id': uuid.uuid4(),
            'name': 'City Medical Center',
            'city': 'Los Angeles',
            'region': 'West Coast',
            'total_beds': 620,
            'trust_level': 'high',
            'contact_email': 'info@city-medical.com',
            'contact_phone': '+1-555-0200',
            'specialties': ['Pediatrics', 'Orthopedics', 'Trauma Center'],
            'coordinates_lat': 34.0522,
            'coordinates_lng': -118.2437,
            'is_active': True
        },
        {
            'external_hospital_id': uuid.uuid4(),
            'name': 'Regional Healthcare',
            'city': 'Chicago',
            'region': 'Midwest',
            'total_beds': 480,
            'trust_level': 'medium',
            'contact_email': 'contact@regional-health.org',
            'contact_phone': '+1-555-0300',
            'specialties': ['Internal Medicine', 'Surgery', 'Radiology'],
            'coordinates_lat': 41.8781,
            'coordinates_lng': -87.6298,
            'is_active': True
        },
        {
            'external_hospital_id': uuid.uuid4(),
            'name': 'University Hospital',
            'city': 'Boston',
            'region': 'Northeast',
            'total_beds': 750,
            'trust_level': 'high',
            'contact_email': 'admin@university-hospital.edu',
            'contact_phone': '+1-555-0400',
            'specialties': ['Research', 'Transplant Center', 'Specialized Care'],
            'coordinates_lat': 42.3601,
            'coordinates_lng': -71.0589,
            'is_active': True
        },
        {
            'external_hospital_id': uuid.uuid4(),
            'name': 'Community Health Center',
            'city': 'Miami',
            'region': 'Southeast',
            'total_beds': 320,
            'trust_level': 'medium',
            'contact_email': 'info@community-health.net',
            'contact_phone': '+1-555-0500',
            'specialties': ['Family Medicine', 'Women\'s Health', 'Geriatrics'],
            'coordinates_lat': 25.7617,
            'coordinates_lng': -80.1918,
            'is_active': True
        }
    ]
    
    for hosp_data in hospitals:
        hospital, created = ResourceHospital.objects.get_or_create(
            name=hosp_data['name'],
            defaults=hosp_data
        )
        status = "Created" if created else "Already exists"
        print(f"  {status}: {hospital.name} ({hospital.city})")
        if created:
            print(f"    External ID: {hospital.external_hospital_id}")
            print(f"    Trust Level: {hospital.trust_level}")
            print(f"    Beds: {hospital.total_beds}")
    
    print(f"Total hospitals: {ResourceHospital.objects.count()}")

def create_dummy_hospital_data():
    """Create some dummy hospital system data for testing sync."""
    print("\nCreating dummy hospital system data...")
    
    # Since we don't have the actual dummy database set up yet,
    # we'll create some mock data in the main database for testing
    from resources.models import SharedResource
    
    # Get categories and hospitals
    medication_cat = ResourceCategory.objects.get(name='Medications')
    blood_cat = ResourceCategory.objects.get(name='Blood Products')
    equipment_cat = ResourceCategory.objects.get(name='Medical Equipment')
    
    hospitals = ResourceHospital.objects.all()[:3]  # First 3 hospitals
    
    # Create sample shared resources
    sample_resources = []
    
    for hospital in hospitals:
        # Medications
        medications = [
            ('Amoxicillin 500mg', 1500, 'Antibiotic for infections'),
            ('Insulin Glargine', 200, 'Long-acting insulin'),
            ('Lisinopril 10mg', 800, 'ACE inhibitor for hypertension'),
        ]
        
        for med_name, quantity, description in medications:
            resource, created = SharedResource.objects.get_or_create(
                hospital=hospital,
                category=medication_cat,
                name=med_name,
                defaults={
                    'description': description,
                    'current_quantity': quantity,
                    'available_quantity': max(0, quantity - 100),  # Reserve 100 units
                    'minimum_reserve': 100,
                    'visibility_level': 'network',
                    'quality_grade': 'A',
                    'expiry_date': timezone.now().date() + timedelta(days=180),
                }
            )
            if created:
                sample_resources.append(resource)
        
        # Blood products
        blood_types = ['O+', 'A+', 'B+', 'AB+']
        for blood_type in blood_types:
            resource, created = SharedResource.objects.get_or_create(
                hospital=hospital,
                category=blood_cat,
                name=f'{blood_type} Packed Red Blood Cells',
                defaults={
                    'description': f'{blood_type} blood type packed RBCs',
                    'current_quantity': 25,
                    'available_quantity': 20,
                    'reserved_quantity': 5,
                    'minimum_reserve': 5,
                    'visibility_level': 'emergency_only',
                    'is_emergency_stock': True,
                    'quality_grade': 'A',
                    'expiry_date': timezone.now().date() + timedelta(days=35),
                    'storage_requirements': 'Refrigerated storage at 2-6°C'
                }
            )
            if created:
                sample_resources.append(resource)
        
        # Equipment
        equipment_items = [
            ('Portable Ventilator', 'Life support equipment'),
            ('Mobile X-Ray Unit', 'Diagnostic imaging equipment'),
            ('Defibrillator', 'Emergency cardiac equipment'),
        ]
        
        for eq_name, description in equipment_items:
            resource, created = SharedResource.objects.get_or_create(
                hospital=hospital,
                category=equipment_cat,
                name=eq_name,
                defaults={
                    'description': description,
                    'current_quantity': 1,
                    'available_quantity': 1,
                    'visibility_level': 'network',
                    'quality_grade': 'A',
                }
            )
            if created:
                sample_resources.append(resource)
    
    print(f"Created {len(sample_resources)} sample resources")
    return sample_resources

def main():
    """Main setup function."""
    print("🏥 Hospital Resource Sharing System Setup")
    print("=" * 50)
    
    try:
        # Create resource categories
        create_resource_categories()
        
        # Register sample hospitals
        register_sample_hospitals()
        
        # Create some sample data
        create_dummy_hospital_data()
        
        print("\n✅ Setup completed successfully!")
        print("\nNext steps:")
        print("1. Test the sync command: python manage.py sync_hospital_resources --dry-run")
        print("2. Access Django admin: http://localhost:8000/admin/")
        print("3. Monitor sync logs in the admin interface")
        
        # Display summary
        print(f"\nSummary:")
        print(f"- Resource Categories: {ResourceCategory.objects.count()}")
        print(f"- Registered Hospitals: {ResourceHospital.objects.count()}")
        print(f"- Shared Resources: {SharedResource.objects.count()}")
        
    except Exception as e:
        print(f"❌ Setup failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)