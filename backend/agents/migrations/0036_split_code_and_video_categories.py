from django.db import migrations

# Мигрируем 4 существующих агента из content/research в новые выделенные
# категории "code"/"video" (см. 0035_alter_agent_category) — это те же
# агенты, что и раньше, просто получают более точную категорию, matching
# структуру каталога Abacus.ai (отдельные вкладки Code/Videos).
CODE_SLUGS = ["code-review-agent", "python-test-writer"]
VIDEO_SLUGS = ["video-teaser-generator", "product-demo-video"]


def split_categories(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.filter(slug__in=CODE_SLUGS).update(category="code")
    Agent.objects.filter(slug__in=VIDEO_SLUGS).update(category="video")


def revert_categories(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.filter(slug="code-review-agent").update(category="content")
    Agent.objects.filter(slug="python-test-writer").update(category="research")
    Agent.objects.filter(
        slug__in=["video-teaser-generator", "product-demo-video"]
    ).update(category="content")


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0035_alter_agent_category"),
    ]

    operations = [
        migrations.RunPython(split_categories, revert_categories),
    ]
