"""Serializers for internal operational sales APIs."""

from decimal import Decimal

from rest_framework import serializers

from .models import InternalSale, RetailSale


class InternalSaleCreateSerializer(serializers.Serializer):
    hospital_id = serializers.UUIDField(required=False)
    resource_catalog_id = serializers.UUIDField(required=False)
    medicine_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    quantity_sold = serializers.IntegerField(min_value=1)
    event_date = serializers.DateField(required=False)
    unit = serializers.CharField(required=False, allow_blank=True, max_length=50, default="units")
    resource_type = serializers.CharField(required=False, allow_blank=True, max_length=100, default="Medication")
    unit_price = serializers.DecimalField(
        required=False,
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )
    total_amount = serializers.DecimalField(
        required=False,
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )
    currency = serializers.CharField(required=False, allow_blank=True, max_length=10, default="BDT")
    channel = serializers.ChoiceField(required=False, choices=InternalSale.Channel.choices, default=InternalSale.Channel.WALK_IN)
    client_reference = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    raw_payload = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        resource_catalog_id = attrs.get("resource_catalog_id")
        medicine_name = str(attrs.get("medicine_name") or "").strip()
        if not resource_catalog_id and not medicine_name:
            raise serializers.ValidationError(
                {"medicine_name": "Provide resource_catalog_id or medicine_name."}
            )
        return attrs


class InternalSaleResourceOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    resource_name = serializers.CharField()
    available_stock = serializers.IntegerField(min_value=0)
    unit = serializers.CharField(allow_blank=True)


class InternalSaleSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    resource_name = serializers.CharField(source="resource_catalog.name", read_only=True)
    sold_by_email = serializers.EmailField(source="sold_by.email", read_only=True)

    class Meta:
        model = InternalSale
        fields = [
            "id",
            "facility",
            "facility_name",
            "resource_catalog",
            "resource_name",
            "event_date",
            "quantity_sold",
            "unit_price",
            "total_amount",
            "currency",
            "channel",
            "client_reference",
            "notes",
            "sold_by",
            "sold_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class RetailSaleCreateSerializer(serializers.Serializer):
    inventory_id = serializers.UUIDField()
    batch_id = serializers.UUIDField(required=False)
    quantity = serializers.IntegerField(min_value=1)
    customer_reference = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class RetailSaleSerializer(serializers.ModelSerializer):
    inventory_id = serializers.UUIDField(source="inventory.id", read_only=True)
    batch_id = serializers.UUIDField(source="batch.id", read_only=True, allow_null=True)
    catalog_item_id = serializers.UUIDField(source="inventory.catalog_item.id", read_only=True)
    catalog_item_name = serializers.CharField(source="inventory.catalog_item.name", read_only=True)
    hospital_id = serializers.UUIDField(source="inventory.catalog_item.hospital.id", read_only=True)
    sold_by_email = serializers.EmailField(source="sold_by.email", read_only=True)

    class Meta:
        model = RetailSale
        fields = [
            "id",
            "inventory_id",
            "batch_id",
            "catalog_item_id",
            "catalog_item_name",
            "hospital_id",
            "quantity",
            "unit_selling_price_snapshot",
            "discount_amount",
            "final_total",
            "customer_reference",
            "notes",
            "sold_by",
            "sold_by_email",
            "sold_at",
        ]
        read_only_fields = fields
