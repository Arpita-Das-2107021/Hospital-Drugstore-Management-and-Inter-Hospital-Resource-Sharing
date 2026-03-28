"""
API Views for Hospital Resource Sharing System
"""

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from .models import (
    ResourceHospital, ResourceCategory, SharedResource, 
    InventorySyncLog, BedOccupancy, UserProfile, ResourceRequest, 
    Alert, AuditLog, RolePermission, Message, InventoryItem
)
from .serializers import (
    ResourceHospitalSerializer, ResourceCategorySerializer, 
    SharedResourceSerializer, InventorySyncLogSerializer, 
    BedOccupancySerializer, UserProfileSerializer, 
    ResourceRequestSerializer, AlertSerializer, AuditLogSerializer, 
    RolePermissionSerializer, MessageSerializer, InventoryItemSerializer
)


class ResourceHospitalViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing hospitals in the resource sharing network.
    
    list: Get all hospitals
    retrieve: Get a specific hospital
    create: Add a new hospital
    update: Update hospital information
    destroy: Delete a hospital
    """
    queryset = ResourceHospital.objects.all()
    serializer_class = ResourceHospitalSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['city', 'region', 'trust_level', 'is_active']
    search_fields = ['name', 'city', 'region']
    ordering_fields = ['name', 'city', 'created_at']
    ordering = ['name']
    
    @action(detail=True, methods=['GET'])
    def resources(self, request, pk=None):
        """Get resources for a specific hospital."""
        hospital = self.get_object()
        resources = SharedResource.objects.filter(hospital=hospital)
        serializer = SharedResourceSerializer(resources, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['GET'])
    def staff(self, request, pk=None):
        """Get staff members for a specific hospital."""
        hospital = self.get_object()
        staff = UserProfile.objects.filter(hospital=hospital)
        serializer = UserProfileSerializer(staff, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['GET'])
    def inventory(self, request, pk=None):
        """Get inventory items for a specific hospital."""
        hospital = self.get_object()
        inventory = InventoryItem.objects.filter(hospital=hospital)
        serializer = InventoryItemSerializer(inventory, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['GET'])
    def bed_occupancy(self, request, pk=None):
        """Get bed occupancy data for a specific hospital."""
        hospital = self.get_object()
        bed_occupancy = BedOccupancy.objects.filter(hospital=hospital)
        serializer = BedOccupancySerializer(bed_occupancy, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['GET'])
    def alerts(self, request, pk=None):
        """Get alerts for a specific hospital."""
        hospital = self.get_object()
        alerts = Alert.objects.filter(hospital=hospital)
        serializer = AlertSerializer(alerts, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['GET'])
    def dashboard(self, request, pk=None):
        """Get dashboard data for a specific hospital."""
        hospital = self.get_object()
        
        # Get summary statistics
        total_resources = SharedResource.objects.filter(hospital=hospital).count()
        available_resources = SharedResource.objects.filter(
            hospital=hospital, available_quantity__gt=0
        ).count()
        
        total_staff = UserProfile.objects.filter(hospital=hospital, is_active=True).count()
        
        pending_requests = ResourceRequest.objects.filter(
            Q(requesting_hospital=hospital) | Q(providing_hospital=hospital),
            status='pending'
        ).count()
        
        unread_alerts = Alert.objects.filter(
            hospital=hospital, is_read=False
        ).count()
        
        return Response({
            'hospital': ResourceHospitalSerializer(hospital).data,
            'statistics': {
                'total_resources': total_resources,
                'available_resources': available_resources,
                'total_staff': total_staff,
                'pending_requests': pending_requests,
                'unread_alerts': unread_alerts,
            }
        })


class ResourceCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing resource categories.
    """
    queryset = ResourceCategory.objects.all()
    serializer_class = ResourceCategorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['type']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'type']


class SharedResourceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing shared resources.
    
    Supports filtering by hospital, category, availability, and visibility.
    """
    queryset = SharedResource.objects.select_related('hospital', 'category').all()
    serializer_class = SharedResourceSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['hospital', 'category', 'visibility_level', 'is_emergency_stock']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'last_updated', 'available_quantity']
    ordering = ['-last_updated']
    
    def get_queryset(self):
        """Filter resources based on query parameters."""
        queryset = super().get_queryset()
        
        # Filter by availability
        available = self.request.query_params.get('available', None)
        if available is not None:
            if available.lower() == 'true':
                queryset = queryset.filter(available_quantity__gt=0)
        
        # Filter by expiring soon
        expiring_days = self.request.query_params.get('expiring_days', None)
        if expiring_days:
            from django.utils import timezone
            from datetime import timedelta
            expiry_threshold = timezone.now().date() + timedelta(days=int(expiring_days))
            queryset = queryset.filter(expiry_date__lte=expiry_threshold, expiry_date__isnull=False)
        
        return queryset


class InventorySyncLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing inventory synchronization logs.
    Read-only access to sync history.
    """
    queryset = InventorySyncLog.objects.select_related('hospital').all()
    serializer_class = InventorySyncLogSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['hospital', 'sync_status', 'sync_type']
    ordering_fields = ['started_at', 'completed_at']
    ordering = ['-started_at']


class BedOccupancyViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing bed occupancy data.
    """
    queryset = BedOccupancy.objects.select_related('hospital').all()
    serializer_class = BedOccupancySerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['hospital', 'bed_type']
    ordering_fields = ['last_updated']
    ordering = ['-last_updated']


class UserProfileViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user profiles.
    """
    queryset = UserProfile.objects.select_related('hospital').all()
    serializer_class = UserProfileSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['hospital', 'role', 'is_active', 'is_online']
    search_fields = ['full_name', 'email']
    ordering_fields = ['full_name', 'created_at']
    ordering = ['full_name']
    
    @action(detail=False, methods=['GET'])
    def my_hospital_dashboard(self, request):
        """Get dashboard data for the current user's hospital."""
        try:
            user_profile = UserProfile.objects.get(email=request.user.email)
            hospital = user_profile.hospital
            
            # Get summary statistics
            total_resources = SharedResource.objects.filter(hospital=hospital).count()
            available_resources = SharedResource.objects.filter(
                hospital=hospital, available_quantity__gt=0
            ).count()
            
            total_staff = UserProfile.objects.filter(hospital=hospital, is_active=True).count()
            
            outgoing_requests = ResourceRequest.objects.filter(
                requesting_hospital=hospital, status__in=['pending', 'approved']
            ).count()
            
            incoming_requests = ResourceRequest.objects.filter(
                providing_hospital=hospital, status='pending'
            ).count()
            
            unread_alerts = Alert.objects.filter(
                hospital=hospital, is_read=False
            ).count()
            
            # Get recent alerts
            recent_alerts = Alert.objects.filter(
                hospital=hospital, is_read=False
            ).order_by('-created_at')[:5]
            
            # Get critical inventory items
            critical_inventory = InventoryItem.objects.filter(
                hospital=hospital
            ).extra(
                where=["current_stock <= reorder_level"]
            )[:5]
            
            return Response({
                'hospital': ResourceHospitalSerializer(hospital).data,
                'user_profile': UserProfileSerializer(user_profile).data,
                'statistics': {
                    'total_resources': total_resources,
                    'available_resources': available_resources,
                    'total_staff': total_staff,
                    'outgoing_requests': outgoing_requests,
                    'incoming_requests': incoming_requests,
                    'unread_alerts': unread_alerts,
                },
                'recent_alerts': AlertSerializer(recent_alerts, many=True).data,
                'critical_inventory': InventoryItemSerializer(critical_inventory, many=True).data
            })
            
        except UserProfile.DoesNotExist:
            return Response({
                'error': 'User profile not found'
            }, status=status.HTTP_404_NOT_FOUND)


class ResourceRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing resource requests.
    """
    queryset = ResourceRequest.objects.select_related(
        'resource', 'requesting_hospital', 'providing_hospital', 
        'requested_by', 'approved_by'
    ).all()
    serializer_class = ResourceRequestSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'urgency', 'requesting_hospital', 'providing_hospital']
    ordering_fields = ['requested_at', 'updated_at']
    ordering = ['-requested_at']
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a resource request."""
        resource_request = self.get_object()
        resource_request.status = 'approved'
        resource_request.approved_by_id = request.data.get('approved_by')
        resource_request.response_notes = request.data.get('response_notes', '')
        resource_request.save()
        serializer = self.get_serializer(resource_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a resource request."""
        resource_request = self.get_object()
        resource_request.status = 'rejected'
        resource_request.response_notes = request.data.get('response_notes', '')
        resource_request.save()
        serializer = self.get_serializer(resource_request)
        return Response(serializer.data)


class AlertViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing alerts and notifications.
    """
    queryset = Alert.objects.select_related('hospital', 'resource').all()
    serializer_class = AlertSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['hospital', 'alert_type', 'severity', 'is_read', 'is_resolved']
    ordering_fields = ['created_at', 'severity']
    ordering = ['-created_at']
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark an alert as read."""
        alert = self.get_object()
        alert.is_read = True
        alert.save()
        serializer = self.get_serializer(alert)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark an alert as resolved."""
        alert = self.get_object()
        alert.is_resolved = True
        from django.utils import timezone
        alert.resolved_at = timezone.now()
        alert.save()
        serializer = self.get_serializer(alert)
        return Response(serializer.data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing audit logs.
    Read-only access to audit trail.
    """
    queryset = AuditLog.objects.select_related('user', 'hospital').all()
    serializer_class = AuditLogSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['hospital', 'user', 'action_type']
    search_fields = ['action', 'resource_name', 'details']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']


class RolePermissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing role-based permissions.
    """
    queryset = RolePermission.objects.all()
    serializer_class = RolePermissionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['role', 'description']


class MessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing inter-user messages.
    """
    queryset = Message.objects.select_related('sender', 'recipient').all()
    serializer_class = MessageSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['sender', 'recipient', 'is_read', 'message_type']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a message as read."""
        message = self.get_object()
        message.is_read = True
        from django.utils import timezone
        message.read_at = timezone.now()
        message.save()
        serializer = self.get_serializer(message)
        return Response(serializer.data)


class InventoryItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing inventory items.
    """
    queryset = InventoryItem.objects.select_related('hospital').all()
    serializer_class = InventoryItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['hospital', 'category', 'abc_classification', 'ved_classification']
    search_fields = ['name', 'supplier']
    ordering_fields = ['name', 'last_updated', 'current_stock']
    ordering = ['-last_updated']
    
    def get_queryset(self):
        """Filter inventory items based on query parameters."""
        from django.db import models
        queryset = super().get_queryset()
        
        # Filter by critical stock
        critical = self.request.query_params.get('critical', None)
        if critical and critical.lower() == 'true':
            queryset = queryset.filter(current_stock__lte=models.F('reorder_level'))
        
        # Filter by expiring soon
        expiring_days = self.request.query_params.get('expiring_days', None)
        if expiring_days:
            from django.utils import timezone
            from datetime import timedelta
            expiry_threshold = timezone.now().date() + timedelta(days=int(expiring_days))
            queryset = queryset.filter(expiry_date__lte=expiry_threshold, expiry_date__isnull=False)
        
        return queryset
    
    @action(detail=False, methods=['GET'])
    def analytics(self, request):
        """Get comprehensive inventory analytics and performance tracking data."""
        from django.db.models import Sum, Avg, Count, F, Q, ExpressionWrapper, FloatField
        from django.utils import timezone
        from datetime import timedelta
        from collections import defaultdict
        
        # Get hospital filter
        hospital_id = request.query_params.get('hospital', None)
        queryset = self.get_queryset()
        
        if hospital_id:
            queryset = queryset.filter(hospital_id=hospital_id)
        
        # Overall statistics
        total_items = queryset.count()
        total_value = queryset.aggregate(
            total=Sum(ExpressionWrapper(
                F('current_stock') * F('unit_price'),
                output_field=FloatField()
            ))
        )['total'] or 0
        
        # Stock status analysis
        critical_items = queryset.filter(current_stock__lte=F('reorder_level')).count()
        low_stock_items = queryset.filter(
            current_stock__gt=F('reorder_level'),
            current_stock__lte=F('reorder_level') * 1.5
        ).count()
        adequate_items = total_items - critical_items - low_stock_items
        
        # Days of supply data - calculate for each category
        days_of_supply_data = []
        categories = queryset.values_list('category', flat=True).distinct()
        for category in categories:
            cat_items = queryset.filter(category=category)
            avg_stock = cat_items.aggregate(avg=Avg('current_stock'))['avg'] or 0
            avg_reorder = cat_items.aggregate(avg=Avg('reorder_level'))['avg'] or 1
            days = int((avg_stock / avg_reorder) * 30) if avg_reorder > 0 else 0
            status = 'good' if days > 30 else ('warning' if days > 15 else 'critical')
            days_of_supply_data.append({
                'category': category,
                'days': min(days, 90),  # Cap at 90 days for chart
                'status': status
            })
        
        # Clinical impact analysis
        clinical_impact_data = []
        for ved in ['V', 'E', 'D']:
            ved_items = queryset.filter(ved_classification=ved)
            total = ved_items.count()
            critical = ved_items.filter(current_stock__lte=F('reorder_level')).count()
            adequate = total - critical
            classification = 'Vital' if ved == 'V' else ('Essential' if ved == 'E' else 'Desirable')
            clinical_impact_data.append({
                'classification': classification,
                'adequate': adequate,
                'critical': critical
            })
        
        # Expiry risk analysis
        today = timezone.now().date()
        expiry_30 = queryset.filter(
            expiry_date__lte=today + timedelta(days=30),
            expiry_date__gte=today
        ).count()
        expiry_60 = queryset.filter(
            expiry_date__lte=today + timedelta(days=60),
            expiry_date__gt=today + timedelta(days=30)
        ).count()
        expiry_90 = queryset.filter(
            expiry_date__lte=today + timedelta(days=90),
            expiry_date__gt=today + timedelta(days=60)
        ).count()
        expiry_safe = queryset.filter(
            Q(expiry_date__gt=today + timedelta(days=90)) | Q(expiry_date__isnull=True)
        ).count()
        
        # ABC-VED analysis
        abc_ved_matrix = []
        for abc in ['A', 'B', 'C']:
            for ved in ['V', 'E', 'D']:
                count = queryset.filter(abc_classification=abc, ved_classification=ved).count()
                abc_ved_matrix.append({
                    'abc': abc,
                    'ved': ved,
                    'count': count
                })
        
        # Stock turnover by category (simulated data based on current stock)
        turnover_data = []
        for category in categories:
            cat_items = queryset.filter(category=category)
            avg_stock = cat_items.aggregate(avg=Avg('current_stock'))['avg'] or 0
            # Simulate turnover rate based on stock levels
            turnover = round(avg_stock / 100, 2) if avg_stock > 0 else 0
            turnover_data.append({
                'category': category,
                'turnover': turnover
            })
        
        # Top items by value
        top_value_items = []
        items_with_value = queryset.annotate(
            total_value=ExpressionWrapper(
                F('current_stock') * F('unit_price'),
                output_field=FloatField()
            )
        ).order_by('-total_value')[:10]
        
        for item in items_with_value:
            top_value_items.append({
                'name': item.name,
                'value': float(item.total_value),
                'stock': item.current_stock,
                'category': item.category
            })
        
        # Items requiring attention
        attention_items = []
        critical_stock_items = queryset.filter(current_stock__lte=F('reorder_level'))[:10]
        for item in critical_stock_items:
            days_to_expiry = (item.expiry_date - today).days if item.expiry_date else None
            attention_items.append({
                'name': item.name,
                'category': item.category,
                'current_stock': item.current_stock,
                'reorder_level': item.reorder_level,
                'days_to_expiry': days_to_expiry,
                'issue': 'critical_stock',
                'ved_classification': item.ved_classification
            })
        
        # Recent activity (simulated based on last_updated)
        recent_activity = []
        recent_items = queryset.order_by('-last_updated')[:10]
        for item in recent_items:
            recent_activity.append({
                'name': item.name,
                'action': 'updated',
                'timestamp': item.last_updated.isoformat(),
                'stock': item.current_stock
            })
        
        return Response({
            'summary': {
                'total_items': total_items,
                'total_value': round(total_value, 2),
                'critical_items': critical_items,
                'low_stock_items': low_stock_items,
                'adequate_items': adequate_items,
                'expiring_30_days': expiry_30,
                'expiring_60_days': expiry_60,
                'expiring_90_days': expiry_90
            },
            'days_of_supply': days_of_supply_data,
            'clinical_impact': clinical_impact_data,
            'expiry_risk': {
                '0-30': expiry_30,
                '31-60': expiry_60,
                '61-90': expiry_90,
                '90+': expiry_safe
            },
            'abc_ved_matrix': abc_ved_matrix,
            'turnover_by_category': turnover_data,
            'top_value_items': top_value_items,
            'attention_required': attention_items,
            'recent_activity': recent_activity
        })
