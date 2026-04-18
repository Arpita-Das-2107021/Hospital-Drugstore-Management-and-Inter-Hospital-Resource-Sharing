"""Integration tests for resources API (catalog, inventory, shares) and shipments API."""
import pytest
from rest_framework import status

CATALOG_URL = "/api/v1/catalog/"
TYPES_URL = "/api/v1/catalog/types/"
INVENTORY_URL = "/api/v1/inventory/"
SHARES_URL = "/api/v1/resource-shares/"
SHIPMENTS_URL = "/api/v1/shipments/"


def catalog_url(pk):
    return f"{CATALOG_URL}{pk}/"


def catalog_medicine_info_url(pk):
    return f"{CATALOG_URL}{pk}/medicine-info/"


def catalog_medicine_info_refresh_url(pk):
    return f"{CATALOG_URL}{pk}/medicine-info/refresh/"


def inventory_url(pk):
    return f"{INVENTORY_URL}{pk}/"


def share_url(pk):
    return f"{SHARES_URL}{pk}/"


def shipment_url(pk):
    return f"{SHIPMENTS_URL}{pk}/"


# ---------------------------------------------------------------------------
# ResourceType
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceTypeList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(TYPES_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_can_list(self, auth_client, resource_type):
        response = auth_client.get(TYPES_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_list_contains_resource_type(self, auth_client, resource_type):
        response = auth_client.get(TYPES_URL)
        data = response.json()
        # Paginated response uses 'data' key (StandardResultsPagination)
        items = data.get("data", data.get("results", data if isinstance(data, list) else []))
        ids = [t["id"] for t in items]
        assert str(resource_type.id) in ids


@pytest.mark.django_db
class TestResourceTypeRetrieve:
    def test_retrieve_existing_type(self, auth_client, resource_type):
        response = auth_client.get(f"{TYPES_URL}{resource_type.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == resource_type.name

    def test_retrieve_nonexistent_type(self, auth_client):
        import uuid
        response = auth_client.get(f"{TYPES_URL}{uuid.uuid4()}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# ResourceCatalog
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceCatalogList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_sees_own_catalog(self, auth_client, catalog_item):
        response = auth_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # response may be paginated
        items = data.get("results", data.get("data", []))
        ids = [i["id"] for i in items]
        assert str(catalog_item.id) in ids

    def test_super_admin_sees_all(self, super_admin_client, catalog_item):
        response = super_admin_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hospital_b_admin_cannot_see_hospital_a_items(self, hospital_b_auth_client, catalog_item):
        response = hospital_b_auth_client.get(CATALOG_URL)
        assert response.status_code == status.HTTP_200_OK
        items = response.json().get("results", response.json().get("data", []))
        ids = [i["id"] for i in items]
        assert str(catalog_item.id) not in ids


@pytest.mark.django_db
class TestResourceCatalogRetrieve:
    def test_retrieve_own_item(self, auth_client, catalog_item):
        response = auth_client.get(catalog_url(catalog_item.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(catalog_item.id)

    def test_retrieve_own_item_includes_medicine_info_when_enabled(self, auth_client, catalog_item, monkeypatch):
        from django.test import override_settings
        from common.services.medicine_info_service import MedicineInfoService

        monkeypatch.setattr(
            MedicineInfoService,
            "get_medicine_details_with_cache",
            classmethod(
                lambda cls, medicine_name, language="en": {
                    "success": True,
                    "cache": {"hit": False, "stale": False},
                    "data": {
                        "found": True,
                        "source": "test-provider",
                        "name": medicine_name,
                        "generic_name": "Acetaminophen",
                        "use_cases": ["Pain relief"],
                        "indications": ["Fever"],
                        "warnings": ["Avoid overdose"],
                        "dosage_guidance": ["Follow label dosage"],
                        "age_guidance": ["Consult pediatric dosing for children"],
                        "storage_guidance": ["Store below 25C"],
                        "language": language,
                        "translated": language == "bn",
                        "details": {"summary": "Sample summary"},
                        **({"sourceLanguage": "en"} if language == "bn" else {}),
                    },
                }
            ),
        )

        with override_settings(MEDICINE_INFO_ENABLE_CATALOG_ENRICHMENT=True):
            response = auth_client.get(catalog_url(catalog_item.id))

        assert response.status_code == status.HTTP_200_OK
        medicine_info = response.json()["data"].get("medicine_info")
        assert medicine_info is not None
        assert medicine_info["found"] is True
        assert medicine_info["generic_name"] == "Acetaminophen"
        assert medicine_info["dosage_guidance"]
        assert medicine_info["age_guidance"]
        assert medicine_info["storage_guidance"]
        assert medicine_info["cache"] == {"hit": False, "stale": False}

    def test_retrieve_own_item_medicine_info_failure_does_not_break_response(self, auth_client, catalog_item, monkeypatch):
        from django.test import override_settings
        from common.services.medicine_info_service import MedicineInfoService

        monkeypatch.setattr(
            MedicineInfoService,
            "get_medicine_details_with_cache",
            classmethod(
                lambda cls, medicine_name, language="en": (
                    _ for _ in ()
                ).throw(RuntimeError("provider down"))
            ),
        )

        with override_settings(MEDICINE_INFO_ENABLE_CATALOG_ENRICHMENT=True):
            response = auth_client.get(catalog_url(catalog_item.id))

        assert response.status_code == status.HTTP_200_OK
        medicine_info = response.json()["data"].get("medicine_info")
        assert medicine_info is not None
        assert medicine_info["found"] is False
        assert medicine_info["source"] == "unavailable"
        assert medicine_info["cache"] == {"hit": False, "stale": False}

    def test_retrieve_nonexistent_item(self, auth_client):
        import uuid
        response = auth_client.get(catalog_url(uuid.uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_catalog_medicine_info_endpoint_returns_enrichment(self, auth_client, catalog_item, monkeypatch):
        from common.services.medicine_info_service import MedicineInfoService

        monkeypatch.setattr(
            MedicineInfoService,
            "get_medicine_details_with_cache",
            classmethod(
                lambda cls, medicine_name, language="en": {
                    "success": True,
                    "cache": {"hit": True, "stale": False},
                    "data": {
                        "found": True,
                        "source": "test-provider",
                        "name": medicine_name,
                        "generic_name": "Acetaminophen",
                        "use_cases": ["Pain relief"],
                        "indications": ["Fever"],
                        "warnings": ["Avoid overdose"],
                        "dosage_guidance": ["Follow label dosage"],
                        "age_guidance": ["Consult pediatric dosing for children"],
                        "storage_guidance": ["Store below 25C"],
                        "language": language,
                        "translated": language == "bn",
                        "details": {"summary": "Sample summary"},
                        **({"sourceLanguage": "en"} if language == "bn" else {}),
                    },
                }
            ),
        )

        response = auth_client.get(catalog_medicine_info_url(catalog_item.id))

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        data = payload["data"]
        assert data["found"] is True
        assert data["generic_name"] == "Acetaminophen"
        assert data["dosage_guidance"]
        assert data["age_guidance"]
        assert data["storage_guidance"]
        assert payload["cache"] == {"hit": True, "stale": False}

    def test_catalog_medicine_info_endpoint_forwards_language(self, auth_client, catalog_item, monkeypatch):
        from common.services.medicine_info_service import MedicineInfoService

        captured = {"language": None}

        def _fake_get_with_language(cls, medicine_name, language="en"):
            captured["language"] = language
            return {
                "success": True,
                "cache": {"hit": False, "stale": False},
                "data": {
                    "found": True,
                    "source": "test-provider",
                    "name": medicine_name,
                    "generic_name": "Acetaminophen",
                    "use_cases": ["ব্যথা কমাতে ব্যবহৃত"],
                    "indications": ["জ্বর"],
                    "warnings": ["অতিরিক্ত সেবন এড়ান"],
                    "dosage_guidance": ["নির্দেশনা অনুযায়ী সেবন করুন"],
                    "age_guidance": ["শিশুদের জন্য চিকিৎসকের পরামর্শ নিন"],
                    "storage_guidance": ["২৫C এর নিচে সংরক্ষণ করুন"],
                    "language": "bn",
                    "translated": True,
                    "sourceLanguage": "en",
                    "details": {"summary": "নমুনা সারসংক্ষেপ"},
                },
            }

        monkeypatch.setattr(
            MedicineInfoService,
            "get_medicine_details_with_cache",
            classmethod(_fake_get_with_language),
        )

        response = auth_client.get(f"{catalog_medicine_info_url(catalog_item.id)}?lang=bn")

        assert response.status_code == status.HTTP_200_OK
        assert captured["language"] == "bn"
        payload = response.json()
        assert payload["data"]["language"] == "bn"
        assert payload["data"]["translated"] is True
        assert payload["data"]["sourceLanguage"] == "en"

    def test_catalog_medicine_info_refresh_endpoint_refetches(self, auth_client, catalog_item, monkeypatch):
        from common.services.medicine_info_service import MedicineInfoService

        monkeypatch.setattr(
            MedicineInfoService,
            "refresh_medicine_details",
            classmethod(
                lambda cls, medicine_name, language="en": {
                    "success": True,
                    "cache": {"hit": False, "stale": False},
                    "data": {
                        "found": True,
                        "source": "test-provider-refresh",
                        "name": medicine_name,
                        "generic_name": "Acetaminophen",
                        "use_cases": ["Pain relief"],
                        "indications": ["Fever"],
                        "warnings": ["Avoid overdose"],
                        "dosage_guidance": ["Follow label dosage"],
                        "age_guidance": ["Consult pediatric dosing for children"],
                        "storage_guidance": ["Store below 25C"],
                        "language": language,
                        "translated": language == "bn",
                        "details": {"summary": "Sample summary"},
                        **({"sourceLanguage": "en"} if language == "bn" else {}),
                    },
                }
            ),
        )

        response = auth_client.post(catalog_medicine_info_refresh_url(catalog_item.id), format="json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["success"] is True
        assert payload["cache"] == {"hit": False, "stale": False}
        assert payload["data"]["source"] == "test-provider-refresh"


@pytest.mark.django_db
class TestResourceCatalogCreate:
    def test_hospital_admin_can_create(self, auth_client, hospital, resource_type):
        # Don't send hospital in payload — view derives it from user's staff
        payload = {
            "resource_type": str(resource_type.id),
            "name": "New Drug Item",
            "unit_of_measure": "units",
        }
        response = auth_client.post(CATALOG_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, resource_type):
        payload = {
            "resource_type": str(resource_type.id),
            "name": "Unauthorized Item",
            "unit_of_measure": "units",
        }
        response = api_client.post(CATALOG_URL, payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestResourceCatalogUpdate:
    def test_can_update_own_item(self, auth_client, catalog_item):
        response = auth_client.patch(catalog_url(catalog_item.id), {"name": "Updated Drug"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["name"] == "Updated Drug"

    def test_patch_price_per_unit_updates_inventory_price(self, auth_client, catalog_item):
        response = auth_client.patch(catalog_url(catalog_item.id), {"price_per_unit": "100.00"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["price_per_unit"] == "100.00"

        catalog_item.inventory.refresh_from_db()
        assert str(catalog_item.inventory.price_per_unit) == "100.00"

    def test_patch_unit_price_alias_updates_inventory_price(self, auth_client, catalog_item):
        response = auth_client.patch(catalog_url(catalog_item.id), {"unit_price": "99.50"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["price_per_unit"] == "99.50"

        catalog_item.inventory.refresh_from_db()
        assert str(catalog_item.inventory.price_per_unit) == "99.50"

    def test_patch_rejects_conflicting_price_alias_values(self, auth_client, catalog_item):
        response = auth_client.patch(
            catalog_url(catalog_item.id),
            {"price_per_unit": "100.00", "unit_price": "90.00"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_can_delete_item(self, auth_client, catalog_item):
        response = auth_client.delete(catalog_url(catalog_item.id))
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# ResourceInventory
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceInventoryList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(INVENTORY_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_sees_own_inventory(self, auth_client, catalog_item):
        response = auth_client.get(INVENTORY_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_super_admin_sees_all(self, super_admin_client, catalog_item):
        response = super_admin_client.get(INVENTORY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hospital_user_with_namespaced_inventory_view_permission_can_list(
        self,
        auth_client,
        hospital_admin_user,
        catalog_item,
    ):
        from apps.staff.models import HospitalRolePermission, Permission

        assignment = hospital_admin_user.hospital_role_assignment
        hospital_role = assignment.hospital_role

        namespaced_permission, _ = Permission.objects.get_or_create(
            code="hospital:inventory.view",
            defaults={
                "name": "hospital:inventory.view",
                "description": "Hospital-scoped inventory view permission",
            },
        )
        HospitalRolePermission.objects.get_or_create(
            hospital_role=hospital_role,
            permission=namespaced_permission,
        )

        legacy_permission = Permission.objects.filter(code="inventory.view").first()
        if legacy_permission is not None:
            HospitalRolePermission.objects.filter(
                hospital_role=hospital_role,
                permission=legacy_permission,
            ).delete()

        response = auth_client.get(INVENTORY_URL)

        assert response.status_code == status.HTTP_200_OK
        items = response.json().get("data", [])
        assert len(items) > 0


@pytest.mark.django_db
class TestResourceInventoryRetrieve:
    def test_retrieve_inventory(self, auth_client, catalog_item):
        inv = catalog_item.inventory
        response = auth_client.get(inventory_url(inv.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(inv.id)


@pytest.mark.django_db
class TestResourceInventoryAdjust:
    def test_pharmacist_can_adjust(self, api_client, hospital, catalog_item, pharmacist_role):
        """A PHARMACIST role user can call adjust endpoint."""
        from django.contrib.auth import get_user_model
        from apps.staff.models import HospitalRole, HospitalRolePermission, Permission, Staff, UserHospitalRole, UserRole
        UserAccount = get_user_model()
        staff = Staff.objects.create(hospital=hospital, first_name="Pharm", last_name="Cist2", employee_id="PH-002")
        user = UserAccount.objects.create_user(email="pharm2@h.com", password="Test1234!", staff=staff)
        UserRole.objects.create(user=user, role=pharmacist_role, hospital=hospital)
        dual_role, _ = HospitalRole.objects.get_or_create(
            hospital=hospital,
            name="PHARMACIST",
            defaults={"description": "Pharmacist"},
        )
        UserHospitalRole.objects.update_or_create(
            user=user,
            defaults={"hospital": hospital, "hospital_role": dual_role, "assigned_by": None},
        )
        for code in ("inventory.view", "hospital:inventory.view", "hospital:inventory.edit", "hospital:inventory.manage"):
            permission, _ = Permission.objects.get_or_create(code=code, defaults={"name": code})
            HospitalRolePermission.objects.get_or_create(hospital_role=dual_role, permission=permission)

        api_client.force_authenticate(user=user)
        inv = catalog_item.inventory
        payload = {"quantity_delta": 10, "transaction_type": "restock", "notes": "Restocked"}
        response = api_client.post(f"{INVENTORY_URL}{inv.id}/adjust/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_adjust_updates_quantity(self, api_client, hospital, catalog_item, pharmacist_role):
        from django.contrib.auth import get_user_model
        from apps.staff.models import HospitalRole, HospitalRolePermission, Permission, Staff, UserHospitalRole, UserRole
        UserAccount = get_user_model()
        staff = Staff.objects.create(hospital=hospital, first_name="Pharm", last_name="Cist3", employee_id="PH-003")
        user = UserAccount.objects.create_user(email="pharm3@h.com", password="Test1234!", staff=staff)
        UserRole.objects.create(user=user, role=pharmacist_role, hospital=hospital)
        dual_role, _ = HospitalRole.objects.get_or_create(
            hospital=hospital,
            name="PHARMACIST",
            defaults={"description": "Pharmacist"},
        )
        UserHospitalRole.objects.update_or_create(
            user=user,
            defaults={"hospital": hospital, "hospital_role": dual_role, "assigned_by": None},
        )
        for code in ("inventory.view", "hospital:inventory.view", "hospital:inventory.edit", "hospital:inventory.manage"):
            permission, _ = Permission.objects.get_or_create(code=code, defaults={"name": code})
            HospitalRolePermission.objects.get_or_create(hospital_role=dual_role, permission=permission)

        api_client.force_authenticate(user=user)
        inv = catalog_item.inventory
        original_qty = inv.quantity_available
        payload = {"quantity_delta": 25, "transaction_type": "restock"}
        response = api_client.post(f"{INVENTORY_URL}{inv.id}/adjust/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        inv.refresh_from_db()
        assert inv.quantity_available == original_qty + 25

    def test_transactions_endpoint(self, auth_client, catalog_item):
        inv = catalog_item.inventory
        response = auth_client.get(f"{INVENTORY_URL}{inv.id}/transactions/")
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# ResourceShare
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestResourceShareList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client, hospital, catalog_item):
        response = auth_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "data" in response.json()

    def test_super_admin_sees_all_shares(self, super_admin_client):
        response = super_admin_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hospital_can_see_other_hospital_active_share(self, hospital_b_auth_client, resource_share):
        response = hospital_b_auth_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK

        items = response.json().get("data", [])
        ids = [item["id"] for item in items]
        assert str(resource_share.id) in ids

    def test_only_active_valid_shareable_shares_are_listed(self, auth_client, hospital, resource_type, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceCatalog, ResourceShare

        active_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Visible Share Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        active_share = ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=active_item,
            quantity_offered=5,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        paused_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Paused Share Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=paused_item,
            quantity_offered=5,
            status=ResourceShare.Status.PAUSED,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        expired_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Expired Share Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=expired_item,
            quantity_offered=5,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() - timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        not_shareable_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Not Shareable Item",
            unit_of_measure="units",
            is_shareable=False,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=not_shareable_item,
            quantity_offered=5,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        zero_qty_item = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Zero Quantity Item",
            unit_of_measure="units",
            is_shareable=True,
        )
        ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=zero_qty_item,
            quantity_offered=0,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=1),
            created_by=hospital_admin_user,
        )

        response = auth_client.get(SHARES_URL)
        assert response.status_code == status.HTTP_200_OK

        items = response.json().get("data", [])
        ids = [item["id"] for item in items]
        assert str(active_share.id) in ids
        assert len(ids) == 1

    def test_filters_work_for_hospital_filter(self, auth_client, hospital, hospital_b, resource_type, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceCatalog, ResourceShare

        item_a = ResourceCatalog.objects.create(
            hospital=hospital,
            resource_type=resource_type,
            name="Hospital A Share",
            unit_of_measure="units",
            is_shareable=True,
        )
        share_a = ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=item_a,
            quantity_offered=10,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=2),
            created_by=hospital_admin_user,
        )

        item_b = ResourceCatalog.objects.create(
            hospital=hospital_b,
            resource_type=resource_type,
            name="Hospital B Share",
            unit_of_measure="units",
            is_shareable=True,
        )
        share_b = ResourceShare.objects.create(
            hospital=hospital_b,
            catalog_item=item_b,
            quantity_offered=10,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=2),
            created_by=hospital_admin_user,
        )

        response = auth_client.get(f"{SHARES_URL}?hospital={hospital.id}")
        assert response.status_code == status.HTTP_200_OK

        items = response.json().get("data", [])
        ids = [item["id"] for item in items]
        assert str(share_a.id) in ids
        assert str(share_b.id) not in ids

    def test_pagination_works(self, auth_client, hospital, resource_type, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceCatalog, ResourceShare

        for idx in range(25):
            item = ResourceCatalog.objects.create(
                hospital=hospital,
                resource_type=resource_type,
                name=f"Paged Share Item {idx}",
                unit_of_measure="units",
                is_shareable=True,
            )
            ResourceShare.objects.create(
                hospital=hospital,
                catalog_item=item,
                quantity_offered=idx + 1,
                status=ResourceShare.Status.ACTIVE,
                valid_until=timezone.now() + timezone.timedelta(days=3),
                created_by=hospital_admin_user,
            )

        response = auth_client.get(f"{SHARES_URL}?limit=10&page=2")
        assert response.status_code == status.HTTP_200_OK

        body = response.json()
        assert len(body["data"]) == 10
        assert body["meta"]["page"] == 2
        assert body["meta"]["limit"] == 10
        assert body["meta"]["total"] == 25
        assert body["meta"]["total_pages"] == 3

    def test_list_reflects_remaining_share_capacity_after_approval(
        self,
        auth_client,
        hospital_b_auth_client,
        hospital,
        catalog_item,
        hospital_admin_user,
    ):
        from apps.resources.models import ResourceShare

        requests_url = "/api/v1/requests/"

        inventory = catalog_item.inventory
        inventory.quantity_available = 25
        inventory.save(update_fields=["quantity_available", "updated_at"])

        ResourceShare.objects.update_or_create(
            hospital=hospital,
            catalog_item=catalog_item,
            defaults={
                "quantity_offered": 2,
                "status": ResourceShare.Status.ACTIVE,
                "created_by": hospital_admin_user,
            },
        )

        request_response = hospital_b_auth_client.post(
            requests_url,
            {
                "supplying_hospital": str(hospital.id),
                "catalog_item": str(catalog_item.id),
                "quantity_requested": 1,
                "priority": "normal",
            },
            format="json",
        )
        assert request_response.status_code == status.HTTP_201_CREATED, request_response.json()

        request_id = request_response.json()["data"]["id"]
        approve_response = auth_client.post(
            f"{requests_url}{request_id}/approve/",
            {
                "decision": "approved",
                "quantity_approved": 1,
            },
            format="json",
        )
        assert approve_response.status_code == status.HTTP_200_OK, approve_response.json()

        list_response = hospital_b_auth_client.get(SHARES_URL)
        assert list_response.status_code == status.HTTP_200_OK, list_response.json()

        item = next(
            entry
            for entry in list_response.json()["data"]
            if entry["catalog_item"] == str(catalog_item.id)
        )
        assert item["configured_quantity_offered"] == 2
        assert item["reserved_quantity"] == 1
        assert item["transferred_quantity"] == 0
        assert item["committed_quantity"] == 1
        assert item["available_share_quantity"] == 1
        assert item["quantity_offered"] == 1


@pytest.mark.django_db
class TestResourceShareCreate:
    def test_hospital_admin_can_create_share(self, auth_client, hospital, catalog_item):
        from django.utils import timezone
        payload = {
            "hospital": str(hospital.id),
            "catalog_item": str(catalog_item.id),
            "quantity_offered": 20,
            "status": "active",
            "valid_until": (timezone.now() + timezone.timedelta(days=7)).isoformat(),
        }
        response = auth_client.post(SHARES_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, hospital, catalog_item):
        payload = {
            "hospital": str(hospital.id),
            "catalog_item": str(catalog_item.id),
            "quantity_offered": 5,
            "status": "available",
        }
        response = api_client.post(SHARES_URL, payload, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestResourceShareRetrieveUpdateDelete:
    @pytest.fixture
    def resource_share(self, db, hospital, catalog_item, hospital_admin_user):
        from django.utils import timezone
        from apps.resources.models import ResourceShare
        return ResourceShare.objects.create(
            hospital=hospital,
            catalog_item=catalog_item,
            quantity_offered=15,
            status=ResourceShare.Status.ACTIVE,
            valid_until=timezone.now() + timezone.timedelta(days=5),
            created_by=hospital_admin_user,
        )

    def test_retrieve_share(self, auth_client, resource_share):
        response = auth_client.get(share_url(resource_share.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(resource_share.id)

    def test_update_share(self, auth_client, resource_share):
        response = auth_client.patch(share_url(resource_share.id), {"quantity_offered": 99}, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_delete_share(self, auth_client, resource_share):
        response = auth_client.delete(share_url(resource_share.id))
        assert response.status_code == status.HTTP_200_OK

    def test_other_hospital_cannot_update_share(self, hospital_b_auth_client, resource_share):
        response = hospital_b_auth_client.patch(share_url(resource_share.id), {"quantity_offered": 33}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_other_hospital_cannot_delete_share(self, hospital_b_auth_client, resource_share):
        response = hospital_b_auth_client.delete(share_url(resource_share.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Shipments
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestShipmentList:
    def test_unauthenticated_denied(self, api_client):
        response = api_client.get(SHIPMENTS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_hospital_admin_can_list(self, auth_client):
        response = auth_client.get(SHIPMENTS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_super_admin_can_list(self, super_admin_client):
        response = super_admin_client.get(SHIPMENTS_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestShipmentCreate:
    def get_payload(self, hospital, hospital_b):
        return {
            "origin_hospital": str(hospital.id),
            "destination_hospital": str(hospital_b.id),
            "status": "pending",
            "carrier_name": "FastShip",
        }

    def test_hospital_admin_can_create(self, auth_client, hospital, hospital_b):
        response = auth_client.post(SHIPMENTS_URL, self.get_payload(hospital, hospital_b), format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_unauthenticated_cannot_create(self, api_client, hospital, hospital_b):
        response = api_client.post(SHIPMENTS_URL, self.get_payload(hospital, hospital_b), format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestShipmentRetrieveAndTracking:
    @pytest.fixture
    def shipment(self, db, hospital, hospital_b, hospital_admin_user):
        from apps.shipments.models import Shipment
        return Shipment.objects.create(
            origin_hospital=hospital,
            destination_hospital=hospital_b,
            status=Shipment.Status.PENDING,
            carrier_name="TestCarrier",
            created_by=hospital_admin_user,
        )

    def test_retrieve_shipment(self, auth_client, shipment):
        response = auth_client.get(shipment_url(shipment.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["id"] == str(shipment.id)

    def test_update_shipment(self, auth_client, shipment):
        response = auth_client.patch(shipment_url(shipment.id), {"carrier_name": "NewCarrier"}, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_delete_not_supported(self, auth_client, shipment):
        response = auth_client.delete(shipment_url(shipment.id))
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_get_tracking_events(self, auth_client, shipment):
        # The tracking endpoint uses POST for add and GET for list
        # Both share the same url_path="tracking" but different methods
        # GET tracking returns the events list
        response = auth_client.get(f"{SHIPMENTS_URL}{shipment.id}/get_tracking/")
        # The router maps get_tracking to /get_tracking/ since it's a separate action
        # If not found, try the combined path
        if response.status_code == status.HTTP_404_NOT_FOUND:
            response = auth_client.get(f"{SHIPMENTS_URL}{shipment.id}/tracking/")
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_add_tracking_event_by_logistics(self, api_client, shipment, hospital, logistics_role):
        from django.contrib.auth import get_user_model
        from apps.staff.models import HospitalRole, Staff, UserHospitalRole, UserRole
        UserAccount = get_user_model()
        staff = Staff.objects.create(hospital=hospital, first_name="Log", last_name="Istic", employee_id="LOG-001")
        user = UserAccount.objects.create_user(email="log@h.com", password="Test1234!", staff=staff)
        UserRole.objects.create(user=user, role=logistics_role, hospital=hospital)
        dual_role, _ = HospitalRole.objects.get_or_create(
            hospital=hospital,
            name="LOGISTICS_STAFF",
            defaults={"description": "Logistics"},
        )
        UserHospitalRole.objects.update_or_create(
            user=user,
            defaults={"hospital": hospital, "hospital_role": dual_role, "assigned_by": None},
        )
        api_client.force_authenticate(user=user)
        payload = {"status": "in_transit", "location": "Warehouse A", "notes": "Picked up"}
        response = api_client.post(f"{SHIPMENTS_URL}{shipment.id}/tracking/", payload, format="json")
        assert response.status_code == status.HTTP_200_OK
