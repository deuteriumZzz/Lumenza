# Seeds the fixed unlock catalog — a product/business decision, not
# user-entered admin data, so it belongs in a migration rather than a
# fixture loaded manually post-deploy.

from django.db import migrations

# (key, kind, min_requests, min_distinct_days, sort_order) — cheapest-cost
# categories unlock first (see providers.TASK_ROUTES / imagegen.IMAGE_TASK_ROUTES
# for the provider costs behind this ordering). hashtags/repurpose/illustration
# are free-by-default for everyone (repurpose/illustration are also this
# product's default task in the API/bot, so a fresh FREE user's very first
# request must never be locked) and are NOT in this catalog at all.
CATALOG = [
    ("translation", "text_task", 3, 1, 1),
    ("realistic", "image_task", 6, 2, 2),
    ("hook", "text_task", 10, 3, 3),
    ("longform", "text_task", 15, 4, 4),
    ("content_plan", "text_task", 20, 5, 5),
]


def seed_catalog(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    for key, kind, min_requests, min_distinct_days, sort_order in CATALOG:
        UnlockableResource.objects.create(
            key=key,
            kind=kind,
            min_requests=min_requests,
            min_distinct_days=min_distinct_days,
            sort_order=sort_order,
        )


def unseed_catalog(apps, schema_editor):
    UnlockableResource = apps.get_model("progression", "UnlockableResource")
    UnlockableResource.objects.filter(
        key__in=[row[0] for row in CATALOG]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("progression", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_catalog, unseed_catalog),
    ]
