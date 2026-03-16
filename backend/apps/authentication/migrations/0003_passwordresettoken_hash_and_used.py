from django.db import migrations, models


def set_used_from_used_at(apps, schema_editor):
    PasswordResetToken = apps.get_model("authentication", "PasswordResetToken")
    PasswordResetToken.objects.filter(used_at__isnull=False).update(used=True)


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0002_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="passwordresettoken",
            old_name="token",
            new_name="token_hash",
        ),
        migrations.AddField(
            model_name="passwordresettoken",
            name="used",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(set_used_from_used_at, migrations.RunPython.noop),
    ]
