"""
Utility functions for hospital resource synchronization.

Provides helper functions for database connections, data validation,
conflict resolution, and sync monitoring.
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal, InvalidOperation

from django.db import connections, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.conf import settings

from .models import ResourceHospital, InventorySyncLog

logger = logging.getLogger(__name__)


class SyncConflictResolver:
    """Handles conflicts during synchronization."""
    
    @staticmethod
    def resolve_quantity_conflict(current_qty: int, new_qty: int, resource_name: str) -> int:
        """Resolve quantity conflicts using business rules."""
        # Log the conflict
        logger.warning(
            f"Quantity conflict for {resource_name}: current={current_qty}, new={new_qty}"
        )
        
        # Business rule: Use the higher quantity for safety
        resolved_qty = max(current_qty, new_qty)
        
        logger.info(f"Resolved quantity conflict for {resource_name}: using {resolved_qty}")
        return resolved_qty
    
    @staticmethod
    def resolve_expiry_conflict(current_date, new_date, resource_name: str):
        """Resolve expiry date conflicts."""
        logger.warning(
            f"Expiry date conflict for {resource_name}: current={current_date}, new={new_date}"
        )
        
        # Business rule: Use the earlier expiry date for safety
        if current_date and new_date:
            resolved_date = min(current_date, new_date)
        else:
            resolved_date = current_date or new_date
        
        logger.info(f"Resolved expiry conflict for {resource_name}: using {resolved_date}")
        return resolved_date


class DataValidator:
    """Validates data during synchronization."""
    
    @staticmethod
    def validate_quantity(value: Any) -> Optional[int]:
        """Validate and sanitize quantity values."""
        if value is None:
            return 0
        
        try:
            qty = int(value)
            return max(0, qty)  # Ensure non-negative
        except (ValueError, TypeError):
            logger.warning(f"Invalid quantity value: {value}")
            return 0
    
    @staticmethod
    def validate_price(value: Any) -> Optional[Decimal]:
        """Validate and sanitize price values."""
        if value is None:
            return None
        
        try:
            price = Decimal(str(value))
            return max(Decimal('0.00'), price)  # Ensure non-negative
        except (InvalidOperation, ValueError, TypeError):
            logger.warning(f"Invalid price value: {value}")
            return None
    
    @staticmethod
    def validate_date(value: Any):
        """Validate date values."""
        if value is None:
            return None
        
        if isinstance(value, str):
            try:
                return datetime.strptime(value, '%Y-%m-%d').date()
            except ValueError:
                logger.warning(f"Invalid date format: {value}")
                return None
        
        if hasattr(value, 'date'):
            return value.date()
        
        return value
    
    @staticmethod
    def validate_uuid(value: Any) -> Optional[uuid.UUID]:
        """Validate UUID values."""
        if value is None:
            return None
        
        try:
            if isinstance(value, str):
                return uuid.UUID(value)
            elif isinstance(value, uuid.UUID):
                return value
        except (ValueError, TypeError):
            logger.warning(f"Invalid UUID value: {value}")
        
        return None


class DatabaseConnectionManager:
    """Manages database connections for sync operations."""
    
    @staticmethod
    def get_dummy_hospital_connection(hospital_id: str):
        """Get database connection for specific dummy hospital."""
        # For now, use default connection
        # In production, this would route to hospital-specific databases
        return connections['default']
    
    @staticmethod
    def test_connection(db_alias: str) -> bool:
        """Test database connection."""
        try:
            with connections[db_alias].cursor() as cursor:
                cursor.execute("SELECT 1")
                return True
        except Exception as e:
            logger.error(f"Database connection test failed for {db_alias}: {str(e)}")
            return False
    
    @staticmethod
    def execute_query_with_retry(db_alias: str, query: str, params: List, max_retries: int = 3):
        """Execute query with retry logic."""
        last_exception = None
        
        for attempt in range(max_retries):
            try:
                with connections[db_alias].cursor() as cursor:
                    cursor.execute(query, params)
                    return cursor.fetchall()
            except Exception as e:
                last_exception = e
                logger.warning(
                    f"Query attempt {attempt + 1} failed: {str(e)}"
                )
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
        
        logger.error(f"All query attempts failed. Last error: {str(last_exception)}")
        raise last_exception


class SyncMonitor:
    """Monitors sync operations and provides statistics."""
    
    @staticmethod
    def get_sync_statistics(hospital: ResourceHospital, days: int = 7) -> Dict:
        """Get sync statistics for a hospital."""
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        logs = InventorySyncLog.objects.filter(
            hospital=hospital,
            started_at__gte=start_date
        )
        
        total_syncs = logs.count()
        successful_syncs = logs.filter(sync_status='completed').count()
        failed_syncs = logs.filter(sync_status='failed').count()
        partial_syncs = logs.filter(sync_status='partial').count()
        
        avg_records_processed = logs.aggregate(
            avg_processed=models.Avg('records_processed')
        )['avg_processed'] or 0
        
        avg_success_rate = sum(log.success_rate for log in logs) / total_syncs if total_syncs > 0 else 0
        
        return {
            'total_syncs': total_syncs,
            'successful_syncs': successful_syncs,
            'failed_syncs': failed_syncs,
            'partial_syncs': partial_syncs,
            'success_rate': (successful_syncs / total_syncs * 100) if total_syncs > 0 else 0,
            'avg_records_processed': avg_records_processed,
            'avg_success_rate': avg_success_rate,
            'last_sync': hospital.last_sync,
        }
    
    @staticmethod
    def check_sync_health() -> Dict:
        """Check overall sync system health."""
        hospitals = ResourceHospital.objects.filter(is_active=True)
        current_time = timezone.now()
        
        overdue_hospitals = []
        healthy_hospitals = []
        warning_hospitals = []
        
        for hospital in hospitals:
            if not hospital.last_sync:
                overdue_hospitals.append(hospital)
            else:
                time_since_sync = current_time - hospital.last_sync
                if time_since_sync > timedelta(hours=1):
                    overdue_hospitals.append(hospital)
                elif time_since_sync > timedelta(minutes=30):
                    warning_hospitals.append(hospital)
                else:
                    healthy_hospitals.append(hospital)
        
        return {
            'total_hospitals': hospitals.count(),
            'healthy_hospitals': len(healthy_hospitals),
            'warning_hospitals': len(warning_hospitals),
            'overdue_hospitals': len(overdue_hospitals),
            'overall_health': 'healthy' if not overdue_hospitals else 'warning' if not len(overdue_hospitals) > len(hospitals) / 2 else 'critical'
        }


class SyncScheduler:
    """Manages sync scheduling and intervals."""
    
    @staticmethod
    def calculate_next_sync_time(hospital: ResourceHospital, sync_interval_minutes: int = 5) -> datetime:
        """Calculate next sync time based on hospital priority and load."""
        base_interval = timedelta(minutes=sync_interval_minutes)
        
        # Adjust interval based on hospital trust level
        if hospital.trust_level == 'high':
            # High trust hospitals sync more frequently
            adjusted_interval = base_interval * 0.5
        elif hospital.trust_level == 'low':
            # Low trust hospitals sync less frequently
            adjusted_interval = base_interval * 2
        else:
            adjusted_interval = base_interval
        
        return timezone.now() + adjusted_interval
    
    @staticmethod
    def should_sync_hospital(hospital: ResourceHospital, force_sync: bool = False) -> bool:
        """Determine if hospital should be synced now."""
        if force_sync:
            return True
        
        if not hospital.is_active:
            return False
        
        if not hospital.last_sync:
            return True
        
        # Check if sync interval has passed
        sync_interval = timedelta(minutes=5)  # Default 5-minute interval
        time_since_sync = timezone.now() - hospital.last_sync
        
        return time_since_sync >= sync_interval


# Utility functions
def safe_cast_to_int(value: Any, default: int = 0) -> int:
    """Safely cast value to integer."""
    try:
        return int(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def safe_cast_to_decimal(value: Any, default: Optional[Decimal] = None) -> Optional[Decimal]:
    """Safely cast value to Decimal."""
    try:
        return Decimal(str(value)) if value is not None else default
    except (InvalidOperation, ValueError, TypeError):
        return default


def format_sync_duration(started_at: datetime, completed_at: Optional[datetime] = None) -> str:
    """Format sync duration for display."""
    if not completed_at:
        completed_at = timezone.now()
    
    duration = completed_at - started_at
    total_seconds = duration.total_seconds()
    
    if total_seconds < 60:
        return f"{total_seconds:.1f}s"
    elif total_seconds < 3600:
        return f"{total_seconds / 60:.1f}m"
    else:
        return f"{total_seconds / 3600:.1f}h"
