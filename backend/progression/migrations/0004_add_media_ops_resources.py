# Adds the three new media_ops modalities (Phase 11: voice-to-text,
# text-to-voice, document-to-text) to the unlock catalog, appended after
# the existing text/image categories rather than reordering them.

from django.db import migrations

CATALOG = [
    ("voice_to_text", "media_task", 12, 3, 7),
    ("document_to_text", "media_task", 16, 4, 8),
    ("text_to_voice", "media_task", 22, 5, 9),
]


def add_resources(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    for key, kind, min_requests, min_distinct_days, sort_order in CATALOG:
        UnlockableResource.objects.create(
            key=key,
            kind=kind,
            min_requests=min_requests,
            min_distinct_days=min_distinct_days,
            sort_order=sort_order,
        )


def remove_resources(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    UnlockableResource.objects.filter(
        key__in=[row[0] for row in CATALOG]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("progression", "0003_add_premium_image_resource"),
    ]

    operations = [
        migrations.RunPython(add_resources, remove_resources),
    ]
