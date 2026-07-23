# Adds "search" (веб-поиск через Tavily, providers/search_adapter.py) в
# каталог разблокировок — новая, самая дорогая по стоимости категория,
# поэтому размещена выше существующего максимума (content_plan: 20/5) как
# следующая ступень апгрейда.

from django.db import migrations

RESOURCE_KEY = "search"
RESOURCE_KIND = "text_task"
MIN_REQUESTS = 25
MIN_DISTINCT_DAYS = 6
SORT_ORDER = 12


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
        ("progression", "0009_seed_model_unlockables"),
    ]

    operations = [
        migrations.RunPython(add_resource, remove_resource),
    ]
