"""
Management command to seed initial data for the system
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
import uuid

from resources.models import (
    ResourceHospital, ResourceCategory, SharedResource, 
    UserProfile, ResourceRequest, Alert, RolePermission, 
    InventoryItem, BedOccupancy
)


class Command(BaseCommand):
    help = 'Seed initial data for the resource sharing system'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.SUCCESS('Starting data seeding...'))
        
        # Seed Hospitals
        self.seed_hospitals()
        
        # Seed Resource Categories
        self.seed_categories()
        
        # Seed Users
        self.seed_users()
        
        # Seed Shared Resources
        self.seed_shared_resources()
        
        # Seed Inventory Items
        self.seed_inventory()
        
        # Seed Resource Requests
        self.seed_requests()
        
        # Seed Alerts
        self.seed_alerts()
        
        # Seed Role Permissions
        self.seed_permissions()
        
        # Seed Bed Occupancy
        self.seed_bed_occupancy()
        
        self.stdout.write(self.style.SUCCESS('Data seeding completed successfully!'))
    
    def seed_hospitals(self):
        """Seed hospital data"""
        hospitals_data = [
            {'name': 'Metro General Hospital', 'city': 'New York', 'region': 'Northeast', 
             'coordinates_lat': 40.7128, 'coordinates_lng': -74.0060, 'total_beds': 850,
             'specialties': ['Cardiology', 'Oncology', 'Neurology', 'Emergency Medicine'],
             'contact_email': 'admin@metro.health', 'contact_phone': '+1-555-0100'},
            {'name': 'City Medical Center', 'city': 'Los Angeles', 'region': 'West Coast',
             'coordinates_lat': 34.0522, 'coordinates_lng': -118.2437, 'total_beds': 620,
             'specialties': ['Pediatrics', 'Orthopedics', 'Trauma Center'],
             'contact_email': 'info@city.health', 'contact_phone': '+1-555-0200'},
            {'name': 'Regional Healthcare', 'city': 'Chicago', 'region': 'Midwest',
             'coordinates_lat': 41.8781, 'coordinates_lng': -87.6298, 'total_beds': 480,
             'specialties': ['Internal Medicine', 'Surgery', 'Radiology'],
             'contact_email': 'contact@regional.health', 'contact_phone': '+1-555-0300'},
            {'name': 'University Hospital', 'city': 'Boston', 'region': 'Northeast',
             'coordinates_lat': 42.3601, 'coordinates_lng': -71.0589, 'total_beds': 920,
             'specialties': ['Research', 'Transplant Center', 'Rare Diseases'],
             'contact_email': 'admin@university.health', 'contact_phone': '+1-555-0400'},
            {'name': 'Community Health Center', 'city': 'Houston', 'region': 'South',
             'coordinates_lat': 29.7604, 'coordinates_lng': -95.3698, 'total_beds': 320,
             'specialties': ["Family Medicine", "Women's Health", "Geriatrics"],
             'contact_email': 'info@community.health', 'contact_phone': '+1-555-0500'},
        ]
        
        for data in hospitals_data:
            data['external_hospital_id'] = uuid.uuid4()
            ResourceHospital.objects.get_or_create(
                name=data['name'],
                defaults=data
            )
        
        self.stdout.write(self.style.SUCCESS(f'Created {len(hospitals_data)} hospitals'))
    
    def seed_categories(self):
        """Seed resource categories"""
        categories_data = [
            {'name': 'Antibiotics', 'type': 'medication', 'unit_of_measure': 'units'},
            {'name': 'Pain Relief', 'type': 'medication', 'unit_of_measure': 'units'},
            {'name': 'Cardiovascular', 'type': 'medication', 'unit_of_measure': 'units'},
            {'name': 'Diabetes', 'type': 'medication', 'unit_of_measure': 'units'},
            {'name': 'O-Negative Blood', 'type': 'blood', 'unit_of_measure': 'units', 'requires_cold_chain': True},
            {'name': 'A-Positive Blood', 'type': 'blood', 'unit_of_measure': 'units', 'requires_cold_chain': True},
            {'name': 'Ventilator', 'type': 'equipment', 'unit_of_measure': 'units'},
            {'name': 'ECMO Machine', 'type': 'equipment', 'unit_of_measure': 'units'},
            {'name': 'Kidney', 'type': 'organ', 'unit_of_measure': 'organs', 'max_transport_hours': 24},
        ]
        
        for data in categories_data:
            ResourceCategory.objects.get_or_create(
                name=data['name'],
                defaults=data
            )
        
        self.stdout.write(self.style.SUCCESS(f'Created {len(categories_data)} categories'))
    
    def seed_users(self):
        """Seed user profiles with proper authentication"""
        from django.contrib.auth.models import User
        
        hospitals = list(ResourceHospital.objects.all())
        if not hospitals:
            return
        
        users_data = [
            {'full_name': 'Dr. Sarah Chen', 'email': 'sarah.chen@metro.health', 'role': 'admin', 
             'hospital': hospitals[0], 'department': 'Administration', 'password': 'demo1234'},
            {'full_name': 'James Wilson', 'email': 'james.wilson@metro.health', 'role': 'pharmacist',
             'hospital': hospitals[0], 'department': 'Pharmacy', 'password': 'demo1234'},
            {'full_name': 'Dr. Emily Roberts', 'email': 'emily.roberts@city.health', 'role': 'doctor',
             'hospital': hospitals[1], 'department': 'Pediatrics', 'password': 'demo1234'},
            {'full_name': 'Michael Brown', 'email': 'michael.brown@regional.health', 'role': 'coordinator',
             'hospital': hospitals[2] if len(hospitals) > 2 else hospitals[0], 'department': 'Logistics', 'password': 'demo1234'},
        ]
        
        for data in users_data:
            # Create or get Django user with properly hashed password
            user, user_created = User.objects.get_or_create(
                username=data['email'],
                defaults={
                    'email': data['email'],
                    'first_name': data['full_name'].split()[0] if data['full_name'] else '',
                    'last_name': ' '.join(data['full_name'].split()[1:]) if len(data['full_name'].split()) > 1 else ''
                }
            )
            
            # Always set password (Django will hash it) - ensures existing users get updated passwords
            user.set_password(data['password'])
            user.save()
            
            # Create or get user profile
            user_profile, profile_created = UserProfile.objects.get_or_create(
                email=data['email'],
                defaults={
                    'full_name': data['full_name'],
                    'role': data['role'],
                    'hospital': data['hospital'],
                    'department': data.get('department', '')
                }
            )
        
        self.stdout.write(self.style.SUCCESS(f'Created {len(users_data)} users with password: demo1234'))

    
    def seed_shared_resources(self):
        """Seed shared resources"""
        hospitals = list(ResourceHospital.objects.all())
        categories = list(ResourceCategory.objects.all())
        
        if not hospitals or not categories:
            return
        
        # Create some sample shared resources
        blood_cat = ResourceCategory.objects.filter(type='blood').first()
        equipment_cat = ResourceCategory.objects.filter(type='equipment').first()
        
        if blood_cat:
            SharedResource.objects.get_or_create(
                name='O-Negative Blood',
                hospital=hospitals[0],
                category=blood_cat,
                defaults={
                    'description': 'Universal donor blood type',
                    'current_quantity': 25,
                    'available_quantity': 25,
                    'visibility_level': 'public',
                    'expiry_date': timezone.now().date() + timedelta(days=15)
                }
            )
        
        if equipment_cat:
            SharedResource.objects.get_or_create(
                name='Ventilator',
                hospital=hospitals[2] if len(hospitals) > 2 else hospitals[0],
                category=equipment_cat,
                defaults={
                    'description': 'ICU-grade mechanical ventilator',
                    'current_quantity': 3,
                    'available_quantity': 3,
                    'visibility_level': 'public',
                }
            )
        
        self.stdout.write(self.style.SUCCESS('Created shared resources'))
    
    def seed_inventory(self):
        """Seed comprehensive inventory items for all hospitals"""
        hospitals = list(ResourceHospital.objects.all())
        if not hospitals:
            return
        
        # Comprehensive medication inventory for each hospital
        medications_template = [
            # Antibiotics
            {'name': 'Amoxicillin 500mg', 'category': 'Antibiotics', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 1500, 'reorder_level': 500, 'max_stock': 3000,
             'unit_price': 0.45, 'expiry_days': 180, 'supplier': 'PharmaCorp'},
            {'name': 'Azithromycin 250mg', 'category': 'Antibiotics', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 800, 'reorder_level': 300, 'max_stock': 1500,
             'unit_price': 1.20, 'expiry_days': 210, 'supplier': 'PharmaCorp'},
            {'name': 'Ciprofloxacin 500mg', 'category': 'Antibiotics', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 450, 'reorder_level': 200, 'max_stock': 1000,
             'unit_price': 0.85, 'expiry_days': 90, 'supplier': 'MediSupply'},
            {'name': 'Doxycycline 100mg', 'category': 'Antibiotics', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 600, 'reorder_level': 250, 'max_stock': 1200,
             'unit_price': 0.65, 'expiry_days': 240, 'supplier': 'PharmaCorp'},
            
            # Pain Relief
            {'name': 'Paracetamol 500mg', 'category': 'Pain Relief', 'abc_classification': 'A',
             'ved_classification': 'E', 'current_stock': 5000, 'reorder_level': 1000, 'max_stock': 10000,
             'unit_price': 0.10, 'expiry_days': 365, 'supplier': 'GenericMeds'},
            {'name': 'Ibuprofen 400mg', 'category': 'Pain Relief', 'abc_classification': 'A',
             'ved_classification': 'E', 'current_stock': 3500, 'reorder_level': 800, 'max_stock': 7000,
             'unit_price': 0.15, 'expiry_days': 300, 'supplier': 'GenericMeds'},
            {'name': 'Morphine 10mg', 'category': 'Pain Relief', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 180, 'reorder_level': 100, 'max_stock': 500,
             'unit_price': 5.50, 'expiry_days': 150, 'supplier': 'ControlledMeds'},
            {'name': 'Tramadol 50mg', 'category': 'Pain Relief', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 950, 'reorder_level': 400, 'max_stock': 2000,
             'unit_price': 0.75, 'expiry_days': 200, 'supplier': 'MediSupply'},
            
            # Cardiovascular
            {'name': 'Atorvastatin 20mg', 'category': 'Cardiovascular', 'abc_classification': 'A',
             'ved_classification': 'E', 'current_stock': 2200, 'reorder_level': 600, 'max_stock': 4000,
             'unit_price': 0.35, 'expiry_days': 270, 'supplier': 'CardioPharm'},
            {'name': 'Amlodipine 5mg', 'category': 'Cardiovascular', 'abc_classification': 'A',
             'ved_classification': 'E', 'current_stock': 1800, 'reorder_level': 500, 'max_stock': 3500,
             'unit_price': 0.25, 'expiry_days': 320, 'supplier': 'CardioPharm'},
            {'name': 'Metoprolol 50mg', 'category': 'Cardiovascular', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 1200, 'reorder_level': 400, 'max_stock': 2500,
             'unit_price': 0.40, 'expiry_days': 280, 'supplier': 'CardioPharm'},
            {'name': 'Aspirin 75mg', 'category': 'Cardiovascular', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 4500, 'reorder_level': 1000, 'max_stock': 8000,
             'unit_price': 0.05, 'expiry_days': 400, 'supplier': 'GenericMeds'},
            
            # Diabetes
            {'name': 'Metformin 500mg', 'category': 'Diabetes', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 2800, 'reorder_level': 700, 'max_stock': 5000,
             'unit_price': 0.20, 'expiry_days': 350, 'supplier': 'DiabetesCare'},
            {'name': 'Glimepiride 2mg', 'category': 'Diabetes', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 1100, 'reorder_level': 350, 'max_stock': 2200,
             'unit_price': 0.55, 'expiry_days': 290, 'supplier': 'DiabetesCare'},
            {'name': 'Insulin Glargine 100U/ml', 'category': 'Diabetes', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 250, 'reorder_level': 100, 'max_stock': 600,
             'unit_price': 25.00, 'expiry_days': 120, 'supplier': 'DiabetesCare'},
            
            # Respiratory
            {'name': 'Salbutamol Inhaler 100mcg', 'category': 'Respiratory', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 550, 'reorder_level': 200, 'max_stock': 1000,
             'unit_price': 4.50, 'expiry_days': 180, 'supplier': 'RespiroCare'},
            {'name': 'Prednisolone 5mg', 'category': 'Respiratory', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 1500, 'reorder_level': 500, 'max_stock': 3000,
             'unit_price': 0.30, 'expiry_days': 240, 'supplier': 'GenericMeds'},
            
            # Gastrointestinal
            {'name': 'Omeprazole 20mg', 'category': 'Gastrointestinal', 'abc_classification': 'A',
             'ved_classification': 'E', 'current_stock': 2400, 'reorder_level': 600, 'max_stock': 4500,
             'unit_price': 0.28, 'expiry_days': 310, 'supplier': 'GastroMeds'},
            {'name': 'Ranitidine 150mg', 'category': 'Gastrointestinal', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 1300, 'reorder_level': 400, 'max_stock': 2500,
             'unit_price': 0.18, 'expiry_days': 260, 'supplier': 'GenericMeds'},
            
            # Antimicrobials
            {'name': 'Ceftriaxone 1g Injection', 'category': 'Antimicrobials', 'abc_classification': 'A',
             'ved_classification': 'V', 'current_stock': 400, 'reorder_level': 150, 'max_stock': 800,
             'unit_price': 3.50, 'expiry_days': 160, 'supplier': 'PharmaCorp'},
            {'name': 'Metronidazole 500mg', 'category': 'Antimicrobials', 'abc_classification': 'B',
             'ved_classification': 'E', 'current_stock': 900, 'reorder_level': 300, 'max_stock': 1800,
             'unit_price': 0.35, 'expiry_days': 220, 'supplier': 'MediSupply'},
        ]
        
        # Create inventory for each hospital with variations
        import random
        for hospital in hospitals:
            for med_template in medications_template:
                # Add some variation to stocks across hospitals
                stock_variation = random.uniform(0.7, 1.3) if len(hospitals) > 1 else 1.0
                
                inventory_data = {
                    'name': med_template['name'],
                    'category': med_template['category'],
                    'abc_classification': med_template['abc_classification'],
                    'ved_classification': med_template['ved_classification'],
                    'current_stock': int(med_template['current_stock'] * stock_variation),
                    'reorder_level': med_template['reorder_level'],
                    'max_stock': med_template['max_stock'],
                    'unit_price': med_template['unit_price'],
                    'expiry_date': timezone.now().date() + timedelta(days=med_template['expiry_days']),
                    'supplier': med_template['supplier'],
                    'hospital': hospital
                }
                
                InventoryItem.objects.get_or_create(
                    name=inventory_data['name'],
                    hospital=inventory_data['hospital'],
                    defaults=inventory_data
                )
        
        total_items = len(medications_template) * len(hospitals)
        self.stdout.write(self.style.SUCCESS(f'Created {total_items} inventory items across {len(hospitals)} hospitals'))
    
    def seed_requests(self):
        """Seed resource requests"""
        hospitals = list(ResourceHospital.objects.all())
        resources = list(SharedResource.objects.all())
        users = list(UserProfile.objects.all())
        
        if not hospitals or not resources or not users:
            return
        
        if len(hospitals) >= 2 and resources:
            ResourceRequest.objects.get_or_create(
                resource=resources[0],
                requesting_hospital=hospitals[1],
                providing_hospital=hospitals[0],
                defaults={
                    'requested_by': users[0] if users else None,
                    'quantity': 5,
                    'urgency': 'critical',
                    'status': 'pending',
                    'justification': 'Emergency surgery patient'
                }
            )
        
        self.stdout.write(self.style.SUCCESS('Created resource requests'))
    
    def seed_alerts(self):
        """Seed alerts"""
        hospitals = list(ResourceHospital.objects.all())
        resources = list(SharedResource.objects.all())
        
        if not hospitals:
            return
        
        Alert.objects.get_or_create(
            hospital=hospitals[0],
            alert_type='shortage',
            defaults={
                'severity': 'critical',
                'title': 'Critical Stock Alert',
                'message': 'Morphine 10mg stock below minimum threshold',
                'resource': resources[0] if resources else None,
            }
        )
        
        Alert.objects.get_or_create(
            hospital=hospitals[0],
            alert_type='expiry',
            defaults={
                'severity': 'high',
                'title': 'Medication Expiry Warning',
                'message': 'Several medications expiring within 30 days',
                'resource': None,
            }
        )
        
        self.stdout.write(self.style.SUCCESS('Created alerts'))
    
    def seed_permissions(self):
        """Seed role permissions"""
        permissions_data = [
            {
                'role': 'admin',
                'permissions': {
                    'inventory': {'read': True, 'write': True, 'admin': True},
                    'sharing': {'read': True, 'write': True, 'admin': True},
                    'communication': {'read': True, 'write': True, 'admin': True},
                    'admin': {'read': True, 'write': True, 'admin': True},
                    'reports': {'read': True, 'write': True, 'admin': True}
                }
            },
            {
                'role': 'pharmacist',
                'permissions': {
                    'inventory': {'read': True, 'write': True, 'admin': False},
                    'sharing': {'read': True, 'write': True, 'admin': False},
                    'communication': {'read': True, 'write': True, 'admin': False},
                    'reports': {'read': True, 'write': False, 'admin': False}
                }
            },
            {
                'role': 'doctor',
                'permissions': {
                    'inventory': {'read': True, 'write': False, 'admin': False},
                    'sharing': {'read': True, 'write': True, 'admin': False},
                    'communication': {'read': True, 'write': True, 'admin': False},
                    'reports': {'read': True, 'write': False, 'admin': False}
                }
            },
        ]
        
        for data in permissions_data:
            RolePermission.objects.get_or_create(
                role=data['role'],
                defaults=data
            )
        
        self.stdout.write(self.style.SUCCESS(f'Created {len(permissions_data)} role permissions'))
    
    def seed_bed_occupancy(self):
        """Seed bed occupancy data"""
        hospitals = list(ResourceHospital.objects.all())
        
        if not hospitals:
            return
        
        bed_types = ['general', 'icu', 'emergency']
        
        for hospital in hospitals[:2]:  # Just first two hospitals
            for bed_type in bed_types:
                total = 50 if bed_type == 'general' else 20
                occupied = int(total * 0.7)
                BedOccupancy.objects.get_or_create(
                    hospital=hospital,
                    bed_type=bed_type,
                    defaults={
                        'total_beds': total,
                        'occupied_beds': occupied,
                        'available_beds': total - occupied,
                        'reserved_beds': 2
                    }
                )
        
        self.stdout.write(self.style.SUCCESS('Created bed occupancy data'))
