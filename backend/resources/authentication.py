"""
Authentication views for the Hospital Resource Sharing System
Simple authentication without JWT for development
"""
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from .models import UserProfile
from .serializers import UserProfileSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate user and return auth token
    
    Request body:
    {
        "email": "user@example.com",
        "password": "password123"
    }
    """
    email = request.data.get('email')
    password = request.data.get('password')
    
    if not email or not password:
        return Response(
            {'error': 'Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Find user by email
        user_profile = UserProfile.objects.get(email=email)
        
        # For development, accept any password if it's not empty
        # In production, you would verify against hashed password
        if password:
            # Get or create Django user for token
            user, created = User.objects.get_or_create(
                username=email,
                defaults={'email': email}
            )
            
            # Get or create token
            token, created = Token.objects.get_or_create(user=user)
            
            # Serialize user profile
            serializer = UserProfileSerializer(user_profile)
            
            return Response({
                'token': token.key,
                'user': serializer.data
            })
        else:
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
            
    except UserProfile.DoesNotExist:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logout user by deleting their auth token
    """
    try:
        request.user.auth_token.delete()
        return Response({'message': 'Successfully logged out'})
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    """
    Get current authenticated user's profile
    """
    try:
        # Find user profile by email
        user_profile = UserProfile.objects.get(email=request.user.email)
        serializer = UserProfileSerializer(user_profile)
        return Response(serializer.data)
    except UserProfile.DoesNotExist:
        return Response(
            {'error': 'User profile not found'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """
    Register a new user
    
    Request body:
    {
        "email": "user@example.com",
        "full_name": "John Doe",
        "password": "password123",
        "role": "doctor",
        "hospital_id": "uuid"
    }
    """
    email = request.data.get('email')
    full_name = request.data.get('full_name')
    password = request.data.get('password')
    role = request.data.get('role')
    hospital_id = request.data.get('hospital_id')
    
    if not all([email, full_name, password, role, hospital_id]):
        return Response(
            {'error': 'All fields are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if user already exists
    if UserProfile.objects.filter(email=email).exists():
        return Response(
            {'error': 'User with this email already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Create Django user
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password
        )
        
        # Create user profile
        user_profile = UserProfile.objects.create(
            email=email,
            full_name=full_name,
            role=role,
            hospital_id=hospital_id
        )
        
        # Create token
        token = Token.objects.create(user=user)
        
        # Serialize user profile
        serializer = UserProfileSerializer(user_profile)
        
        return Response({
            'token': token.key,
            'user': serializer.data
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        # Cleanup if something went wrong
        if 'user' in locals():
            user.delete()
        if 'user_profile' in locals():
            user_profile.delete()
            
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
