from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "competitor",
            "label": "Конкурент",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "niche",
            "label": "Ниша",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

# Короткие, конкретные формулировки намеренно: SearchAdapter отправляет весь
# отрендеренный промпт как буквальный поисковый запрос в Tavily — то же
# соображение, что и у finance-digest.
SYSTEM_INSTRUCTIONS = (
    "Ты — аналитик по конкурентной разведке Lumenza. По конкуренту и нише, "
    "которые указал пользователь, собираешь актуальные источники и "
    "синтезируешь структурированный анализ на русском языке: сильные "
    "стороны, слабые стороны и возможности для пользователя. Всегда явно "
    "перечисляешь источники — не выдумываешь факты."
)

WORKFLOW_STEPS = [
    {
        "key": "research",
        "label": "Ищем и синтезируем источники",
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
        "competitor": {"type": "string"},
        "strengths": {
            "type": "array",
            "items": {"type": "string"},
        },
        "weaknesses": {
            "type": "array",
            "items": {"type": "string"},
        },
        "opportunities": {
            "type": "array",
            "items": {"type": "string"},
        },
        "sources_note": {"type": "string"},
    },
    "required": [
        "competitor",
        "strengths",
        "weaknesses",
        "opportunities",
        "sources_note",
    ],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="competitor-analysis",
        defaults={
            "name": "Конкурентный анализ",
            "description": (
                "Ищет актуальные источники по конкуренту в вашей нише и "
                "собирает структурированный анализ: сильные и слабые "
                "стороны, возможности."
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
    Agent.objects.filter(slug="competitor-analysis").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0012_seed_weekly_content_plan"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
