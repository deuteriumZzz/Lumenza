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
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — исследовательский аналитик Lumenza. По теме, которую указал "
    "пользователь, собираешь актуальные источники и синтезируешь их в "
    "краткий, но содержательный дайджест на русском языке. Всегда явно "
    "перечисляешь источники, на которые опираешься — не выдумываешь факты "
    "и не приводишь утверждения без опоры на найденные источники."
)

WORKFLOW_STEPS = [
    {
        "key": "research",
        "label": "Ищем и синтезируем источники",
        "task": "search",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый дайджест",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "topic": {"type": "string"},
        "summary": {"type": "string"},
        "key_points": {
            "type": "array",
            "items": {"type": "string"},
        },
        "sources_note": {"type": "string"},
    },
    "required": ["topic", "summary", "key_points", "sources_note"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="research-digest",
        defaults={
            "name": "Дайджест по теме",
            "description": (
                "Ищет актуальные источники по вашей теме и собирает "
                "краткий дайджест с цитируемыми фактами и ключевыми "
                "выводами."
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
    Agent.objects.filter(slug="research-digest").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0003_agent_category"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
