from django.db import migrations, models
import django.db.models.deletion


def backfill_last_read_message(apps, schema_editor):
    ConversationParticipant = apps.get_model("communications", "ConversationParticipant")
    Message = apps.get_model("communications", "Message")

    participants = ConversationParticipant.objects.filter(
        last_read_at__isnull=False,
        last_read_message__isnull=True,
    )

    for participant in participants.iterator(chunk_size=500):
        message = (
            Message.objects.filter(
                conversation_id=participant.conversation_id,
                created_at__lte=participant.last_read_at,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        if not message:
            continue

        ConversationParticipant.objects.filter(id=participant.id).update(
            last_read_message_id=message.id,
            last_read_at=message.created_at,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationparticipant",
            name="last_read_message",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="read_by_participants",
                to="communications.message",
            ),
        ),
        migrations.RunPython(backfill_last_read_message, migrations.RunPython.noop),
    ]
