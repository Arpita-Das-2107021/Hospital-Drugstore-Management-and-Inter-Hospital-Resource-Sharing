"""Resources app views."""
import logging

from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import IsHospitalAdmin, IsPharmacist, IsVerifiedHospital
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction, ResourceType
from .serializers import (
    AdjustInventorySerializer,
    InventoryShareVisibilitySerializer,
    InventoryShareVisibilityWriteSerializer,
    ResourceCatalogSerializer,
    ResourceInventorySerializer,
    ResourceShareSerializer,
    ResourceTransactionSerializer,
    ResourceTypeSerializer,
)
from .services import adjust_inventory, create_catalog_item, create_resource_share

logger = logging.getLogger("hrsp.resources")



class ResourceTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ResourceType.objects.all().order_by("name")
    serializer_class = ResourceTypeSerializer
    permission_classes = [IsAuthenticated]


class ResourceCatalogViewSet(viewsets.ModelViewSet):
    serializer_class = ResourceCatalogSerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return ResourceCatalog.objects.select_related("hospital", "resource_type").all()
        if hasattr(user, "staff") and user.staff:
            return ResourceCatalog.objects.select_related("hospital", "resource_type").filter(
                hospital=user.staff.hospital
            )
        return ResourceCatalog.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        hospital = request.user.staff.hospital if (hasattr(request.user, "staff") and request.user.staff) else None
        if hospital is None:
            return Response(success_response(data={"detail": "No hospital context."}), status=status.HTTP_400_BAD_REQUEST)
        # Inject hospital so the serializer can validate the complete payload
        data = {**request.data, "hospital": str(hospital.id)}
        s = self.get_serializer(data=data)
        s.is_valid(raise_exception=True)
        item = create_catalog_item(hospital, {k: v for k, v in s.validated_data.items() if k != "hospital"})
        return Response(success_response(data=self.get_serializer(item).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(success_response(data=s.data))

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(success_response(data={"detail": "Deleted."}), status=status.HTTP_200_OK)


class ResourceInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ResourceInventorySerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return ResourceInventory.objects.select_related("catalog_item__hospital").all()
        if hasattr(user, "staff") and user.staff:
            return ResourceInventory.objects.select_related("catalog_item__hospital").filter(
                catalog_item__hospital=user.staff.hospital
            )
        return ResourceInventory.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    @action(detail=True, methods=["post"], url_path="adjust", permission_classes=[IsAuthenticated, IsPharmacist])
    def adjust(self, request, pk=None):
        inventory = self.get_object()
        s = AdjustInventorySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        updated = adjust_inventory(
            inventory=inventory,
            quantity_delta=d["quantity_delta"],
            transaction_type=d["transaction_type"],
            actor=request.user,
            notes=d.get("notes", ""),
        )
        return Response(success_response(data=ResourceInventorySerializer(updated).data))

    @action(detail=True, methods=["get"], url_path="transactions")
    def transactions(self, request, pk=None):
        inventory = self.get_object()
        qs = ResourceTransaction.objects.filter(inventory=inventory).order_by("-created_at")
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(ResourceTransactionSerializer(page, many=True).data)
        return Response(success_response(data=ResourceTransactionSerializer(qs, many=True).data))


class ResourceShareViewSet(viewsets.ModelViewSet):
    serializer_class = ResourceShareSerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination
    filterset_fields = ("hospital", "catalog_item", "catalog_item__resource_type", "status")
    search_fields = ("catalog_item__name", "hospital__name", "notes")
    ordering_fields = ("created_at", "updated_at", "valid_until", "quantity_offered")
    ordering = ("-created_at",)

    def _active_shareable_queryset(self):
        now = timezone.now()
        return (
            ResourceShare.objects.select_related("hospital", "catalog_item")
            .filter(
                status=ResourceShare.Status.ACTIVE,
                catalog_item__is_shareable=True,
                quantity_offered__gt=0,
            )
            .filter(Q(valid_until__isnull=True) | Q(valid_until__gt=now))
        )

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return ResourceShare.objects.select_related("hospital", "catalog_item").all()
        if hasattr(user, "staff") and user.staff:
            action = getattr(self, "action", None)
            # Hospitals can discover active shares across hospitals but can modify only their own shares.
            if action in ("list", "retrieve"):
                return self._active_shareable_queryset()
            return ResourceShare.objects.select_related("hospital", "catalog_item").filter(hospital=user.staff.hospital)
        return ResourceShare.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        hospital = request.user.staff.hospital if (hasattr(request.user, "staff") and request.user.staff) else None
        share = create_resource_share(
            hospital=hospital,
            catalog_item_id=s.validated_data["catalog_item"].id,
            data={k: v for k, v in s.validated_data.items() if k not in ("catalog_item", "hospital")},
            actor=request.user,
        )
        return Response(success_response(data=self.get_serializer(share).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(success_response(data=s.data))

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(success_response(data={"detail": "Share closed."}))


class InventoryShareVisibilityView(APIView):
    """
    Inventory Share Visibility endpoint.
    
    GET: Returns hospital's inventory items with their shared quantities.
    POST: Create or update share configuration for an inventory item.
    """

    permission_classes = [IsAuthenticated, IsVerifiedHospital]

    def get(self, request, *args, **kwargs):
        """
        List hospital's inventory with shared quantities.
        Only returns inventory belonging to the logged-in hospital.
        """
        hospital = None
        if hasattr(request.user, "staff") and request.user.staff:
            hospital = request.user.staff.hospital
        elif request.user.roles.filter(name="SUPER_ADMIN").exists():
            # Super admins cannot directly access this endpoint in write mode
            # but GET may show all hospitals (configurable)
            return Response(
                success_response(data={"detail": "Super admins cannot use this endpoint."}),
                status=status.HTTP_403_FORBIDDEN,
            )
        else:
            return Response(
                success_response(data={"detail": "No hospital context."}),
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get all inventory for this hospital
        inventories = ResourceInventory.objects.filter(
            catalog_item__hospital=hospital
        ).select_related("catalog_item", "catalog_item__hospital")

        visibility_data = []
        for inventory in inventories:
            catalog_item = inventory.catalog_item
            # Find matching resource share
            try:
                share = ResourceShare.objects.get(
                    hospital=hospital,
                    catalog_item=catalog_item,
                )
                shared_qty = share.quantity_offered
                share_id = share.id
            except ResourceShare.DoesNotExist:
                shared_qty = 0
                share_id = None

            visibility_data.append({
                "inventory_id": inventory.id,
                "product_name": catalog_item.name,
                "unit": catalog_item.unit_of_measure,
                "total_quantity": inventory.quantity_available,
                "shared_quantity": shared_qty,
                "share_id": share_id,
            })

        return Response(success_response(data=visibility_data))

    def post(self, request, *args, **kwargs):
        """
        Create or update a resource share for an inventory item.
        Only hospital admins can modify shares.
        """
        # Permission check: only hospital admins can POST
        if not request.user.roles.filter(name__in=["HOSPITAL_ADMIN", "SUPER_ADMIN"]).exists():
            return Response(
                success_response(data={"detail": "Only hospital admins can modify shares."}),
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get hospital context
        hospital = None
        if hasattr(request.user, "staff") and request.user.staff:
            hospital = request.user.staff.hospital
        else:
            return Response(
                success_response(data={"detail": "No hospital context."}),
                status=status.HTTP_403_FORBIDDEN,
            )

        # Validate input
        serializer = InventoryShareVisibilityWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        inventory_id = serializer.validated_data.get("inventory_id")
        shared_quantity = serializer.validated_data.get("shared_quantity")

        # Get inventory
        try:
            inventory = ResourceInventory.objects.select_related("catalog_item").get(
                id=inventory_id
            )
        except ResourceInventory.DoesNotExist:
            return Response(
                success_response(data={"detail": "Inventory not found."}),
                status=status.HTTP_404_NOT_FOUND,
            )

        catalog_item = inventory.catalog_item

        # Verify hospital ownership
        if catalog_item.hospital != hospital:
            return Response(
                success_response(
                    data={"detail": "You can only modify shares for your own hospital's inventory."}
                ),
                status=status.HTTP_403_FORBIDDEN,
            )

        # Validate shared_quantity <= available quantity
        if shared_quantity > inventory.quantity_available:
            return Response(
                success_response(
                    data={
                        "detail": f"Shared quantity ({shared_quantity}) cannot exceed "
                        f"available quantity ({inventory.quantity_available})."
                    }
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create or update share
        share, created = ResourceShare.objects.get_or_create(
            hospital=hospital,
            catalog_item=catalog_item,
            defaults={
                "quantity_offered": shared_quantity,
                "status": ResourceShare.Status.ACTIVE,
                "created_by": request.user,
            },
        )

        if not created:
            share.quantity_offered = shared_quantity
            share.save(update_fields=["quantity_offered", "updated_at"])

        response_data = {
            "inventory_id": inventory.id,
            "product_name": catalog_item.name,
            "unit": catalog_item.unit_of_measure,
            "total_quantity": inventory.quantity_available,
            "shared_quantity": share.quantity_offered,
            "share_id": share.id,
        }

        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(success_response(data=response_data), status=http_status)


