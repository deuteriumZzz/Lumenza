from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "asset",
            "label": "Актив",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

# Короткие, конкретные формулировки намеренно: SearchAdapter отправляет весь
# отрендеренный промпт как буквальный поисковый запрос в Tavily.
SYSTEM_INSTRUCTIONS = (
    "Ты — инвестиционный аналитик Lumenza. По активу, который указал "
    "пользователь, собираешь актуальные источники и синтезируешь "
    "структурированное исследование на русском языке: инвестиционный "
    "тезис и риски. Всегда явно перечисляешь источники — не выдумываешь "
    "факты. Материал — информационное исследование, а не индивидуальная "
    "инвестиционная рекомендация; ты никогда не советуешь купить, продать "
    "или держать конкретный актив."
)

WORKFLOW_STEPS = [
    {
        "key": "research",
        "label": "Ищем и синтезируем источники",
        "task": "search",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговое исследование",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "asset": {"type": "string"},
        "thesis": {"type": "string"},
        "risks": {
            "type": "array",
            "items": {"type": "string"},
        },
        # Переопределяется на бэкенде фиксированной строкой
        # (agents.tasks._FIXED_DISCLAIMERS), как и у finance-digest.
        "disclaimer": {"type": "string"},
        "sources_note": {"type": "string"},
    },
    "required": ["asset", "thesis", "risks", "disclaimer", "sources_note"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="investment-research",
        defaults={
            "name": "Инвестиционное исследование",
            "description": (
                "Ищет актуальные источники по активу и собирает "
                "структурированное исследование: инвестиционный тезис и "
                "риски."
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
    Agent.objects.filter(slug="investment-research").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0028_seed_financial_report_analyzer"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
