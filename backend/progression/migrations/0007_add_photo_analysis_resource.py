# Adds "photo_to_caption" (nvidia/llama-3.1-nemotron-nano-vl-8b-v1 photo
# analysis, taxonomy-expansion follow-up to Phase 11) to the unlock
# catalog, appended after "edit" rather than reordering existing entries.

from django.db import migrations

RESOURCE_KEY = "photo_to_caption"
RESOURCE_KIND = "media_task"
MIN_REQUESTS = 14
MIN_DISTINCT_DAYS = 3
SORT_ORDER = 11


def add_resource(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    UnlockableResource.objects.create(
        key=RESOURCE_KEY,
        kind=RESOURCE_KIND,
        min_requests=MIN_REQUESTS,
        min_distinct_days=MIN_DISTINCT_DAYS,
        sort_order=SORT_ORDER,
    )


def remove_resource(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    UnlockableResource.objects.filter(key=RESOURCE_KEY).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("progression", "0006_add_image_edit_resource"),
    ]

    operations = [
        migrations.RunPython(add_resource, remove_resource),
    ]
