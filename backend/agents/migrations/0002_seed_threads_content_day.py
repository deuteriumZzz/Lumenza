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
            "label": "Аудитория",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "tone",
            "label": "Тон",
            "type": "select",
            "required": True,
            "options": [
                "дружелюбный",
                "экспертный",
                "дерзкий",
                "вдохновляющий",
            ],
        },
        {
            "key": "goal",
            "label": "Цель",
            "type": "select",
            "required": True,
            "options": [
                "рост подписчиков",
                "вовлечённость",
                "продажи",
                "узнаваемость бренда",
            ],
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — контент-стратег Lumenza. Составляешь практичные планы контента для "
    "Threads на русском языке, опираясь на тему, аудиторию, тон и цель, "
    "которые указал пользователь. Ты никогда не публикуешь и не "
    "утверждаешь, что опубликовал что-либо — публикация вне твоей "
    "ответственности; ты выдаёшь только план."
)

WORKFLOW_STEPS = [
    {
        "key": "outline",
        "label": "Продумываем ветки контента",
        "task": "content_plan",
    },
    {
        "key": "hooks",
        "label": "Пишем хуки для каждой ветки",
        "task": "hook",
    },
    {
        "key": "assemble",
        "label": "Собираем расписание и финальный план",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "branches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "angle": {"type": "string"},
                },
            },
        },
        "hooks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "branch": {"type": "string"},
                    "variants": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "schedule": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "time": {"type": "string"},
                    "branch": {"type": "string"},
                    "post_text": {"type": "string"},
                },
            },
        },
        "variants": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["branches", "hooks", "schedule", "variants"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="threads-content-day",
        defaults={
            "name": "Контент на день для Threads",
            "description": (
                "Собирает тему, аудиторию, тон и цель — выдаёт готовый план "
                "Threads на день: ветки, хуки, расписание и варианты."
            ),
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
    Agent.objects.filter(slug="threads-content-day").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
