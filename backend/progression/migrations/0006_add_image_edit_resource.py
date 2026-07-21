# Adds "edit" (flux.1-kontext-dev image editing, Phase 11 reserve-pool
# follow-up) to the unlock catalog, appended after the existing media_ops
# modalities rather than reordering them.

from django.db import migrations

RESOURCE_KEY = "edit"
RESOURCE_KIND = "image_task"
MIN_REQUESTS = 18
MIN_DISTINCT_DAYS = 4
SORT_ORDER = 10


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
        ("progression", "0005_alter_unlockableresource_kind"),
    ]

    operations = [
        migrations.RunPython(add_resource, remove_resource),
    ]
