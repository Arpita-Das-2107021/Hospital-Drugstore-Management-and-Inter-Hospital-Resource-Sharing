"""
Django Management Command: sync_hospital_resources

This command synchronizes hospital resource data from the dummy hospital system
to the resource sharing platform. It handles:
- Medication inventory sync
- Blood bank sync
- Organ registry sync
- Medical equipment sync
- Bed occupancy sync

Usage:
    python manage.py sync_hospital_resources
    python manage.py sync_hospital_resources --hospital-id=<uuid>
    python manage.py sync_hospital_resources --full-sync
    python manage.py sync_hospital_resources --dry-run
"""

import logging
import uuid
import time
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, connections
from django.utils import timezone
from django.conf import settings

from resources.models import (
    ResourceHospital,
    ResourceCategory,
    SharedResource,
    InventorySyncLog,
    BedOccupancy,
)

# Configure logging
logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Synchronize hospital resource data from dummy hospital system'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--hospital-id',
            type=str,
            help='Sync only specific hospital by external ID',
        )
        parser.add_argument(
            '--full-sync',
            action='store_true',
            help='Perform full synchronization (default: incremental)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Perform dry run without making changes',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            help='Number of records to process per batch',
        )
    
    def handle(self, *args, **options):
        start_time = time.time()
        self.stdout.write(self.style.SUCCESS('Starting hospital resource synchronization...'))
        
        # Setup logging
        self.setup_logging()
        
        # Get options
        hospital_id = options.get('hospital_id')
        full_sync = options.get('full_sync', False)
        dry_run = options.get('dry_run', False)
        batch_size = options.get('batch_size', 100)
        
        sync_type = 'full' if full_sync else 'incremental'
        
        try:
            # Get hospitals to sync
            hospitals = self.get_hospitals_to_sync(hospital_id)
            
            if not hospitals:
                self.stdout.write(self.style.WARNING('No hospitals found to sync.'))
                return
            
            total_synced = 0
            total_errors = 0
            
            # Process each hospital
            for hospital in hospitals:
                self.stdout.write(f'\nSyncing hospital: {hospital.name}')
                
                # Create sync log
                sync_log = InventorySyncLog.objects.create(
                    hospital=hospital,
                    sync_type=sync_type,
                    sync_status='in_progress'
                )
                
                try:
                    # Sync hospital resources
                    synced, errors = self.sync_hospital_resources(
                        hospital, sync_log, dry_run, batch_size, full_sync
                    )
                    
                    total_synced += synced
                    total_errors += errors
                    
                    # Update sync log
                    sync_log.records_processed = synced + errors
                    sync_log.records_updated = synced
                    sync_log.records_failed = errors
                    sync_log.sync_status = 'completed' if errors == 0 else 'partial'
                    sync_log.completed_at = timezone.now()
                    sync_log.next_sync_scheduled = timezone.now() + timedelta(minutes=5)
                    
                    if not dry_run:
                        sync_log.save()
                        hospital.last_sync = timezone.now()
                        hospital.save()
                    
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Hospital {hospital.name}: {synced} synced, {errors} errors'
                        )
                    )
                    
                except Exception as e:
                    logger.error(f'Error syncing hospital {hospital.name}: {str(e)}')
                    sync_log.sync_status = 'failed'
                    sync_log.error_details = str(e)
                    sync_log.completed_at = timezone.now()
                    
                    if not dry_run:
                        sync_log.save()
                    
                    total_errors += 1
                    self.stdout.write(
                        self.style.ERROR(f'Failed to sync hospital {hospital.name}: {str(e)}')
                    )
            
            # Summary
            elapsed_time = time.time() - start_time
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSync completed in {elapsed_time:.2f}s:\n'
                    f'- Hospitals processed: {len(hospitals)}\n'
                    f'- Records synced: {total_synced}\n'
                    f'- Errors: {total_errors}\n'
                    f'- Dry run: {dry_run}'
                )
            )
            
        except Exception as e:
            logger.error(f'Sync command failed: {str(e)}')
            raise CommandError(f'Sync failed: {str(e)}')
    
    def setup_logging(self):
        """Setup logging configuration."""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('hospital_sync.log'),
                logging.StreamHandler()
            ]
        )
    
    def get_hospitals_to_sync(self, hospital_id: Optional[str]) -> List[ResourceHospital]:
        """Get list of hospitals to synchronize."""
        if hospital_id:
            try:
                return [ResourceHospital.objects.get(external_hospital_id=hospital_id)]
            except ResourceHospital.DoesNotExist:
                self.stdout.write(
                    self.style.ERROR(f'Hospital with ID {hospital_id} not found')
                )
                return []
        
        return ResourceHospital.objects.filter(is_active=True)
    
    def sync_hospital_resources(
        self,
        hospital: ResourceHospital,
        sync_log: InventorySyncLog,
        dry_run: bool,
        batch_size: int,
        full_sync: bool
    ) -> Tuple[int, int]:
        """Sync resources for a specific hospital."""
        total_synced = 0
        total_errors = 0
        
        try:
            # Sync medication inventory
            synced, errors = self.sync_medication_inventory(
                hospital, dry_run, batch_size, full_sync
            )
            total_synced += synced
            total_errors += errors
            
            # Sync blood bank
            synced, errors = self.sync_blood_bank(
                hospital, dry_run, batch_size, full_sync
            )
            total_synced += synced
            total_errors += errors
            
            # Sync organ registry
            synced, errors = self.sync_organ_registry(
                hospital, dry_run, batch_size, full_sync
            )
            total_synced += synced
            total_errors += errors
            
            # Sync medical equipment
            synced, errors = self.sync_medical_equipment(
                hospital, dry_run, batch_size, full_sync
            )
            total_synced += synced
            total_errors += errors
            
            # Sync bed occupancy
            synced, errors = self.sync_bed_occupancy(
                hospital, dry_run, batch_size, full_sync
            )
            total_synced += synced
            total_errors += errors
            
        except Exception as e:
            logger.error(f'Error in sync_hospital_resources: {str(e)}')
            total_errors += 1
        
        return total_synced, total_errors
    
    def sync_medication_inventory(
        self, hospital: ResourceHospital, dry_run: bool, batch_size: int, full_sync: bool
    ) -> Tuple[int, int]:
        """Sync medication inventory from dummy hospital system."""
        synced = 0
        errors = 0
        
        try:
            # SQL query to get medication inventory from dummy system
            query = """
            SELECT 
                mi.id as inventory_id,
                mi.hospital_id,
                m.id as medication_id,
                m.name,
                m.generic_name,
                m.therapeutic_class,
                mi.quantity_in_stock,
                mi.unit_cost,
                mi.expiry_date,
                mi.batch_number,
                mi.minimum_stock_level,
                mi.maximum_stock_level,
                mi.supplier
            FROM medication_inventory mi
            JOIN medications m ON mi.medication_id = m.id
            WHERE mi.hospital_id = %s
            AND mi.quantity_in_stock > mi.minimum_stock_level
            """
            
            if not full_sync:
                # Only sync records updated in last 10 minutes for incremental sync
                query += " AND mi.updated_at >= %s"
                params = [str(hospital.external_hospital_id), timezone.now() - timedelta(minutes=10)]
            else:
                params = [str(hospital.external_hospital_id)]
            
            # Get or create medication category
            medication_category, _ = ResourceCategory.objects.get_or_create(
                name='Medications',
                defaults={
                    'type': 'medication',
                    'unit_of_measure': 'units',
                    'description': 'Pharmaceutical medications'
                }
            )
            
            # Execute query on dummy database
            with connections['default'].cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                # Process in batches
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i + batch_size]
                    
                    if not dry_run:
                        with transaction.atomic():
                            for row in batch:
                                try:
                                    self.process_medication_row(row, hospital, medication_category)
                                    synced += 1
                                except Exception as e:
                                    logger.error(f'Error processing medication row: {str(e)}')
                                    errors += 1
                    else:
                        synced += len(batch)
            
            logger.info(f'Medication sync for {hospital.name}: {synced} synced, {errors} errors')
            
        except Exception as e:
            logger.error(f'Error in sync_medication_inventory: {str(e)}')
            errors += 1
        
        return synced, errors
    
    def process_medication_row(self, row, hospital: ResourceHospital, category: ResourceCategory):
        """Process a single medication inventory row."""
        (
            inventory_id, hospital_id, medication_id, name, generic_name,
            therapeutic_class, quantity_in_stock, unit_cost, expiry_date,
            batch_number, minimum_stock_level, maximum_stock_level, supplier
        ) = row
        
        # Calculate available quantity (above minimum stock level)
        available_quantity = max(0, quantity_in_stock - minimum_stock_level)
        
        # Update or create shared resource
        resource, created = SharedResource.objects.update_or_create(
            hospital=hospital,
            external_resource_id=inventory_id,
            category=category,
            defaults={
                'name': generic_name or name,
                'description': f'{name} - {therapeutic_class}' if therapeutic_class else name,
                'current_quantity': quantity_in_stock,
                'available_quantity': available_quantity,
                'unit_price': Decimal(str(unit_cost)) if unit_cost else None,
                'expiry_date': expiry_date,
                'batch_number': batch_number or '',
                'visibility_level': 'network' if available_quantity > 0 else 'private',
                'minimum_reserve': minimum_stock_level,
            }
        )
        
        if created:
            logger.info(f'Created new medication resource: {resource.name}')
        else:
            logger.info(f'Updated medication resource: {resource.name}')
    
    def sync_blood_bank(
        self, hospital: ResourceHospital, dry_run: bool, batch_size: int, full_sync: bool
    ) -> Tuple[int, int]:
        """Sync blood bank inventory from dummy hospital system."""
        synced = 0
        errors = 0
        
        try:
            # SQL query to get blood bank data
            query = """
            SELECT 
                id,
                hospital_id,
                blood_type,
                component,
                units_available,
                collection_date,
                expiry_date,
                screening_status,
                reserved_units
            FROM blood_bank
            WHERE hospital_id = %s
            AND screening_status = 'cleared'
            AND units_available > reserved_units
            AND expiry_date > CURRENT_DATE
            """
            
            if not full_sync:
                query += " AND updated_at >= %s"
                params = [str(hospital.external_hospital_id), timezone.now() - timedelta(minutes=10)]
            else:
                params = [str(hospital.external_hospital_id)]
            
            # Get or create blood category
            blood_category, _ = ResourceCategory.objects.get_or_create(
                name='Blood Products',
                defaults={
                    'type': 'blood',
                    'unit_of_measure': 'units',
                    'requires_cold_chain': True,
                    'max_transport_hours': 6,
                    'description': 'Blood and blood components'
                }
            )
            
            with connections['default'].cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i + batch_size]
                    
                    if not dry_run:
                        with transaction.atomic():
                            for row in batch:
                                try:
                                    self.process_blood_row(row, hospital, blood_category)
                                    synced += 1
                                except Exception as e:
                                    logger.error(f'Error processing blood row: {str(e)}')
                                    errors += 1
                    else:
                        synced += len(batch)
            
            logger.info(f'Blood bank sync for {hospital.name}: {synced} synced, {errors} errors')
            
        except Exception as e:
            logger.error(f'Error in sync_blood_bank: {str(e)}')
            errors += 1
        
        return synced, errors
    
    def process_blood_row(self, row, hospital: ResourceHospital, category: ResourceCategory):
        """Process a single blood bank row."""
        (
            blood_id, hospital_id, blood_type, component, units_available,
            collection_date, expiry_date, screening_status, reserved_units
        ) = row
        
        available_units = units_available - reserved_units
        resource_name = f'{blood_type} {component.replace("_", " ").title()}'
        
        resource, created = SharedResource.objects.update_or_create(
            hospital=hospital,
            external_resource_id=blood_id,
            category=category,
            defaults={
                'name': resource_name,
                'description': f'{blood_type} blood {component}',
                'current_quantity': units_available,
                'available_quantity': available_units,
                'reserved_quantity': reserved_units,
                'expiry_date': expiry_date,
                'visibility_level': 'emergency_only' if available_units < 5 else 'network',
                'is_emergency_stock': True,
                'storage_requirements': 'Refrigerated storage at 2-6°C'
            }
        )
        
        if created:
            logger.info(f'Created new blood resource: {resource.name}')
        else:
            logger.info(f'Updated blood resource: {resource.name}')
    
    def sync_organ_registry(
        self, hospital: ResourceHospital, dry_run: bool, batch_size: int, full_sync: bool
    ) -> Tuple[int, int]:
        """Sync organ registry from dummy hospital system."""
        synced = 0
        errors = 0
        
        try:
            query = """
            SELECT 
                id,
                hospital_id,
                organ_type,
                blood_type,
                status,
                viability_hours,
                harvest_datetime,
                expiry_datetime,
                priority_score
            FROM organ_registry
            WHERE hospital_id = %s
            AND status = 'available'
            AND expiry_datetime > NOW()
            """
            
            if not full_sync:
                query += " AND created_at >= %s"
                params = [str(hospital.external_hospital_id), timezone.now() - timedelta(minutes=10)]
            else:
                params = [str(hospital.external_hospital_id)]
            
            organ_category, _ = ResourceCategory.objects.get_or_create(
                name='Organs',
                defaults={
                    'type': 'organ',
                    'unit_of_measure': 'organs',
                    'max_transport_hours': 24,
                    'description': 'Human organs for transplantation'
                }
            )
            
            with connections['default'].cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i + batch_size]
                    
                    if not dry_run:
                        with transaction.atomic():
                            for row in batch:
                                try:
                                    self.process_organ_row(row, hospital, organ_category)
                                    synced += 1
                                except Exception as e:
                                    logger.error(f'Error processing organ row: {str(e)}')
                                    errors += 1
                    else:
                        synced += len(batch)
            
            logger.info(f'Organ registry sync for {hospital.name}: {synced} synced, {errors} errors')
            
        except Exception as e:
            logger.error(f'Error in sync_organ_registry: {str(e)}')
            errors += 1
        
        return synced, errors
    
    def process_organ_row(self, row, hospital: ResourceHospital, category: ResourceCategory):
        """Process a single organ registry row."""
        (
            organ_id, hospital_id, organ_type, blood_type, status,
            viability_hours, harvest_datetime, expiry_datetime, priority_score
        ) = row
        
        resource_name = f'{organ_type.title()} ({blood_type})'
        
        resource, created = SharedResource.objects.update_or_create(
            hospital=hospital,
            external_resource_id=organ_id,
            category=category,
            defaults={
                'name': resource_name,
                'description': f'{organ_type} organ, blood type {blood_type}',
                'current_quantity': 1,
                'available_quantity': 1,
                'expiry_date': expiry_datetime.date() if expiry_datetime else None,
                'visibility_level': 'emergency_only',
                'is_emergency_stock': True,
                'quality_grade': 'A',
                'storage_requirements': f'Viable for {viability_hours} hours'
            }
        )
        
        if created:
            logger.info(f'Created new organ resource: {resource.name}')
        else:
            logger.info(f'Updated organ resource: {resource.name}')
    
    def sync_medical_equipment(
        self, hospital: ResourceHospital, dry_run: bool, batch_size: int, full_sync: bool
    ) -> Tuple[int, int]:
        """Sync medical equipment from dummy hospital system."""
        synced = 0
        errors = 0
        
        try:
            query = """
            SELECT 
                id,
                hospital_id,
                name,
                model,
                manufacturer,
                category,
                status,
                location,
                last_maintenance,
                next_maintenance
            FROM medical_equipment
            WHERE hospital_id = %s
            AND status = 'available'
            AND (next_maintenance IS NULL OR next_maintenance > CURRENT_DATE)
            """
            
            if not full_sync:
                query += " AND updated_at >= %s"
                params = [str(hospital.external_hospital_id), timezone.now() - timedelta(minutes=10)]
            else:
                params = [str(hospital.external_hospital_id)]
            
            equipment_category, _ = ResourceCategory.objects.get_or_create(
                name='Medical Equipment',
                defaults={
                    'type': 'equipment',
                    'unit_of_measure': 'units',
                    'description': 'Medical equipment available for sharing'
                }
            )
            
            with connections['default'].cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i + batch_size]
                    
                    if not dry_run:
                        with transaction.atomic():
                            for row in batch:
                                try:
                                    self.process_equipment_row(row, hospital, equipment_category)
                                    synced += 1
                                except Exception as e:
                                    logger.error(f'Error processing equipment row: {str(e)}')
                                    errors += 1
                    else:
                        synced += len(batch)
            
            logger.info(f'Equipment sync for {hospital.name}: {synced} synced, {errors} errors')
            
        except Exception as e:
            logger.error(f'Error in sync_medical_equipment: {str(e)}')
            errors += 1
        
        return synced, errors
    
    def process_equipment_row(self, row, hospital: ResourceHospital, category: ResourceCategory):
        """Process a single medical equipment row."""
        (
            equipment_id, hospital_id, name, model, manufacturer,
            eq_category, status, location, last_maintenance, next_maintenance
        ) = row
        
        equipment_name = f'{name} ({model})' if model else name
        
        resource, created = SharedResource.objects.update_or_create(
            hospital=hospital,
            external_resource_id=equipment_id,
            category=category,
            defaults={
                'name': equipment_name,
                'description': f'{manufacturer} {name} - {eq_category}',
                'current_quantity': 1,
                'available_quantity': 1,
                'visibility_level': 'network',
                'storage_requirements': f'Location: {location}'
            }
        )
        
        if created:
            logger.info(f'Created new equipment resource: {resource.name}')
        else:
            logger.info(f'Updated equipment resource: {resource.name}')
    
    def sync_bed_occupancy(
        self, hospital: ResourceHospital, dry_run: bool, batch_size: int, full_sync: bool
    ) -> Tuple[int, int]:
        """Sync bed occupancy data and compute available beds."""
        synced = 0
        errors = 0
        
        try:
            # Query to calculate bed occupancy by department
            query = """
            SELECT 
                d.name as department_name,
                d.capacity as total_beds,
                COALESCE(occupied.count, 0) as occupied_beds,
                d.capacity - COALESCE(occupied.count, 0) as available_beds
            FROM departments d
            LEFT JOIN (
                SELECT 
                    p.department_id,
                    COUNT(*) as count
                FROM patients p
                JOIN appointments a ON p.id = a.patient_id
                WHERE a.hospital_id = %s
                AND a.status IN ('in_progress', 'scheduled')
                AND a.appointment_datetime >= CURRENT_DATE - INTERVAL '1 day'
                GROUP BY p.department_id
            ) occupied ON d.id = occupied.department_id
            WHERE d.hospital_id = %s
            AND d.type = 'clinical'
            """
            
            params = [str(hospital.external_hospital_id), str(hospital.external_hospital_id)]
            
            with connections['default'].cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                for row in rows:
                    try:
                        if not dry_run:
                            self.process_bed_occupancy_row(row, hospital)
                        synced += 1
                    except Exception as e:
                        logger.error(f'Error processing bed occupancy row: {str(e)}')
                        errors += 1
            
            logger.info(f'Bed occupancy sync for {hospital.name}: {synced} synced, {errors} errors')
            
        except Exception as e:
            logger.error(f'Error in sync_bed_occupancy: {str(e)}')
            errors += 1
        
        return synced, errors
    
    def process_bed_occupancy_row(self, row, hospital: ResourceHospital):
        """Process a single bed occupancy row."""
        department_name, total_beds, occupied_beds, available_beds = row
        
        # Map department names to bed types
        bed_type_mapping = {
            'ICU': 'icu',
            'Emergency': 'emergency',
            'Pediatrics': 'pediatric',
            'Maternity': 'maternity',
            'Surgery': 'surgery',
        }
        
        bed_type = bed_type_mapping.get(department_name, 'general')
        
        bed_occupancy, created = BedOccupancy.objects.update_or_create(
            hospital=hospital,
            bed_type=bed_type,
            defaults={
                'total_beds': total_beds or 0,
                'occupied_beds': occupied_beds or 0,
                'available_beds': max(0, available_beds or 0),
                'reserved_beds': 0,
            }
        )
        
        if created:
            logger.info(f'Created bed occupancy record: {bed_occupancy}')
        else:
            logger.info(f'Updated bed occupancy record: {bed_occupancy}')
