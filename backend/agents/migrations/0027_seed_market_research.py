from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "sector_or_theme",
            "label": "Сектор или тема",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

# Короткие, конкретные формулировки намеренно: SearchAdapter отправляет весь
# отрендеренный промпт как буквальный поисковый запрос в Tavily.
SYSTEM_INSTRUCTIONS = (
    "Ты — финансовый аналитик Lumenza. По сектору или теме, которые указал "
    "пользователь, собираешь актуальные источники и синтезируешь "
    "структурированное исследование на русском языке: тренды сектора и "
    "ключевые игроки. Всегда явно перечисляешь источники — не выдумываешь "
    "факты и цифры. Материал — информационное исследование, а не "
    "индивидуальная инвестиционная рекомендация."
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
        "theme": {"type": "string"},
        "trends": {
            "type": "array",
            "items": {"type": "string"},
        },
        "key_players": {
            "type": "array",
            "items": {"type": "string"},
        },
        # Переопределяется на бэкенде фиксированной строкой
        # (agents.tasks._FIXED_DISCLAIMERS), как и у finance-digest.
        "disclaimer": {"type": "string"},
        "sources_note": {"type": "string"},
    },
    "required": ["theme", "trends", "key_players", "disclaimer", "sources_note"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="market-research",
        defaults={
            "name": "Исследование рынка",
            "description": (
                "Ищет актуальные источники по сектору или теме и собирает "
                "структурированное исследование: тренды и ключевые "
                "игроки."
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
    Agent.objects.filter(slug="market-research").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0026_seed_contract_analyzer"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
