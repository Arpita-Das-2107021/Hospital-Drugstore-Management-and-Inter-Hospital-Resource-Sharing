"""
Database Direct API URLs for Hospital Resource Sharing System V2
Simple URL configuration for raw SQL-based API endpoints
"""

from django.urls import path
from . import db_api_views

urlpatterns = [
    # Health check
    path('health/', db_api_views.health_check_v2, name='health_check_v2'),
    
    # Core data endpoints
    path('hospitals/', db_api_views.get_hospitals, name='hospitals_list'),
    path('hospitals/<int:hospital_id>/', db_api_views.get_hospital_by_id, name='hospital_detail'),
    path('inventory/', db_api_views.get_inventory, name='inventory_list'),
    path('requests/', db_api_views.get_resource_requests, name='requests_list'),
    path('staff/', db_api_views.get_staff, name='staff_list'),
    
    # Analytics endpoints
    path('analytics/inventory/', db_api_views.get_inventory_analytics, name='inventory_analytics'),
    
    # Dashboard endpoint
    path('hospitals/<int:hospital_id>/dashboard/', db_api_views.get_hospital_dashboard, name='hospital_dashboard'),
]