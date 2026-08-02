from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "topic",
            "label": "Тема",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "audience",
            "label": "Для кого отчёт",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — исследовательский аналитик Lumenza. По теме и аудитории, "
    "которые указал пользователь, готовишь структурированный "
    "аналитический отчёт на русском языке: заголовок, разделы с "
    "содержательным анализом и итоговые выводы. Всегда опираешься на "
    "найденные источники, не выдумываешь факты."
)

WORKFLOW_STEPS = [
    {
        "key": "research",
        "label": "Ищем источники по теме",
        "task": "search",
    },
    {
        "key": "draft",
        "label": "Пишем черновик отчёта",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый отчёт",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "heading": {"type": "string"},
                    "body": {"type": "string"},
                },
            },
        },
        "key_takeaways": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["title", "sections", "key_takeaways"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="research-report",
        defaults={
            "name": "Аналитический отчёт",
            "description": (
                "Ищет источники по теме и готовит структурированный "
                "аналитический отчёт с разделами и итоговыми выводами."
            ),
            "category": "research",
            "version": 1,
            "status": "published",
            "input_schema": INPUT_SCHEMA,
            "system_instructions": SYSTEM_INSTRUCTIONS,
            "workflow_steps": WORKFLOW_STEPS,
            "model_policy": {},
            "tool_policy": {},
            "output_schema": OUTPUT_SCHEMA,
            "eval_set": [],
        },
    )


def unseed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.filter(slug="research-report").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0021_seed_audience_sentiment"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
