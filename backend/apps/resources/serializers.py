"""Resources app serializers."""
from rest_framework import serializers

from .models import ResourceCatalog, ResourceInventory, ResourceShare, ResourceTransaction, ResourceType


class ResourceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceType
        fields = ("id", "name", "description", "unit_of_measure", "created_at")
        read_only_fields = ("id", "created_at")


class ResourceCatalogSerializer(serializers.ModelSerializer):
    resource_type_name = serializers.ReadOnlyField(source="resource_type.name")
    hospital_name = serializers.ReadOnlyField(source="hospital.name")

    class Meta:
        model = ResourceCatalog
        fields = (
            "id",
            "hospital",
            "hospital_name",
            "resource_type",
            "resource_type_name",
            "name",
            "description",
            "unit_of_measure",
            "is_shareable",
            "minimum_stock_level",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "hospital_name", "resource_type_name", "created_at", "updated_at")


class ResourceInventorySerializer(serializers.ModelSerializer):
    catalog_item_name = serializers.ReadOnlyField(source="catalog_item.name")
    hospital_name = serializers.ReadOnlyField(source="catalog_item.hospital.name")
    resource_type = serializers.ReadOnlyField(source="catalog_item.resource_type.id")
    resource_type_name = serializers.ReadOnlyField(source="catalog_item.resource_type.name")
    quantity_free = serializers.ReadOnlyField()

    class Meta:
        model = ResourceInventory
        fields = (
            "id",
            "catalog_item",
            "resource_type",
            "resource_type_name",
            "catalog_item_name",
            "hospital_name",
            "quantity_available",
            "quantity_reserved",
            "reserved_quantity",
            "quantity_free",
            "price_per_unit",
            "currency",
            "expiry_date",
            "last_restocked_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "catalog_item_name", "hospital_name", "quantity_free", "created_at", "updated_at")


class ResourceShareSerializer(serializers.ModelSerializer):
    catalog_item_name = serializers.ReadOnlyField(source="catalog_item.name")
    hospital_name = serializers.ReadOnlyField(source="hospital.name")
    resource_type = serializers.ReadOnlyField(source="catalog_item.resource_type.id")
    resource_type_name = serializers.ReadOnlyField(source="catalog_item.resource_type.name")

    class Meta:
        model = ResourceShare
        fields = (
            "id",
            "hospital",
            "hospital_name",
            "catalog_item",
            "catalog_item_name",
            "resource_type",
            "resource_type_name",
            "quantity_offered",
            "status",
            "notes",
            "valid_until",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "hospital_name", "catalog_item_name", "resource_type", "resource_type_name", "created_by", "created_at", "updated_at")


class ResourceTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceTransaction
        fields = (
            "id",
            "inventory",
            "transaction_type",
            "quantity_delta",
            "balance_after",
            "reference_id",
            "notes",
            "performed_by",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class AdjustInventorySerializer(serializers.Serializer):
    quantity_delta = serializers.IntegerField()
    notes = serializers.CharField(required=False, default="")
    transaction_type = serializers.ChoiceField(
        choices=ResourceTransaction.TransactionType.choices,
        default=ResourceTransaction.TransactionType.ADJUSTMENT,
    )


class InventoryShareVisibilitySerializer(serializers.Serializer):
    """
    Serializer for the inventory share visibility endpoint.
    Combines inventory data with resource share information.
    """

    inventory_id = serializers.UUIDField()
    product_name = serializers.CharField()
    unit = serializers.CharField()
    total_quantity = serializers.IntegerField()
    shared_quantity = serializers.IntegerField()
    share_id = serializers.UUIDField(allow_null=True)

    def create(self, validated_data):
        """
        Create or update a ResourceShare based on validated data.
        This method is called by the POST endpoint.
        """
        from .models import ResourceCatalog, ResourceShare

        hospital = self.context.get("hospital")
        inventory_id = validated_data.get("inventory_id")
        shared_quantity = validated_data.get("shared_quantity")

        try:
            inventory = ResourceInventory.objects.get(id=inventory_id)
            catalog_item = inventory.catalog_item
        except ResourceInventory.DoesNotExist:
            raise serializers.ValidationError({"inventory_id": "Inventory not found."})

        # Validate hospital ownership
        if catalog_item.hospital != hospital:
            raise serializers.ValidationError(
                {"detail": "You can only modify shares for your own hospital's inventory."}
            )

        # Validate shared_quantity <= total_quantity
        if shared_quantity > inventory.quantity_available:
            raise serializers.ValidationError(
                {
                    "shared_quantity": f"Shared quantity ({shared_quantity}) cannot exceed "
                    f"available quantity ({inventory.quantity_available})."
                }
            )

        # Get or create ResourceShare
        share, created = ResourceShare.objects.get_or_create(
            hospital=hospital,
            catalog_item=catalog_item,
            defaults={
                "quantity_offered": shared_quantity,
                "status": ResourceShare.Status.ACTIVE,
                "created_by": self.context.get("user"),
            },
        )

        if not created:
            # Update existing share
            share.quantity_offered = shared_quantity
            share.save(update_fields=["quantity_offered", "updated_at"])

        return {
            "inventory_id": inventory.id,
            "product_name": catalog_item.name,
            "unit": catalog_item.unit_of_measure,
            "total_quantity": inventory.quantity_available,
            "shared_quantity": share.quantity_offered,
            "share_id": share.id,
        }


class InventoryShareVisibilityWriteSerializer(serializers.Serializer):
    """
    Input serializer for POST requests to inventory share visibility endpoint.
    """

    inventory_id = serializers.UUIDField(required=True)
    shared_quantity = serializers.IntegerField(required=True, min_value=0)
