"""
URL Configuration for Resources API
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from . import auth_views
from . import views_registry

router = DefaultRouter()

# Register all viewsets with the router
router.register(r'hospitals', views.ResourceHospitalViewSet, basename='hospital')
router.register(r'categories', views.ResourceCategoryViewSet, basename='category')
router.register(r'shared-resources', views.SharedResourceViewSet, basename='shared-resource')
router.register(r'sync-logs', views.InventorySyncLogViewSet, basename='sync-log')
router.register(r'bed-occupancy', views.BedOccupancyViewSet, basename='bed-occupancy')
router.register(r'users', views.UserProfileViewSet, basename='user')
router.register(r'requests', views.ResourceRequestViewSet, basename='request')
router.register(r'alerts', views.AlertViewSet, basename='alert')
router.register(r'audit-logs', views.AuditLogViewSet, basename='audit-log')
router.register(r'permissions', views.RolePermissionViewSet, basename='permission')
router.register(r'messages', views.MessageViewSet, basename='message')
router.register(r'inventory', views.InventoryItemViewSet, basename='inventory')

app_name = 'resources'

urlpatterns = [
    # Hospital Registration endpoints
    path('hospitals/register/', views_registry.RegisterHospitalAPIView.as_view(), name='hospital-register'),
    path('hospitals/list/', views_registry.ListHospitalsAPIView.as_view(), name='hospital-list'),
    path('hospitals/verify/', views_registry.VerifyHospitalAPIView.as_view(), name='hospital-verify'),
    path('hospitals/approve/', views_registry.ApproveHospitalAPIView.as_view(), name='hospital-approve'),
    path('hospitals/reject/', views_registry.RejectHospitalAPIView.as_view(), name='hospital-reject'),
    
    # Authentication endpoints (JWT-based)
    path('auth/register/', auth_views.register_view, name='auth-register'),
    path('auth/login/', auth_views.login_view, name='auth-login'),
    path('auth/logout/', auth_views.logout_view, name='auth-logout'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/user/', auth_views.current_user_view, name='auth-current-user'),
    path('auth/change-password/', auth_views.change_password_view, name='auth-change-password'),
    path('auth/password-reset/', auth_views.password_reset_request_view, name='auth-password-reset'),
    path('auth/verify-token/', auth_views.verify_token_view, name='auth-verify-token'),
    
    # Custom hospital dashboard endpoint
    path('dashboard/my-hospital/', views.UserProfileViewSet.as_view({'get': 'my_hospital_dashboard'}), name='my-hospital-dashboard'),
    
    # Resource endpoints
    path('', include(router.urls)),
]
