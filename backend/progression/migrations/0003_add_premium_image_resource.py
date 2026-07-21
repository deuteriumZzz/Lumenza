# Adds the "premium" image category (NVIDIA flux.1-dev, Phase 11) to the
# unlock catalog — inserted between realistic and hook in unlock order,
# since its placeholder cost ($0.01/image) sits between flux-schnell/
# illustration ($0.003, free-by-default) and dall-e-3/realistic ($0.04).

from django.db import migrations, models


def add_premium(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    UnlockableResource.objects.filter(sort_order__gte=3).update(
        sort_order=models.F("sort_order") + 1
    )
    UnlockableResource.objects.create(
        key="premium",
        kind="image_task",
        min_requests=8,
        min_distinct_days=3,
        sort_order=3,
    )


def remove_premium(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    UnlockableResource.objects.filter(key="premium").delete()
    UnlockableResource.objects.filter(sort_order__gt=3).update(
        sort_order=models.F("sort_order") - 1
    )


class Migration(migrations.Migration):

    dependencies = [
        ("progression", "0002_seed_catalog"),
    ]

    operations = [
        migrations.RunPython(add_premium, remove_premium),
    ]
