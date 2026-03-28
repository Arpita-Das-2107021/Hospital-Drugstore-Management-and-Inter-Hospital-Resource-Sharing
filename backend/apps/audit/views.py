"""Audit app views — read-only access."""
import logging

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import IsSuperAdmin
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import AuditLog
from .serializers import AuditLogSerializer

logger = logging.getLogger("hrsp.audit")


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor", "hospital").order_by("-created_at")
        # Optional filters via query params
        event_type = self.request.query_params.get("event_type")
        hospital_id = self.request.query_params.get("hospital_id")
        actor_id = self.request.query_params.get("actor_id")
        if event_type:
            qs = qs.filter(event_type=event_type)
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))
