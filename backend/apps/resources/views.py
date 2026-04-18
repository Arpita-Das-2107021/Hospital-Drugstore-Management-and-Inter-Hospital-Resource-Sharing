"""Resources app views."""
import logging
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import IsHospitalAdmin, IsPharmacist, IsVerifiedHospital, RequireHealthcareContext
from common.permissions.runtime import has_any_permission, is_platform_operator
from common.services.medicine_info_service import MedicineInfoService
from common.services.medicine_translation_service import normalize_medicine_language
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction, ResourceType
from .share_state import build_share_state_by_catalog
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

RESOURCE_LEGACY_ADMIN_ROLES = ("HEALTHCARE_ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN")
RESOURCE_LEGACY_PHARMACY_ROLES = ("PHARMACIST", "INVENTORY_MANAGER", "HEALTHCARE_ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN")
STRICT_INVENTORY_VIEW_PERMISSION = ("hospital:inventory.view", "inventory.view")
MEDICINE_RESOURCE_TYPE_HINTS = {"medication", "medicine", "drug"}


def _has_resource_permission(user, permission_codes, *, legacy_roles):
    return has_any_permission(
        user,
        permission_codes,
        allow_role_fallback=True,
        legacy_roles=legacy_roles,
    )


def _build_share_state_map_for_shares(shares) -> dict:
    share_list = list(shares or [])
    if not share_list:
        return {}

    catalog_ids_by_hospital = {}
    for share in share_list:
        if not getattr(share, "hospital_id", None) or not getattr(share, "catalog_item_id", None):
            continue
        catalog_ids_by_hospital.setdefault(share.hospital_id, set()).add(share.catalog_item_id)

    share_state_by_catalog_item_id = {}
    for hospital_id, catalog_item_ids in catalog_ids_by_hospital.items():
        state_by_catalog = build_share_state_by_catalog(
            supplying_hospital_id=hospital_id,
            catalog_item_ids=list(catalog_item_ids),
        )
        share_state_by_catalog_item_id.update(state_by_catalog)

    return share_state_by_catalog_item_id


def _coerce_optional_price(raw_value):
    if raw_value is None:
        return None
    if isinstance(raw_value, str) and raw_value.strip() == "":
        return None

    try:
        value = Decimal(str(raw_value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({"price_per_unit": "Price must be a valid non-negative decimal."})

    if value < 0:
        raise ValidationError({"price_per_unit": "Price must be a valid non-negative decimal."})

    return value


def _resolve_catalog_price(request_data):
    price_per_unit = _coerce_optional_price(request_data.get("price_per_unit"))
    unit_price = _coerce_optional_price(request_data.get("unit_price"))

    if price_per_unit is not None and unit_price is not None and price_per_unit != unit_price:
        raise ValidationError(
            {
                "price_per_unit": (
                    "When both 'price_per_unit' and 'unit_price' are provided, they must be equal."
                )
            }
        )

    return price_per_unit if price_per_unit is not None else unit_price


def _should_include_medicine_info(request, catalog_item) -> bool:
    explicit = request.query_params.get("include_medicine_info")
    if explicit is not None:
        normalized = str(explicit).strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False

    if not bool(getattr(settings, "MEDICINE_INFO_ENABLE_CATALOG_ENRICHMENT", True)):
        return False

    resource_type_name = str(getattr(getattr(catalog_item, "resource_type", None), "name", "")).strip().lower()
    return resource_type_name in MEDICINE_RESOURCE_TYPE_HINTS


def _requested_medicine_language(request, *, allow_body: bool = False) -> str:
    if allow_body:
        raw_data = getattr(request, "data", None)
        if raw_data is not None and hasattr(raw_data, "get"):
            raw_language = raw_data.get("lang")
            if raw_language is not None:
                return normalize_medicine_language(raw_language)

    return normalize_medicine_language(request.query_params.get("lang"))


def _fallback_medicine_info_data(
    *,
    medicine_name: str,
    summary: str,
    language: str,
    translated: bool,
    source_language: str = "en",
):
    normalized_language = normalize_medicine_language(language)
    payload = {
        "found": False,
        "source": "unavailable",
        "name": medicine_name,
        "generic_name": "",
        "use_cases": [],
        "indications": [],
        "warnings": [],
        "dosage_guidance": [],
        "age_guidance": [],
        "storage_guidance": [],
        "language": normalized_language,
        "translated": bool(translated),
        "summary": summary,
    }
    if translated:
        payload["sourceLanguage"] = normalize_medicine_language(source_language)
    return payload


def _medicine_info_contract(catalog_item, *, language: str = "en", force_refresh: bool = False):
    requested_language = normalize_medicine_language(language)
    medicine_name = str(getattr(catalog_item, "name", "") or "").strip()
    if not medicine_name:
        return {
            "success": True,
            "cache": {"hit": False, "stale": False},
            "data": _fallback_medicine_info_data(
                medicine_name="",
                summary="",
                language="en",
                translated=False,
            ),
        }

    try:
        if force_refresh:
            contract = MedicineInfoService.refresh_medicine_details(
                medicine_name,
                language=requested_language,
            )
        else:
            contract = MedicineInfoService.get_medicine_details_with_cache(
                medicine_name,
                language=requested_language,
            )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Medicine info enrichment failed",
            extra={
                "catalog_item_id": str(getattr(catalog_item, "id", "")),
                "medicine_name": medicine_name,
                "language": requested_language,
            },
        )
        contract = {
            "success": True,
            "cache": {"hit": False, "stale": False},
            "data": {
                "found": False,
                "source": "unavailable",
                "name": medicine_name,
                "generic_name": "",
                "use_cases": [],
                "indications": [],
                "warnings": [],
                "dosage_guidance": [],
                "age_guidance": [],
                "storage_guidance": [],
                "language": "en",
                "translated": False,
                "details": {"summary": "Medicine information temporarily unavailable."},
            },
        }

    info = contract.get("data") if isinstance(contract.get("data"), dict) else {}
    details = info.get("details") if isinstance(info.get("details"), dict) else {}
    cache_meta = contract.get("cache") if isinstance(contract.get("cache"), dict) else {}
    response_language = normalize_medicine_language(info.get("language"))
    response_translated = bool(info.get("translated", response_language != "en"))
    source_language = normalize_medicine_language(info.get("sourceLanguage") or "en")

    return {
        "success": True,
        "cache": {
            "hit": bool(cache_meta.get("hit", False)),
            "stale": bool(cache_meta.get("stale", False)),
        },
        "data": {
            **_fallback_medicine_info_data(
                medicine_name=medicine_name,
                summary=str(details.get("summary") or ""),
                language=response_language,
                translated=response_translated,
                source_language=source_language,
            ),
            "found": bool(info.get("found")),
            "source": str(info.get("source") or "unavailable"),
            "name": str(info.get("name") or medicine_name),
            "generic_name": str(info.get("generic_name") or ""),
            "use_cases": list(info.get("use_cases") or []),
            "indications": list(info.get("indications") or []),
            "warnings": list(info.get("warnings") or []),
            "dosage_guidance": list(info.get("dosage_guidance") or []),
            "age_guidance": list(info.get("age_guidance") or []),
            "storage_guidance": list(info.get("storage_guidance") or []),
            "language": response_language,
            "translated": response_translated,
            **({"sourceLanguage": source_language} if response_translated else {}),
        }
    }


def _medicine_info_payload(catalog_item, *, language: str = "en", force_refresh: bool = False):
    contract = _medicine_info_contract(
        catalog_item,
        language=language,
        force_refresh=force_refresh,
    )
    return {
        **contract["data"],
        "cache": contract["cache"],
    }



class ResourceTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ResourceType.objects.all().order_by("name")
    serializer_class = ResourceTypeSerializer
    permission_classes = [IsAuthenticated, RequireHealthcareContext]


class ResourceCatalogViewSet(viewsets.ModelViewSet):
    serializer_class = ResourceCatalogSerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if not _has_resource_permission(
            user,
            ("hospital:catalog.view", "hospital:catalog.manage"),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            return ResourceCatalog.objects.none()
        if is_platform_operator(user, allow_role_fallback=True):
            return ResourceCatalog.objects.select_related("hospital", "resource_type", "inventory").all()
        if hasattr(user, "staff") and user.staff:
            return ResourceCatalog.objects.select_related("hospital", "resource_type", "inventory").filter(
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
        item = self.get_object()
        payload = self.get_serializer(item).data
        if _should_include_medicine_info(request, item):
            payload["medicine_info"] = _medicine_info_payload(
                item,
                language=_requested_medicine_language(request),
            )
        return Response(success_response(data=payload))

    @action(detail=True, methods=["get"], url_path="medicine-info")
    def medicine_info(self, request, pk=None):
        item = self.get_object()
        return Response(
            _medicine_info_contract(
                item,
                language=_requested_medicine_language(request),
            )
        )

    @action(detail=True, methods=["post"], url_path="medicine-info/refresh")
    def medicine_info_refresh(self, request, pk=None):
        if not _has_resource_permission(
            request.user,
            ("hospital:catalog.manage",),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to refresh medicine info.")

        item = self.get_object()
        return Response(
            _medicine_info_contract(
                item,
                language=_requested_medicine_language(request, allow_body=True),
                force_refresh=True,
            )
        )

    def create(self, request, *args, **kwargs):
        if not _has_resource_permission(
            request.user,
            ("hospital:catalog.manage",),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to manage catalog items.")
        hospital = request.user.staff.hospital if (hasattr(request.user, "staff") and request.user.staff) else None
        if hospital is None:
            return Response(success_response(data={"detail": "No hospital context."}), status=status.HTTP_400_BAD_REQUEST)
        price_to_set = _resolve_catalog_price(request.data)
        # Inject hospital so the serializer can validate the complete payload
        data = {**request.data, "hospital": str(hospital.id)}
        s = self.get_serializer(data=data)
        s.is_valid(raise_exception=True)
        item = create_catalog_item(hospital, {k: v for k, v in s.validated_data.items() if k != "hospital"})
        if price_to_set is not None:
            inventory, _ = ResourceInventory.objects.get_or_create(catalog_item=item)
            if inventory.price_per_unit != price_to_set:
                inventory.price_per_unit = price_to_set
                inventory.save(update_fields=["price_per_unit", "updated_at"])
        item.refresh_from_db()
        return Response(success_response(data=self.get_serializer(item).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not _has_resource_permission(
            request.user,
            ("hospital:catalog.manage",),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to manage catalog items.")
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        price_to_set = _resolve_catalog_price(request.data)
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        s.save()
        if price_to_set is not None:
            inventory, _ = ResourceInventory.objects.get_or_create(catalog_item=instance)
            if inventory.price_per_unit != price_to_set:
                inventory.price_per_unit = price_to_set
                inventory.save(update_fields=["price_per_unit", "updated_at"])
        instance.refresh_from_db()
        return Response(success_response(data=self.get_serializer(instance).data))

    def destroy(self, request, *args, **kwargs):
        if not _has_resource_permission(
            request.user,
            ("hospital:catalog.manage",),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to manage catalog items.")
        self.get_object().delete()
        return Response(success_response(data={"detail": "Deleted."}), status=status.HTTP_200_OK)


class ResourceInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ResourceInventorySerializer
    permission_classes = [IsAuthenticated, IsVerifiedHospital]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if not has_any_permission(user, STRICT_INVENTORY_VIEW_PERMISSION, allow_role_fallback=False):
            return ResourceInventory.objects.none()
        if is_platform_operator(user, allow_role_fallback=False):
            return ResourceInventory.objects.select_related(
                "catalog_item__hospital",
                "active_discount_policy",
            ).all()
        if hasattr(user, "staff") and user.staff:
            return ResourceInventory.objects.select_related(
                "catalog_item__hospital",
                "active_discount_policy",
            ).filter(
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
        if not _has_resource_permission(
            request.user,
            ("hospital:inventory.edit", "hospital:inventory.manage"),
            legacy_roles=RESOURCE_LEGACY_PHARMACY_ROLES,
        ):
            raise PermissionDenied("You do not have permission to adjust inventory.")
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
        if not has_any_permission(request.user, ("inventory.batch.view",), allow_role_fallback=False):
            raise PermissionDenied("You do not have permission to view inventory transactions.")
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
        if not _has_resource_permission(
            user,
            ("hospital:resource_share.view", "hospital:resource_share.manage", "hospital:resource_share.supervise"),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            return ResourceShare.objects.none()
        if is_platform_operator(user, allow_role_fallback=True):
            return ResourceShare.objects.select_related("hospital", "catalog_item").all()
        if hasattr(user, "staff") and user.staff:
            action = getattr(self, "action", None)
            # Hospitals can discover active shares across hospitals but can modify only their own shares.
            if action in ("list", "retrieve"):
                return self._active_shareable_queryset()
            return ResourceShare.objects.select_related("hospital", "catalog_item").filter(hospital=user.staff.hospital)
        return ResourceShare.objects.none()

    def _serialize_with_live_share_state(self, shares, *, many: bool):
        share_list = list(shares) if many else [shares]
        serializer_context = self.get_serializer_context()
        serializer_context.update(
            {
                "share_state_by_catalog_item_id": _build_share_state_map_for_shares(share_list),
                "quantity_offered_represents_available": True,
            }
        )
        serializer = self.get_serializer(shares if many else share_list[0], many=many, context=serializer_context)
        return serializer.data

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self._serialize_with_live_share_state(page, many=True))
        return Response(success_response(data=self._serialize_with_live_share_state(qs, many=True)))

    def retrieve(self, request, *args, **kwargs):
        share = self.get_object()
        return Response(success_response(data=self._serialize_with_live_share_state(share, many=False)))

    def create(self, request, *args, **kwargs):
        if not _has_resource_permission(
            request.user,
            ("hospital:resource_share.manage", "hospital:resource_share.supervise"),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to manage resource shares.")
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
        if not _has_resource_permission(
            request.user,
            ("hospital:resource_share.manage", "hospital:resource_share.supervise"),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to manage resource shares.")
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(success_response(data=s.data))

    def destroy(self, request, *args, **kwargs):
        if not _has_resource_permission(
            request.user,
            ("hospital:resource_share.manage", "hospital:resource_share.supervise"),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            raise PermissionDenied("You do not have permission to manage resource shares.")
        self.get_object().delete()
        return Response(success_response(data={"detail": "Share closed."}))


class MyResourceShareListView(APIView):
    """Tenant-scoped resource share listing for the caller's hospital context only."""

    permission_classes = [IsAuthenticated, RequireHealthcareContext, IsVerifiedHospital]

    def _scoped_queryset(self, request):
        if not has_any_permission(request.user, ("hospital:resource_share.view",), allow_role_fallback=False):
            raise PermissionDenied("You do not have permission to view resource shares.")

        hospital_id = getattr(getattr(request.user, "staff", None), "hospital_id", None)
        if not hospital_id:
            raise PermissionDenied("No healthcare context is associated with this user.")

        queryset = ResourceShare.objects.select_related("hospital", "catalog_item").filter(hospital_id=hospital_id)

        status_filter = str(request.query_params.get("status", "")).strip().lower()
        if status_filter:
            valid_statuses = {choice[0] for choice in ResourceShare.Status.choices}
            if status_filter not in valid_statuses:
                raise ValidationError({"status": "Invalid status filter."})
            queryset = queryset.filter(status=status_filter)

        catalog_item_id = str(request.query_params.get("catalog_item_id", "")).strip()
        if catalog_item_id:
            try:
                queryset = queryset.filter(catalog_item_id=UUID(catalog_item_id))
            except ValueError as exc:
                raise ValidationError({"catalog_item_id": "Must be a valid UUID."}) from exc

        resource_type_id = str(request.query_params.get("resource_type_id", "")).strip()
        if resource_type_id:
            try:
                queryset = queryset.filter(catalog_item__resource_type_id=UUID(resource_type_id))
            except ValueError as exc:
                raise ValidationError({"resource_type_id": "Must be a valid UUID."}) from exc

        return queryset.order_by("-created_at")

    def get(self, request, *args, **kwargs):
        queryset = self._scoped_queryset(request)
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer_context = {
            "request": request,
            "share_state_by_catalog_item_id": _build_share_state_map_for_shares(page if page is not None else queryset),
            "quantity_offered_represents_available": True,
        }
        if page is not None:
            return paginator.get_paginated_response(
                ResourceShareSerializer(page, many=True, context=serializer_context).data
            )
        return Response(
            success_response(data=ResourceShareSerializer(queryset, many=True, context=serializer_context).data)
        )


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
        if not _has_resource_permission(
            request.user,
            ("hospital:resource_share.visibility.view", "hospital:resource_share.manage"),
            legacy_roles=RESOURCE_LEGACY_ADMIN_ROLES,
        ):
            return Response(
                success_response(data={"detail": "You do not have permission to view share visibility."}),
                status=status.HTTP_403_FORBIDDEN,
            )

        hospital = None
        if hasattr(request.user, "staff") and request.user.staff:
            hospital = request.user.staff.hospital
        elif is_platform_operator(request.user, allow_role_fallback=True):
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

        share_state_by_catalog_item_id = build_share_state_by_catalog(
            supplying_hospital_id=hospital.id,
        )
        visible_catalog_item_ids = [
            catalog_item_id
            for catalog_item_id, share_state in share_state_by_catalog_item_id.items()
            if int(share_state.get("offered_quantity", 0)) > 0 or int(share_state.get("committed_quantity", 0)) > 0
        ]

        if not visible_catalog_item_ids:
            return Response(success_response(data=[]))

        inventories = list(
            ResourceInventory.objects.filter(
                catalog_item__hospital=hospital,
                catalog_item_id__in=visible_catalog_item_ids,
            )
            .select_related("catalog_item", "catalog_item__hospital")
            .order_by("catalog_item__name")
        )

        visibility_data = []
        for inventory in inventories:
            catalog_item = inventory.catalog_item
            share_state = share_state_by_catalog_item_id.get(catalog_item.id, {})

            visibility_data.append({
                "inventory_id": inventory.id,
                "product_name": catalog_item.name,
                "unit": catalog_item.unit_of_measure,
                "total_quantity": inventory.quantity_available,
                "shared_quantity": int(share_state.get("offered_quantity", 0)),
                "reserved_quantity": int(share_state.get("reserved_quantity", 0)),
                "transferred_quantity": int(share_state.get("transferred_quantity", 0)),
                "available_share_quantity": int(share_state.get("available_share_quantity", 0)),
                "share_id": share_state.get("primary_share_id"),
            })

        return Response(success_response(data=visibility_data))

    def post(self, request, *args, **kwargs):
        """
        Create or update a resource share for an inventory item.
        Only hospital admins can modify shares.
        """
        if not has_any_permission(
            request.user,
            ("hospital:resource_share.manage", "hospital:resource_share.supervise"),
            allow_role_fallback=True,
            legacy_roles=("HEALTHCARE_ADMIN", "SUPER_ADMIN", "PLATFORM_ADMIN"),
        ):
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

        # Create or update the latest share record for this catalog item.
        share = (
            ResourceShare.objects.filter(hospital=hospital, catalog_item=catalog_item)
            .order_by("-created_at", "-id")
            .first()
        )
        created = share is None
        if created:
            share = ResourceShare.objects.create(
                hospital=hospital,
                catalog_item=catalog_item,
                quantity_offered=shared_quantity,
                status=ResourceShare.Status.ACTIVE,
                created_by=request.user,
            )
        else:
            share.quantity_offered = shared_quantity
            share.status = ResourceShare.Status.ACTIVE
            share.save(update_fields=["quantity_offered", "status", "updated_at"])

        share_state = build_share_state_by_catalog(
            supplying_hospital_id=hospital.id,
            catalog_item_ids=[catalog_item.id],
        ).get(catalog_item.id, {})

        response_data = {
            "inventory_id": inventory.id,
            "product_name": catalog_item.name,
            "unit": catalog_item.unit_of_measure,
            "total_quantity": inventory.quantity_available,
            "shared_quantity": int(share_state.get("offered_quantity", shared_quantity)),
            "reserved_quantity": int(share_state.get("reserved_quantity", 0)),
            "transferred_quantity": int(share_state.get("transferred_quantity", 0)),
            "available_share_quantity": int(
                share_state.get("available_share_quantity", max(0, int(shared_quantity or 0)))
            ),
            "share_id": share_state.get("primary_share_id") or share.id,
        }

        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(success_response(data=response_data), status=http_status)


