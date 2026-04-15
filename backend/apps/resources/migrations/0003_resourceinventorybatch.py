# Generated manually for request workflow v2 inventory batching

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("resources", "0002_resourceinventory_currency_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ResourceInventoryBatch",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("batch_number", models.CharField(max_length=120)),
                ("quantity_acquired", models.PositiveIntegerField(default=0)),
                ("quantity_available_in_batch", models.PositiveIntegerField(default=0)),
                ("quantity_reserved_in_batch", models.PositiveIntegerField(default=0)),
                ("unit_price_at_acquisition", models.DecimalField(decimal_places=2, max_digits=10)),
                ("currency", models.CharField(default="BDT", max_length=10)),
                ("acquired_at", models.DateTimeField()),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("source_reference", models.CharField(blank=True, max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "inventory",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="batches",
                        to="resources.resourceinventory",
                    ),
                ),
            ],
            options={
                "db_table": "resources_resourceinventorybatch",
            },
        ),
        migrations.AddConstraint(
            model_name="resourceinventorybatch",
            constraint=models.UniqueConstraint(
                fields=("inventory", "batch_number"),
                name="uniq_inventory_batch_number",
            ),
        ),
        migrations.AddIndex(
            model_name="resourceinventorybatch",
            index=models.Index(fields=["inventory", "-acquired_at"], name="resources_r_invento_5f09be_idx"),
        ),
        migrations.AddIndex(
            model_name="resourceinventorybatch",
            index=models.Index(fields=["inventory", "expires_at"], name="resources_r_invento_b81abf_idx"),
        ),
    ]
