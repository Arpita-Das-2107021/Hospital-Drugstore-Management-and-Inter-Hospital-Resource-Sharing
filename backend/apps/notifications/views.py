"""Notifications app views."""
import csv
import json
import logging

from django.db.models import BooleanField, OuterRef, Q, Subquery, Value
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import CanManageHospitalBroadcasts, IsSuperAdmin
from common.permissions.runtime import has_any_permission, is_platform_operator
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import BroadcastMessage, BroadcastRecipient, Notification
from .serializers import (
    BroadcastMessageSerializer,
    BroadcastMessagesRefreshInputSerializer,
    EmergencyBroadcastResponseSerializer,
    EmergencyRespondInputSerializer,
    NotificationSerializer,
)
from .services import (
    acknowledge_broadcast_version,
    can_view_broadcast_responses,
    close_broadcast,
    create_broadcast_recipients,
    create_emergency_response,
    delete_broadcast,
    get_broadcast_badge_metadata,
    get_broadcast_version,
    get_unread_broadcast_count,
    mark_all_read,
    mark_broadcast_read,
    mark_notification_read,
    record_broadcast_change,
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
        if self.action in (
            "respond",
            "responses",
            "response_detail",
            "responses_export",
            "close",
            "list",
            "retrieve",
            "read",
            "messages",
            "unread_count",
        ):
            return [IsAuthenticated()]
        if self.action == "create":
            return [IsAuthenticated(), CanManageHospitalBroadcasts()]
        if self.action in ("destroy", "update", "partial_update"):
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        user = self.request.user
        base_qs = BroadcastMessage.objects.all().order_by("-created_at")

        if is_platform_operator(user, allow_role_fallback=True):
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

    def _assert_can_view_broadcast_responses(self, *, broadcast, user):
        if can_view_broadcast_responses(broadcast, user):
            return
        raise PermissionDenied("Only sender or authorized broadcast managers can view responses.")

    def _responses_queryset(self, *, broadcast):
        return broadcast.responses.select_related("hospital", "responded_by").order_by("-responded_at")

    def _assert_refresh_scope_access(self, *, requested_scope, user) -> None:
        if not requested_scope:
            return

        if requested_scope == "platform":
            if not is_platform_operator(user, allow_role_fallback=True):
                raise PermissionDenied("Platform scope refresh requires platform context.")
            return

        if requested_scope == "healthcare":
            if is_platform_operator(user, allow_role_fallback=True):
                raise PermissionDenied("Healthcare scope refresh requires healthcare context.")
            hospital_id = getattr(getattr(user, "staff", None), "hospital_id", None)
            if not hospital_id:
                raise PermissionDenied("Healthcare scope refresh requires hospital context.")
            return

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        broadcast = self.get_object()
        if not is_platform_operator(request.user, allow_role_fallback=True):
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
        record_broadcast_change(action="create", broadcast=broadcast)
        return Response(success_response(data=self.get_serializer(broadcast).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return Response(success_response(data={"detail": "Broadcasts cannot be edited after creation."}),
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        broadcast = self.get_object()
        delete_broadcast(broadcast)
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
        broadcast_meta = get_broadcast_badge_metadata(request.user)
        return Response(
            success_response(
                data={
                    "total_unread": count,
                    "unread_count": count,
                    **broadcast_meta,
                }
            )
        )

    @action(detail=False, methods=["post"], url_path="messages")
    def messages(self, request):
        payload = BroadcastMessagesRefreshInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        requested_scope = payload.validated_data.get("scope")
        self._assert_refresh_scope_access(requested_scope=requested_scope, user=request.user)

        current_version = get_broadcast_version()
        last_known_version = payload.validated_data.get("last_known_version", 0)
        limit = payload.validated_data.get("limit", 100)

        messages = []
        if current_version > last_known_version:
            queryset = self.filter_queryset(self.get_queryset())[:limit]
            messages = self.get_serializer(queryset, many=True).data

        acknowledge_broadcast_version(request.user, current_version)
        return Response(
            success_response(
                data={
                    "broadcast_version": current_version,
                    "messages": messages,
                }
            )
        )

    @action(detail=True, methods=["get"], url_path="responses")
    def responses(self, request, pk=None):
        broadcast = self.get_object()
        self._assert_can_view_broadcast_responses(broadcast=broadcast, user=request.user)
        responses = self._responses_queryset(broadcast=broadcast)
        return Response(success_response(data=EmergencyBroadcastResponseSerializer(responses, many=True).data))

    @action(detail=True, methods=["get"], url_path=r"responses/(?P<response_id>[0-9a-fA-F-]{36})")
    def response_detail(self, request, pk=None, response_id=None):
        broadcast = self.get_object()
        self._assert_can_view_broadcast_responses(broadcast=broadcast, user=request.user)
        response_obj = self._responses_queryset(broadcast=broadcast).filter(id=response_id).first()
        if response_obj is None:
            raise NotFound("Response not found.")
        return Response(success_response(data=EmergencyBroadcastResponseSerializer(response_obj).data))

    @action(detail=True, methods=["get"], url_path="responses/export")
    def responses_export(self, request, pk=None):
        broadcast = self.get_object()
        self._assert_can_view_broadcast_responses(broadcast=broadcast, user=request.user)

        export_format = (request.query_params.get("export_format") or "json").strip().lower()
        if export_format not in {"json", "csv"}:
            raise ValidationError({"export_format": "Unsupported format. Use 'json' or 'csv'."})

        response_rows = EmergencyBroadcastResponseSerializer(
            self._responses_queryset(broadcast=broadcast),
            many=True,
        ).data

        if export_format == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="broadcast_{broadcast.id}_responses.csv"'
            writer = csv.writer(response)
            writer.writerow(
                [
                    "id",
                    "broadcast",
                    "hospital",
                    "hospital_name",
                    "responded_by",
                    "responder_name",
                    "response",
                    "can_provide",
                    "quantity_available",
                    "notes",
                    "responded_at",
                ]
            )
            for row in response_rows:
                writer.writerow(
                    [
                        row.get("id"),
                        row.get("broadcast"),
                        row.get("hospital"),
                        row.get("hospital_name"),
                        row.get("responded_by"),
                        row.get("responder_name"),
                        row.get("response"),
                        row.get("can_provide"),
                        row.get("quantity_available"),
                        row.get("notes"),
                        row.get("responded_at"),
                    ]
                )
            return response

        response = HttpResponse(
            json.dumps(response_rows, default=str),
            content_type="application/json",
        )
        response["Content-Disposition"] = f'attachment; filename="broadcast_{broadcast.id}_responses.json"'
        return response

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        broadcast = self.get_object()
        closed = close_broadcast(broadcast, request.user)
        return Response(success_response(data=self.get_serializer(closed).data))

