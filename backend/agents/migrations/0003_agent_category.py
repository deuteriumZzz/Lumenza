from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0002_seed_threads_content_day"),
    ]

    operations = [
        migrations.AddField(
            model_name="agent",
            name="category",
            field=models.CharField(
                choices=[
                    ("content", "Контент"),
                    ("research", "Исследования"),
                    ("documents", "Документы"),
                ],
                default="content",
                max_length=32,
            ),
            preserve_default=False,
        ),
    ]
