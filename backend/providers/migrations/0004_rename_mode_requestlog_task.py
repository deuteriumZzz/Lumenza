# Generated for Phase 10 (task-based routing) — renames RequestLog.mode to
# .task and updates its default from the old "fast" mode key to "repurpose",
# the new task category with equivalent routing behavior.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("providers", "0003_alter_requestlog_status"),
    ]

    operations = [
        migrations.RenameField(
            model_name="requestlog",
            old_name="mode",
            new_name="task",
        ),
        migrations.AlterField(
            model_name="requestlog",
            name="task",
            field=models.CharField(default="repurpose", max_length=16),
        ),
    ]
