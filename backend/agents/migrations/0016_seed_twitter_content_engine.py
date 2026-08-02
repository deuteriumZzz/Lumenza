from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "niche",
            "label": "Ниша/тема аккаунта",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

# Короткие, конкретные формулировки намеренно: SearchAdapter отправляет весь
# отрендеренный промпт как буквальный поисковый запрос в Tavily.
SYSTEM_INSTRUCTIONS = (
    "Ты — контент-стратег Lumenza для X (Twitter). По нише, которую указал "
    "пользователь, ищешь актуальные темы и тренды и составляешь набор "
    "идей для постов на русском языке: отдельные твиты и идею для треда. "
    "Опираешься на найденные источники, не выдумываешь тренды."
)

WORKFLOW_STEPS = [
    {
        "key": "research",
        "label": "Ищем актуальные темы и тренды",
        "task": "search",
    },
    {
        "key": "assemble",
        "label": "Собираем идеи постов",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "trending_topics": {
            "type": "array",
            "items": {"type": "string"},
        },
        "tweets": {
            "type": "array",
            "items": {"type": "string"},
        },
        "thread_idea": {"type": "string"},
    },
    "required": ["trending_topics", "tweets", "thread_idea"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="twitter-content-engine",
        defaults={
            "name": "X/Twitter контент-движок",
            "description": (
                "Ищет актуальные темы в вашей нише и собирает набор идей "
                "для постов в X: отдельные твиты и идею для треда."
            ),
            "category": "content",
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
    Agent.objects.filter(slug="twitter-content-engine").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0015_seed_linkedin_outreach"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
