from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "topic",
            "label": "Тема или актив",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

# Короткие, конкретные формулировки намеренно: SearchAdapter отправляет весь
# отрендеренный промпт (включая system_instructions) как буквальный
# поисковый запрос в Tavily — многословная проза размывает релевантность
# поиска, а не просто задаёт тон модели.
SYSTEM_INSTRUCTIONS = (
    "Ты — финансовый аналитик Lumenza. По теме или активу, который указал "
    "пользователь, собираешь актуальные источники и синтезируешь их в "
    "краткий дайджест на русском языке. Всегда явно перечисляешь "
    "источники, на которые опираешься — не выдумываешь факты и не "
    "приводишь цифры без опоры на найденные источники. Материал — "
    "информационный дайджест, а не индивидуальная инвестиционная "
    "рекомендация; ты никогда не советуешь купить, продать или держать "
    "конкретный актив."
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
        # Значение этого поля переопределяется на бэкенде фиксированной
        # строкой (agents.tasks._FIXED_DISCLAIMERS) после сборки результата
        # — модели нельзя доверять точную формулировку дисклеймера,
        # parse_final_result проверяет только наличие ключа, не его
        # содержимое.
        "disclaimer": {"type": "string"},
        "sources_note": {"type": "string"},
    },
    "required": ["topic", "summary", "key_points", "disclaimer", "sources_note"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="finance-digest",
        defaults={
            "name": "Дайджест рынка",
            "description": (
                "Ищет актуальные источники по вашей теме или активу и "
                "собирает краткий информационный дайджест с цитируемыми "
                "фактами."
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
    Agent.objects.filter(slug="finance-digest").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0009_alter_agent_category"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
