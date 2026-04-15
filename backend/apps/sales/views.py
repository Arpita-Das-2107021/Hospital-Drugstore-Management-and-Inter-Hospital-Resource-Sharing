"""API views for internal operational sales."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import IsVerifiedHospital, RequireHealthcareContext
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .serializers import (
    InternalSaleCreateSerializer,
    InternalSaleResourceOptionSerializer,
    InternalSaleSerializer,
    RetailSaleCreateSerializer,
    RetailSaleSerializer,
)
from .services import (
    create_internal_sale,
    create_retail_sale,
    get_internal_sale_for_user,
    get_retail_sale_for_user,
    list_internal_sales_for_user,
    list_internal_sale_resource_options,
    list_retail_sales_for_user,
    resolve_sale_facility,
)


class InternalSaleCollectionAPIView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get(self, request):
        queryset = list_internal_sales_for_user(
            user=request.user,
            hospital_id=request.query_params.get("hospital_id"),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        data = InternalSaleSerializer(page, many=True).data
        return paginator.get_paginated_response(data)

    def post(self, request):
        serializer = InternalSaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        facility = resolve_sale_facility(
            user=request.user,
            hospital_id=validated.get("hospital_id"),
        )

        sale, idempotent = create_internal_sale(
            facility=facility,
            actor=request.user,
            resource_catalog_id=validated.get("resource_catalog_id"),
            medicine_name=validated.get("medicine_name", ""),
            quantity_sold=validated["quantity_sold"],
            event_date=validated.get("event_date"),
            unit=validated.get("unit", "units"),
            resource_type_name=validated.get("resource_type", "Medication"),
            unit_price=validated.get("unit_price"),
            total_amount=validated.get("total_amount"),
            currency=validated.get("currency", "BDT"),
            channel=validated.get("channel"),
            client_reference=validated.get("client_reference", ""),
            notes=validated.get("notes", ""),
            raw_payload=validated.get("raw_payload") or {},
        )

        payload = InternalSaleSerializer(sale).data
        payload["idempotent"] = idempotent
        return Response(
            success_response(data=payload),
            status=status.HTTP_200_OK if idempotent else status.HTTP_201_CREATED,
        )


class InternalSaleResourceOptionsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedHospital]

    def get(self, request):
        facility = resolve_sale_facility(
            user=request.user,
            hospital_id=request.query_params.get("hospital_id"),
        )
        options = list_internal_sale_resource_options(facility=facility)
        payload = InternalSaleResourceOptionSerializer(options, many=True).data
        return Response(success_response(data=payload), status=status.HTTP_200_OK)


class InternalSaleDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, IsVerifiedHospital]

    def get(self, request, sale_id):
        sale = get_internal_sale_for_user(user=request.user, sale_id=sale_id)
        return Response(success_response(data=InternalSaleSerializer(sale).data), status=status.HTTP_200_OK)


class RetailSaleCollectionAPIView(APIView):
    permission_classes = [IsAuthenticated, RequireHealthcareContext]
    pagination_class = StandardResultsPagination

    def get(self, request):
        queryset = list_retail_sales_for_user(
            user=request.user,
            hospital_id=request.query_params.get("hospital_id"),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        data = RetailSaleSerializer(page, many=True).data
        return paginator.get_paginated_response(data)

    def post(self, request):
        serializer = RetailSaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        sale = create_retail_sale(
            user=request.user,
            inventory_id=validated["inventory_id"],
            batch_id=validated.get("batch_id"),
            quantity=validated["quantity"],
            customer_reference=validated.get("customer_reference", ""),
            notes=validated.get("notes", ""),
        )

        payload = RetailSaleSerializer(sale).data
        return Response(success_response(data=payload), status=status.HTTP_201_CREATED)


class RetailSaleDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, RequireHealthcareContext]

    def get(self, request, sale_id):
        sale = get_retail_sale_for_user(user=request.user, sale_id=sale_id)
        return Response(success_response(data=RetailSaleSerializer(sale).data), status=status.HTTP_200_OK)
