"""
URL Configuration for Hospital Resource Sharing System V2
Maps to the new enterprise database schema and API views
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .new_views import (
    HospitalViewSet, InventoryViewSet, ResourceViewSet, 
    ResourceRequestViewSet, StaffViewSet, health_check
)
from .auth_views import (
    register_view, login_view, refresh_view, logout_view,
    user_profile_view, change_password_view
)

# Create a router for ViewSets
router = DefaultRouter()
router.register(r'hospitals', HospitalViewSet)
router.register(r'inventory', InventoryViewSet)
router.register(r'resources', ResourceViewSet)
router.register(r'requests', ResourceRequestViewSet)
router.register(r'staff', StaffViewSet)

urlpatterns = [
    # Health check
    path('health/', health_check, name='health_check'),
    
    # Authentication endpoints
    path('auth/register/', register_view, name='register'),
    path('auth/login/', login_view, name='login'),
    path('auth/refresh/', refresh_view, name='refresh'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/profile/', user_profile_view, name='profile'),
    path('auth/change-password/', change_password_view, name='change_password'),
    
    # API endpoints using ViewSets
    path('', include(router.urls)),
    
    # Custom endpoints for specific analytics and reports
    path('analytics/inventory/', InventoryViewSet.as_view({'get': 'analytics'}), name='inventory_analytics'),
    path('analytics/requests/', ResourceRequestViewSet.as_view({'get': 'analytics'}), name='request_analytics'),
    
    # Dashboard endpoints
    path('hospitals/<int:pk>/dashboard/', HospitalViewSet.as_view({'get': 'dashboard'}), name='hospital_dashboard'),
    
    # Specialized inventory endpoints
    path('inventory/low-stock/', InventoryViewSet.as_view({'get': 'low_stock'}), name='inventory_low_stock'),
    path('inventory/expiring-soon/', InventoryViewSet.as_view({'get': 'expiring_soon'}), name='inventory_expiring_soon'),
    
    # Request management endpoints
    path('requests/<int:pk>/approve/', ResourceRequestViewSet.as_view({'post': 'approve'}), name='approve_request'),
    path('requests/<int:pk>/reject/', ResourceRequestViewSet.as_view({'post': 'reject'}), name='reject_request'),
]