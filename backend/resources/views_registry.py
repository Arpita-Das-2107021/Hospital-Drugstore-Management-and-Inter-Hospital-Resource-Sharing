# backend/resources/views_registry.py
"""
API Views for Hospital Registration System
"""

import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.generics import ListAPIView

from .serializers_registry import (
    HospitalRegistrationSerializer,
    HospitalRegistrationResponseSerializer,
    HospitalListSerializer,
)
from .services.registration_service import HospitalRegistrationService
from .models_registry import Hospital, HospitalStatus

logger = logging.getLogger(__name__)


class RegisterHospitalAPIView(APIView):
    """
    API view for hospital self-registration
    No authentication required for initial registration
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        """
        Create a new hospital registration
        
        Request body should contain:
        - Hospital information (name, license, contact details)
        - API configuration (base URL, authentication details)
        - Admin user credentials (username, password, email)
        """
        serializer = HospitalRegistrationSerializer(data=request.data)
        
        if not serializer.is_valid():
            logger.warning(f"Hospital registration validation failed: {serializer.errors}")
            return Response({
                'success': False,
                'message': 'Validation failed',
                'errors': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Use service layer for business logic
            hospital, admin_user = HospitalRegistrationService.register_hospital(
                serializer.validated_data
            )
            
            # Serialize response
            response_serializer = HospitalRegistrationResponseSerializer({
                'hospital': hospital,
                'admin_user': admin_user
            })
            
            logger.info(f"Successfully registered hospital: {hospital.name} (ID: {hospital.id})")
            
            return Response({
                'success': True,
                'message': 'Hospital registered successfully. Your registration is pending approval by platform administrators.',
                'data': response_serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error during hospital registration: {str(e)}", exc_info=True)
            return Response({
                'success': False,
                'message': 'Registration failed due to server error',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VerifyHospitalAPIView(APIView):
    """
    API view to verify hospital API connection
    Requires authentication
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Verify hospital API connection
        Query parameter: hospital_id (required)
        """
        hospital_id = request.query_params.get('hospital_id')
        
        if not hospital_id:
            return Response({
                'success': False,
                'message': 'hospital_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            hospital_id = int(hospital_id)
        except ValueError:
            return Response({
                'success': False,
                'message': 'hospital_id must be a valid integer'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            success = HospitalRegistrationService.verify_hospital_api(hospital_id)
            
            if success:
                return Response({
                    'success': True,
                    'message': 'Hospital API verification successful'
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'success': False,
                    'message': 'Hospital API verification failed'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Hospital.DoesNotExist:
            return Response({
                'success': False,
                'message': f'Hospital with ID {hospital_id} not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error verifying hospital API: {str(e)}", exc_info=True)
            return Response({
                'success': False,
                'message': 'Verification failed due to server error',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ApproveHospitalAPIView(APIView):
    """
    API view to approve pending hospital registrations
    Requires admin authentication
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Approve a pending hospital registration
        Request body: {"hospital_id": <id>}
        """
        # TODO: Add proper permission check for platform admins
        # if not request.user.is_platform_admin:
        #     return Response({'message': 'Permission denied'}, status=403)
        
        hospital_id = request.data.get('hospital_id')
        
        if not hospital_id:
            return Response({
                'success': False,
                'message': 'hospital_id is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            hospital = HospitalRegistrationService.approve_hospital(
                hospital_id,
                request.user.id
            )
            
            return Response({
                'success': True,
                'message': f'Hospital {hospital.name} approved successfully',
                'data': {
                    'hospital_id': hospital.id,
                    'hospital_code': hospital.code,
                    'status': hospital.status
                }
            }, status=status.HTTP_200_OK)
            
        except Hospital.DoesNotExist:
            return Response({
                'success': False,
                'message': f'Hospital with ID {hospital_id} not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error approving hospital: {str(e)}", exc_info=True)
            return Response({
                'success': False,
                'message': 'Approval failed due to server error',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RejectHospitalAPIView(APIView):
    """
    API view to reject pending hospital registrations
    Requires admin authentication
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Reject a pending hospital registration
        Request body: {"hospital_id": <id>, "reason": "<reason>"}
        """
        # TODO: Add proper permission check for platform admins
        
        hospital_id = request.data.get('hospital_id')
        reason = request.data.get('reason', '')
        
        if not hospital_id:
            return Response({
                'success': False,
                'message': 'hospital_id is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            hospital = HospitalRegistrationService.reject_hospital(
                hospital_id,
                request.user.id,
                reason
            )
            
            return Response({
                'success': True,
                'message': f'Hospital {hospital.name} rejected',
                'data': {
                    'hospital_id': hospital.id,
                    'hospital_code': hospital.code,
                    'status': hospital.status,
                    'reason': reason
                }
            }, status=status.HTTP_200_OK)
            
        except Hospital.DoesNotExist:
            return Response({
                'success': False,
                'message': f'Hospital with ID {hospital_id} not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error rejecting hospital: {str(e)}", exc_info=True)
            return Response({
                'success': False,
                'message': 'Rejection failed due to server error',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ListHospitalsAPIView(ListAPIView):
    """
    API view to list hospitals
    Supports filtering by status (query parameter: status)
    """
    permission_classes = [IsAuthenticated]
    serializer_class = HospitalListSerializer
    
    def get_queryset(self):
        """
        Filter hospitals by status if provided
        """
        queryset = Hospital.objects.all().select_related('api_config')
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset.order_by('-created_at')
