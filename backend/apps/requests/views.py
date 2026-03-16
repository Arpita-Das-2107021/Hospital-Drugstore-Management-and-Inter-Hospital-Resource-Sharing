"""Requests app views."""
import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import IsHospitalAdmin, IsLogisticsStaff, IsVerifiedHospital
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import ResourceRequest
from .serializers import (
    ApprovalSerializer,
    ConfirmDeliverySerializer,
    ConfirmPaymentSerializer,
    CreateRequestSerializer,
    DeliveryEventSerializer,
    DispatchEventSerializer,
    ResourceRequestSerializer,
    VerifyReturnSerializer,
)
from .services import (
    approve_request,
    cancel_request,
    confirm_payment,
    confirm_delivery,
    create_resource_request,
    dispatch_request,
    verify_return,
)

logger = logging.getLogger("hrsp.requests")


class ResourceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ResourceRequestSerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return ResourceRequest.objects.none()
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return ResourceRequest.objects.select_related(
                "requesting_hospital", "supplying_hospital", "catalog_item"
            ).all()
        if hasattr(user, "staff") and user.staff:
            hospital = user.staff.hospital
            return ResourceRequest.objects.select_related(
                "requesting_hospital", "supplying_hospital", "catalog_item"
            ).filter(
                requesting_hospital=hospital
            ) | ResourceRequest.objects.select_related(
                "requesting_hospital", "supplying_hospital", "catalog_item"
            ).filter(supplying_hospital=hospital)
        return ResourceRequest.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        s = CreateRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        hospital = request.user.staff.hospital if (hasattr(request.user, "staff") and request.user.staff) else None
        req = create_resource_request(hospital, s.validated_data, request.user)
        return Response(
            success_response(data=ResourceRequestSerializer(req).data),
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        return Response(success_response(data={"detail": "Use action endpoints to update state."}),
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        req = self.get_object()
        cancel_request(req, request.user, reason=request.data.get("reason", ""))
        return Response(success_response(data={"detail": "Request cancelled."}))

    @action(detail=True, methods=["post"], url_path="approve", permission_classes=[IsAuthenticated, IsHospitalAdmin])
    def approve(self, request, pk=None):
        req = self.get_object()
        s = ApprovalSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        updated_req = approve_request(
            req=req,
            decision=d["decision"],
            quantity_approved=d.get("quantity_approved"),
            reason=d.get("reason", ""),
            actor=request.user,
        )
        return Response(success_response(data=ResourceRequestSerializer(updated_req).data))

    @action(detail=True, methods=["post"], url_path="dispatch", permission_classes=[IsAuthenticated, IsLogisticsStaff])
    def dispatch_action(self, request, pk=None):
        req = self.get_object()
        dispatch_event = dispatch_request(req=req, actor=request.user, notes=request.data.get("notes", ""))
        return Response(success_response(data=DispatchEventSerializer(dispatch_event).data))

    @action(detail=False, methods=["post"], url_path="confirm-delivery", permission_classes=[IsAuthenticated])
    def confirm_delivery_action(self, request):
        s = ConfirmDeliverySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        delivery_event = confirm_delivery(
            token_value=d["dispatch_token"],
            quantity_received=d["quantity_received"],
            notes=d.get("notes", ""),
            actor=request.user,
            receive_token=d.get("receive_token"),
        )
        return Response(success_response(data=DeliveryEventSerializer(delivery_event).data))

    @action(detail=True, methods=["post"], url_path="confirm-payment", permission_classes=[IsAuthenticated])
    def confirm_payment_action(self, request, pk=None):
        req = self.get_object()
        s = ConfirmPaymentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        updated_req = confirm_payment(
            req=req,
            payment_status=d["payment_status"],
            payment_note=d.get("payment_note", ""),
            actor=request.user,
        )
        return Response(success_response(data=ResourceRequestSerializer(updated_req).data))

    @action(detail=True, methods=["post"], url_path="verify-return", permission_classes=[IsAuthenticated, IsLogisticsStaff])
    def verify_return_action(self, request, pk=None):
        req = self.get_object()
        s = VerifyReturnSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        verify_return(req=req, return_token=s.validated_data["return_token"], actor=request.user)
        return Response(success_response(data=ResourceRequestSerializer(req).data))

