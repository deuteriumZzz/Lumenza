from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "document_text",
            "label": "Текст финансового отчёта",
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — финансовый аналитик Lumenza. Тебе дают текст финансового "
    "отчёта, извлечённый из документа пользователя, на русском языке. "
    "Составляешь краткое саммари, выделяешь ключевые показатели и "
    "потенциальные тревожные сигналы. Материал — информационный анализ, "
    "а не индивидуальная инвестиционная рекомендация."
)

WORKFLOW_STEPS = [
    {
        "key": "analyze",
        "label": "Анализируем отчёт",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый анализ",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "key_metrics": {
            "type": "array",
            "items": {"type": "string"},
        },
        "red_flags": {
            "type": "array",
            "items": {"type": "string"},
        },
        # Переопределяется на бэкенде фиксированной строкой
        # (agents.tasks._FIXED_DISCLAIMERS), как и у finance-digest.
        "disclaimer": {"type": "string"},
    },
    "required": ["summary", "key_metrics", "red_flags", "disclaimer"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="financial-report-analyzer",
        defaults={
            "name": "Анализ финансового отчёта",
            "description": (
                "Загрузите финансовый отчёт — получите саммари, ключевые "
                "показатели и тревожные сигналы."
            ),
            "category": "finance",
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
    Agent.objects.filter(slug="financial-report-analyzer").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0027_seed_market_research"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
