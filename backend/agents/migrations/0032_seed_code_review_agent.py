from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "code",
            "label": "Код для обзора",
            "type": "text",
            "required": True,
            "max_length": 4000,
        },
        {
            "key": "language",
            "label": "Язык",
            "type": "select",
            "required": True,
            "options": ["Python", "JavaScript", "TypeScript", "Go", "Другой"],
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — старший разработчик Lumenza, проводящий код-ревью. По коду и "
    "языку, которые указал пользователь, находишь реальные проблемы "
    "(баги, небезопасные паттерны, проблемы читаемости и "
    "производительности) и даёшь конкретные предложения по улучшению. "
    "Ответ на русском языке. Не выдумываешь проблем, которых нет в коде."
)

WORKFLOW_STEPS = [
    {
        "key": "review",
        "label": "Анализируем код",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый обзор",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {"type": "string"},
                    "description": {"type": "string"},
                },
            },
        },
        "suggestions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "summary": {"type": "string"},
    },
    "required": ["issues", "suggestions", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="code-review-agent",
        defaults={
            "name": "Обзор кода",
            "description": (
                "Вставьте код — получите разбор проблем по важности, "
                "конкретные предложения и итоговое резюме."
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
    Agent.objects.filter(slug="code-review-agent").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0031_seed_video_teaser_generator"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
