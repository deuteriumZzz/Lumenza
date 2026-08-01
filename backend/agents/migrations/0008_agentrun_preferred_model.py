from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("agents", "0007_agent_source_agent_slugs_agent_user")]

    operations = [
        migrations.AddField(
            model_name="agentrun",
            name="preferred_model",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
