from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "topic_or_brand",
            "label": "Тема или бренд",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

# Короткие, конкретные формулировки намеренно: SearchAdapter отправляет весь
# отрендеренный промпт как буквальный поисковый запрос в Tavily.
SYSTEM_INSTRUCTIONS = (
    "Ты — аналитик по анализу тональности Lumenza. По теме или бренду, "
    "которые указал пользователь, ищешь актуальные упоминания и "
    "синтезируешь общий тон аудитории на русском языке: преобладающее "
    "настроение, ключевые темы обсуждения и заметные упоминания. Всегда "
    "явно перечисляешь источники — не выдумываешь факты."
)

WORKFLOW_STEPS = [
    {
        "key": "research",
        "label": "Ищем упоминания и синтезируем тон",
        "task": "search",
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
        "overall_sentiment": {"type": "string"},
        "themes": {
            "type": "array",
            "items": {"type": "string"},
        },
        "notable_mentions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "sources_note": {"type": "string"},
    },
    "required": [
        "overall_sentiment",
        "themes",
        "notable_mentions",
        "sources_note",
    ],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="audience-sentiment",
        defaults={
            "name": "Анализ тона аудитории",
            "description": (
                "Ищет актуальные упоминания темы или бренда и собирает "
                "анализ тональности: настроение, темы и заметные "
                "упоминания."
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
    Agent.objects.filter(slug="audience-sentiment").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0020_seed_support_reply_drafter"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
