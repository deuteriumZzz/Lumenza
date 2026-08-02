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
            "options": ["экспертный", "разговорный", "вдохновляющий"],
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — блог-редактор Lumenza. По теме, аудитории и тону, которые указал "
    "пользователь, пишешь полноценную статью в блог на русском языке: "
    "заголовок, разделы с подзаголовками и содержательным текстом, краткое "
    "резюме."
)

WORKFLOW_STEPS = [
    {
        "key": "draft",
        "label": "Пишем черновик статьи",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговую статью",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "heading": {"type": "string"},
                    "body": {"type": "string"},
                },
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["title", "sections", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="blog-post-generator",
        defaults={
            "name": "Генератор блог-поста",
            "description": (
                "Собирает тему, аудиторию и тон — выдаёт полноценную "
                "статью для блога: заголовок, разделы и резюме."
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
    Agent.objects.filter(slug="blog-post-generator").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0016_seed_twitter_content_engine"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
