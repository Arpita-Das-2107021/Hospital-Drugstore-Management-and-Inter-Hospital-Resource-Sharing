# Generated manually for facility metadata alignment

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hospitals", "0008_remove_hospital_contact_email_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="hospital",
            name="data_submission_type",
            field=models.CharField(
                choices=[("api", "API"), ("csv_upload", "CSV Upload"), ("manual", "Manual")],
                db_index=True,
                default="api",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hospital",
            name="facility_classification",
            field=models.CharField(
                choices=[
                    ("GOVT", "Government"),
                    ("PRIVATE", "Private"),
                    ("PHARMACY", "Pharmacy"),
                    ("CLINIC", "Clinic"),
                ],
                default="GOVT",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hospital",
            name="facility_type",
            field=models.CharField(
                choices=[
                    ("hospital", "Hospital"),
                    ("pharmacy", "Pharmacy"),
                    ("clinic", "Clinic"),
                    ("warehouse", "Warehouse"),
                ],
                db_index=True,
                default="hospital",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hospital",
            name="region_level_1",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="hospital",
            name="region_level_2",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="hospital",
            name="region_level_3",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="hospitalregistrationrequest",
            name="data_submission_type",
            field=models.CharField(
                choices=[("api", "API"), ("csv_upload", "CSV Upload"), ("manual", "Manual")],
                default="api",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hospitalregistrationrequest",
            name="facility_classification",
            field=models.CharField(
                choices=[
                    ("GOVT", "Government"),
                    ("PRIVATE", "Private"),
                    ("PHARMACY", "Pharmacy"),
                    ("CLINIC", "Clinic"),
                ],
                default="GOVT",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hospitalregistrationrequest",
            name="facility_type",
            field=models.CharField(
                choices=[
                    ("hospital", "Hospital"),
                    ("pharmacy", "Pharmacy"),
                    ("clinic", "Clinic"),
                    ("warehouse", "Warehouse"),
                ],
                default="hospital",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hospitalregistrationrequest",
            name="region_level_1",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="hospitalregistrationrequest",
            name="region_level_2",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="hospitalregistrationrequest",
            name="region_level_3",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
