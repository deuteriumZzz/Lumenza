# Companion to 0010_add_search_resource.py — TASK_ROUTES["search"] (see
# providers/services.py) has exactly one candidate, so it needs exactly one
# ModelUnlockable row, or test_model_unlockable_catalog_matches_task_routes
# (progression/models.py's ModelUnlockable docstring explains why this is a
# hand-maintained snapshot, not a live read of TASK_ROUTES) correctly flags
# the mismatch. Position 0 — free the moment the "search" category itself
# unlocks, same convention as every other category's primary candidate in
# 0009_seed_model_unlockables.py.

from django.db import migrations

TASK = "search"
PROVIDER = "search"
MODEL = "gpt-4o-mini"


def seed(apps, schema_editor):
    ModelUnlockable = apps.get_model("progression", "ModelUnlockable")
    ModelUnlockable.objects.create(
        task=TASK,
        provider=PROVIDER,
        model=MODEL,
        min_requests=0,
        min_distinct_days=0,
        sort_order=0,
    )


def unseed(apps, schema_editor):
    ModelUnlockable = apps.get_model("progression", "ModelUnlockable")
    ModelUnlockable.objects.filter(task=TASK, provider=PROVIDER, model=MODEL).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("progression", "0010_add_search_resource"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
