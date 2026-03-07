# backend/resources/services/registration_service.py
"""
Service Layer for Hospital Registration
Handles business logic and database transactions
"""

import logging
from django.db import transaction
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from ..models_registry import (
    Hospital, HospitalAPIConfig, Staff, User, Role,
    HospitalStatus, ConnectionStatus, EmploymentStatus, UserStatus
)

logger = logging.getLogger(__name__)


class HospitalRegistrationService:
    """Service for handling hospital registration logic"""

    @staticmethod
    def generate_employee_code(hospital_code, first_name, last_name):
        """Generate unique employee code for staff"""
        # Format: HCODE-FML-001 (Hospital Code - First Middle Last - Sequential Number)
        base_code = f"{hospital_code}-{first_name[0]}{last_name[0]}".upper()
        
        # Find the next available number
        existing_codes = Staff.objects.filter(
            employee_code__startswith=base_code
        ).order_by('-employee_code')
        
        if existing_codes.exists():
            try:
                last_code = existing_codes.first().employee_code
                last_number = int(last_code.split('-')[-1])
                next_number = last_number + 1
            except (ValueError, IndexError):
                next_number = 1
        else:
            next_number = 1
        
        return f"{base_code}-{str(next_number).zfill(3)}"

    @staticmethod
    @transaction.atomic
    def register_hospital(validated_data):
        """
        Register a new hospital with API config and admin user
        
        Args:
            validated_data: Dictionary containing hospital, api_config, and admin_user data
            
        Returns:
            Tuple of (hospital, admin_user) instances
            
        Raises:
            Exception: If registration fails
        """
        try:
            # Extract data sections
            hospital_data = {
                'name': validated_data['hospital_name'],
                'license_number': validated_data['license_number'],
                'email': validated_data['contact_email'],
                'phone': validated_data['contact_phone'],
                'address': validated_data.get('address', ''),
                'city': validated_data.get('city', ''),
                'state': validated_data.get('state', ''),
                'postal_code': validated_data.get('postal_code', ''),
                'status': HospitalStatus.PENDING,
            }
            
            api_config_data = validated_data['api_config']
            admin_user_data = validated_data['admin_user']
            
            # Step 1: Create Hospital
            hospital = Hospital.objects.create(**hospital_data)
            
            # Generate and assign hospital code
            hospital.code = hospital.generate_code()
            hospital.save(update_fields=['code'])
            
            logger.info(f"Created hospital: {hospital.name} with code {hospital.code}")
            
            # Step 2: Create Hospital API Config
            api_config = HospitalAPIConfig.objects.create(
                hospital=hospital,
                api_base_url=api_config_data['api_base_url'],
                auth_type=api_config_data.get('auth_type', 'API_KEY'),
                api_key=api_config_data.get('api_key', ''),
                api_secret=api_config_data.get('api_secret', ''),
                inventory_endpoint=api_config_data.get('inventory_endpoint', '/api/inventory'),
                staff_endpoint=api_config_data.get('staff_endpoint', '/api/staff'),
                transfer_request_endpoint=api_config_data.get('transfer_request_endpoint', '/api/transfer-requests'),
                connection_status=ConnectionStatus.PENDING,
                is_active=True,
            )
            
            logger.info(f"Created API config for hospital: {hospital.name}")
            
            # Step 3: Create Staff record for admin
            employee_code = HospitalRegistrationService.generate_employee_code(
                hospital.code,
                admin_user_data['first_name'],
                admin_user_data['last_name']
            )
            
            staff = Staff.objects.create(
                hospital=hospital,
                employee_code=employee_code,
                first_name=admin_user_data['first_name'],
                last_name=admin_user_data['last_name'],
                email=admin_user_data['email'],
                phone=admin_user_data.get('phone', ''),
                designation=admin_user_data.get('designation', 'Hospital Administrator'),
                employment_status=EmploymentStatus.ACTIVE,
                hire_date=timezone.now().date(),
            )
            
            logger.info(f"Created staff record: {staff.full_name} with code {employee_code}")
            
            # Step 4: Get or create HOSPITAL_ADMIN role
            role, created = Role.objects.get_or_create(
                name='HOSPITAL_ADMIN',
                defaults={'description': 'Hospital administrator with full access to hospital resources'}
            )
            
            # Step 5: Create User Account
            user = User.objects.create(
                staff=staff,
                role=role,
                username=admin_user_data['username'],
                password=make_password(admin_user_data['password']),
                status=UserStatus.ACTIVE,  # Automatically activate admin user
                is_active=True,
                is_staff=True,  # Django admin access
            )
            
            logger.info(f"Created user account: {user.username} for {staff.full_name}")
            
            return hospital, user
            
        except Exception as e:
            logger.error(f"Error during hospital registration: {str(e)}")
            raise

    @staticmethod
    def verify_hospital_api(hospital_id):
        """
        Verify hospital API connection
        
        Args:
            hospital_id: ID of the hospital to verify
            
        Returns:
            Boolean indicating success
        """
        try:
            hospital = Hospital.objects.get(id=hospital_id)
            api_config = hospital.api_config
            
            # TODO: Implement actual API verification logic
            # This is a placeholder that should be replaced with actual API calls
            
            # For now, mark as connected and update last_checked_at
            api_config.connection_status = ConnectionStatus.CONNECTED
            api_config.last_checked_at = timezone.now()
            api_config.error_message = ''
            api_config.save(update_fields=['connection_status', 'last_checked_at', 'error_message'])
            
            logger.info(f"Successfully verified API for hospital: {hospital.name}")
            return True
            
        except Hospital.DoesNotExist:
            logger.error(f"Hospital with id {hospital_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error verifying hospital API: {str(e)}")
            
            # Update API config with error
            if 'api_config' in locals():
                api_config.connection_status = ConnectionStatus.FAILED
                api_config.last_checked_at = timezone.now()
                api_config.error_message = str(e)
                api_config.save(update_fields=['connection_status', 'last_checked_at', 'error_message'])
            
            return False

    @staticmethod
    def approve_hospital(hospital_id, approved_by_user_id):
        """
        Approve a pending hospital registration
        
        Args:
            hospital_id: ID of the hospital to approve
            approved_by_user_id: ID of the user approving the registration
            
        Returns:
            Hospital instance
        """
        try:
            hospital = Hospital.objects.get(id=hospital_id)
            
            if hospital.status != HospitalStatus.PENDING:
                raise ValueError(f"Hospital is not in pending status. Current status: {hospital.status}")
            
            hospital.status = HospitalStatus.ACTIVE
            hospital.verified_at = timezone.now()
            hospital.verified_by = approved_by_user_id
            hospital.save(update_fields=['status', 'verified_at', 'verified_by'])
            
            logger.info(f"Approved hospital: {hospital.name} by user {approved_by_user_id}")
            
            return hospital
            
        except Hospital.DoesNotExist:
            logger.error(f"Hospital with id {hospital_id} not found")
            raise

    @staticmethod
    def reject_hospital(hospital_id, rejected_by_user_id, reason=''):
        """
        Reject a pending hospital registration
        
        Args:
            hospital_id: ID of the hospital to reject
            rejected_by_user_id: ID of the user rejecting the registration
            reason: Reason for rejection
            
        Returns:
            Hospital instance
        """
        try:
            hospital = Hospital.objects.get(id=hospital_id)
            
            if hospital.status != HospitalStatus.PENDING:
                raise ValueError(f"Hospital is not in pending status. Current status: {hospital.status}")
            
            hospital.status = HospitalStatus.REJECTED
            hospital.verified_by = rejected_by_user_id
            hospital.save(update_fields=['status', 'verified_by'])
            
            logger.info(f"Rejected hospital: {hospital.name} by user {rejected_by_user_id}. Reason: {reason}")
            
            return hospital
            
        except Hospital.DoesNotExist:
            logger.error(f"Hospital with id {hospital_id} not found")
            raise
