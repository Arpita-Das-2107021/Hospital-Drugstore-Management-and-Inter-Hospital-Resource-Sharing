"""Notifications app views."""
import logging

from django.db.models import BooleanField, OuterRef, Q, Subquery, Value
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import IsHospitalAdmin, IsSuperAdmin
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import BroadcastMessage, BroadcastRecipient, Notification
from .serializers import BroadcastMessageSerializer, EmergencyBroadcastResponseSerializer, EmergencyRespondInputSerializer, NotificationSerializer
from .services import (
    can_view_broadcast_responses,
    close_broadcast,
    create_broadcast_recipients,
    create_emergency_response,
    get_unread_broadcast_count,
    mark_all_read,
    mark_broadcast_read,
    mark_notification_read,
    send_broadcast,
)

logger = logging.getLogger("hrsp.notifications")


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """User's own notifications."""

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        updated = mark_notification_read(notification, request.user)
        return Response(success_response(data=self.get_serializer(updated).data))

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read_action(self, request):
        count = mark_all_read(request.user)
        return Response(success_response(data={"marked_read": count}))


class BroadcastMessageViewSet(viewsets.ModelViewSet):
    serializer_class = BroadcastMessageSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_permissions(self):
        if self.action in ("respond", "responses", "close", "list", "retrieve", "read", "unread_count"):
            return [IsAuthenticated()]
        if self.action == "create":
            return [IsAuthenticated(), IsHospitalAdmin()]
        if self.action in ("destroy", "update", "partial_update"):
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        user = self.request.user
        base_qs = BroadcastMessage.objects.all().order_by("-created_at")

        if user.roles.filter(name="SUPER_ADMIN").exists():
            return base_qs

        hospital_id = getattr(getattr(user, "staff", None), "hospital_id", None)
        if hospital_id:
            recipient_is_read = Subquery(
                BroadcastRecipient.objects.filter(
                    broadcast_id=OuterRef("pk"), hospital_id=hospital_id
                ).values("is_read")[:1],
                output_field=BooleanField(),
            )
            return base_qs.filter(
                Q(scope=BroadcastMessage.Scope.ALL)
                | Q(target_hospitals__id=hospital_id)
                | Q(sent_by=user)
            ).annotate(
                recipient_is_read=recipient_is_read,
            ).distinct()

        return base_qs.filter(sent_by=user).annotate(
            recipient_is_read=Value(True, output_field=BooleanField())
        )

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        broadcast = self.get_object()
        if not request.user.roles.filter(name="SUPER_ADMIN").exists():
            read_state = mark_broadcast_read(broadcast, request.user)
            broadcast.recipient_is_read = read_state["is_read"]
        return Response(success_response(data=self.get_serializer(broadcast).data))

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        broadcast = s.save()
        create_broadcast_recipients(broadcast)
        # honor write-only flag from serializer (default False)
        send_email_flag = s.validated_data.get("send_email", False)
        send_broadcast(broadcast, request.user, send_email=send_email_flag)
        return Response(success_response(data=self.get_serializer(broadcast).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return Response(success_response(data={"detail": "Broadcasts cannot be edited after creation."}),
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(success_response(data={"detail": "Broadcast deleted."}))

    @action(detail=True, methods=["post"], url_path="respond")
    def respond(self, request, pk=None):
        """Hospital staff responds to an emergency broadcast."""
        broadcast = self.get_object()
        hospital = request.user.staff.hospital if (hasattr(request.user, "staff") and request.user.staff) else None
        if not hospital:
            return Response(success_response(data={"detail": "No hospital context."}), status=status.HTTP_400_BAD_REQUEST)
        s = EmergencyRespondInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        response = create_emergency_response(
            broadcast=broadcast,
            hospital=hospital,
            data={
                "response_message": s.validated_data.get("response", s.validated_data.get("notes", "")),
                "can_provide": s.validated_data.get("can_provide", False),
                "quantity_available": s.validated_data.get("quantity_available"),
                "notes": s.validated_data.get("notes", ""),
            },
            actor=request.user,
        )
        return Response(success_response(data=EmergencyBroadcastResponseSerializer(response).data))

    @action(detail=True, methods=["post"], url_path="read")
    def read(self, request, pk=None):
        broadcast = self.get_object()
        result = mark_broadcast_read(broadcast, request.user)
        return Response(success_response(data=result))

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = get_unread_broadcast_count(request.user)
        return Response(success_response(data={"unread_count": count}))

    @action(detail=True, methods=["get"], url_path="responses")
    def responses(self, request, pk=None):
        broadcast = self.get_object()
        if not can_view_broadcast_responses(broadcast, request.user):
            raise PermissionDenied("Only the broadcast creator or a super admin can view responses.")
        responses = broadcast.responses.select_related("hospital").all()
        return Response(success_response(data=EmergencyBroadcastResponseSerializer(responses, many=True).data))

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        broadcast = self.get_object()
        closed = close_broadcast(broadcast, request.user)
        return Response(success_response(data=self.get_serializer(closed).data))

