"""
Secure Authentication System for Hospital Resource Sharing
Implements JWT-based authentication with refresh tokens, password hashing, and validation
"""
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.views import TokenRefreshView
from .models import UserProfile, ResourceHospital
from .serializers import UserProfileSerializer
import logging

logger = logging.getLogger(__name__)


def get_tokens_for_user(user):
    """
    Generate JWT access and refresh tokens for a user
    """
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """
    Register a new user with secure password hashing
    
    Request body:
    {
        "email": "user@example.com",
        "full_name": "John Doe",
        "password": "SecurePassword123!",
        "password_confirm": "SecurePassword123!",
        "role": "doctor",
        "hospital_id": "uuid",
        "department": "Cardiology"
    }
    """
    try:
        # Extract and validate request data
        email = request.data.get('email', '').strip().lower()
        full_name = request.data.get('full_name', '').strip()
        password = request.data.get('password', '')
        password_confirm = request.data.get('password_confirm', '')
        role = request.data.get('role', '').strip()
        hospital_id = request.data.get('hospital_id', '').strip()
        department = request.data.get('department', '').strip()
        
        # Validation
        errors = {}
        
        if not email:
            errors['email'] = 'Email is required'
        elif User.objects.filter(email=email).exists() or UserProfile.objects.filter(email=email).exists():
            errors['email'] = 'A user with this email already exists'
            
        if not full_name:
            errors['full_name'] = 'Full name is required'
            
        if not password:
            errors['password'] = 'Password is required'
        elif password != password_confirm:
            errors['password_confirm'] = 'Passwords do not match'
        else:
            # Validate password strength
            try:
                validate_password(password)
            except ValidationError as e:
                errors['password'] = list(e.messages)
                
        if not role:
            errors['role'] = 'Role is required'
        elif role not in dict(UserProfile.ROLE_CHOICES).keys():
            errors['role'] = f'Invalid role. Must be one of: {", ".join(dict(UserProfile.ROLE_CHOICES).keys())}'
            
        if not hospital_id:
            errors['hospital'] = 'Hospital is required'
        else:
            try:
                hospital = ResourceHospital.objects.get(id=hospital_id)
            except ResourceHospital.DoesNotExist:
                errors['hospital'] = 'Invalid hospital ID'
        
        if errors:
            return Response({
                'error': 'Validation failed',
                'errors': errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create user with transaction to ensure atomicity
        with transaction.atomic():
            # Create Django user with hashed password
            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,  # Django automatically hashes this
                first_name=full_name.split()[0] if full_name else '',
                last_name=' '.join(full_name.split()[1:]) if len(full_name.split()) > 1 else ''
            )
            
            # Create user profile
            user_profile = UserProfile.objects.create(
                email=email,
                full_name=full_name,
                role=role,
                hospital=hospital,
                department=department
            )
            
            # Generate JWT tokens
            tokens = get_tokens_for_user(user)
            
            # Serialize user profile
            serializer = UserProfileSerializer(user_profile)
            
            logger.info(f'New user registered: {email}')
            
            return Response({
                'message': 'User registered successfully',
                'tokens': tokens,
                'user': serializer.data
            }, status=status.HTTP_201_CREATED)
            
    except Exception as e:
        logger.error(f'Registration error: {str(e)}')
        return Response({
            'error': 'Registration failed',
            'detail': str(e) if request.user.is_staff else 'An error occurred during registration'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate user and return JWT tokens
    
    Request body:
    {
        "email": "user@example.com",
        "password": "password123"
    }
    """
    try:
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')
        
        if not email or not password:
            return Response({
                'error': 'Email and password are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Authenticate using Django's built-in authentication
        # This will check the hashed password
        user = authenticate(request, username=email, password=password)
        
        if user is None:
            logger.warning(f'Failed login attempt for: {email}')
            return Response({
                'error': 'Invalid credentials'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        if not user.is_active:
            return Response({
                'error': 'Account is disabled'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get user profile
        try:
            user_profile = UserProfile.objects.get(email=email)
        except UserProfile.DoesNotExist:
            logger.error(f'UserProfile not found for authenticated user: {email}')
            return Response({
                'error': 'User profile not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Generate JWT tokens
        tokens = get_tokens_for_user(user)
        
        # Serialize user profile
        serializer = UserProfileSerializer(user_profile)
        
        logger.info(f'User logged in: {email}')
        
        return Response({
            'message': 'Login successful',
            'tokens': tokens,
            'user': serializer.data
        })
        
    except Exception as e:
        logger.error(f'Login error: {str(e)}')
        return Response({
            'error': 'Login failed',
            'detail': str(e) if request.user.is_staff else 'An error occurred during login'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logout user by blacklisting their refresh token
    
    Request body:
    {
        "refresh": "refresh_token_string"
    }
    """
    try:
        refresh_token = request.data.get('refresh')
        
        if not refresh_token:
            return Response({
                'error': 'Refresh token is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Blacklist the refresh token
        token = RefreshToken(refresh_token)
        token.blacklist()
        
        logger.info(f'User logged out: {request.user.email}')
        
        return Response({
            'message': 'Logout successful'
        })
        
    except TokenError as e:
        return Response({
            'error': 'Invalid token',
            'detail': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f'Logout error: {str(e)}')
        return Response({
            'error': 'Logout failed',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    """
    Get current authenticated user's profile
    """
    try:
        user_profile = UserProfile.objects.get(email=request.user.email)
        serializer = UserProfileSerializer(user_profile)
        return Response(serializer.data)
    except UserProfile.DoesNotExist:
        return Response({
            'error': 'User profile not found'
        }, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    Change user password
    
    Request body:
    {
        "current_password": "oldpassword",
        "new_password": "NewPassword123!",
        "new_password_confirm": "NewPassword123!"
    }
    """
    try:
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')
        new_password_confirm = request.data.get('new_password_confirm', '')
        
        errors = {}
        
        if not current_password:
            errors['current_password'] = 'Current password is required'
            
        if not new_password:
            errors['new_password'] = 'New password is required'
        elif new_password != new_password_confirm:
            errors['new_password_confirm'] = 'Passwords do not match'
        else:
            # Validate new password strength
            try:
                validate_password(new_password, user=request.user)
            except ValidationError as e:
                errors['new_password'] = list(e.messages)
        
        if errors:
            return Response({
                'error': 'Validation failed',
                'errors': errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not request.user.check_password(current_password):
            return Response({
                'error': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Set new password (Django will hash it)
        request.user.set_password(new_password)
        request.user.save()
        
        logger.info(f'Password changed for user: {request.user.email}')
        
        return Response({
            'message': 'Password changed successfully'
        })
        
    except Exception as e:
        logger.error(f'Password change error: {str(e)}')
        return Response({
            'error': 'Password change failed',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request_view(request):
    """
    Request password reset (sends reset link/token)
    
    Request body:
    {
        "email": "user@example.com"
    }
    
    Note: In production, this should send an email with a secure reset token
    """
    try:
        email = request.data.get('email', '').strip().lower()
        
        if not email:
            return Response({
                'error': 'Email is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if user exists (but don't reveal this information for security)
        try:
            user = User.objects.get(email=email)
            # In production: Generate secure reset token and send email
            logger.info(f'Password reset requested for: {email}')
        except User.DoesNotExist:
            pass  # Don't reveal if user exists or not
        
        # Always return success to prevent email enumeration
        return Response({
            'message': 'If an account exists with this email, password reset instructions have been sent'
        })
        
    except Exception as e:
        logger.error(f'Password reset request error: {str(e)}')
        return Response({
            'error': 'An error occurred'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_token_view(request):
    """
    Verify if a JWT token is valid
    
    Request body:
    {
        "token": "access_token_string"
    }
    """
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        
        token = request.data.get('token')
        
        if not token:
            return Response({
                'error': 'Token is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Attempt to validate the token
        try:
            AccessToken(token)
            return Response({
                'valid': True,
                'message': 'Token is valid'
            })
        except (TokenError, InvalidToken) as e:
            return Response({
                'valid': False,
                'error': 'Token is invalid or expired'
            }, status=status.HTTP_401_UNAUTHORIZED)
            
    except Exception as e:
        logger.error(f'Token verification error: {str(e)}')
        return Response({
            'error': 'Verification failed'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
