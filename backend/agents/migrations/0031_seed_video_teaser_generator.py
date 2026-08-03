from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "brief",
            "label": "Идея ролика",
            "type": "text",
            "required": True,
            "max_length": 500,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — режиссёр-постановщик Lumenza. По идее ролика, которую указал "
    "пользователь, составляешь конкретный промпт для генерации видео: "
    "сцена, настроение, движение камеры — на английском языке, поскольку "
    "модель генерации видео обучена на английских описаниях. После "
    "генерации видео пишешь короткую подпись к нему на русском языке."
)

WORKFLOW_STEPS = [
    {
        "key": "write_prompt",
        "label": "Составляем промпт для видео",
        "task": "content_plan",
    },
    {
        "key": "generate_video",
        "label": "Генерируем видео",
        "task": "video_generation",
    },
    {
        "key": "assemble",
        "label": "Пишем подпись к видео",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "caption": {"type": "string"},
        # Переопределяется на бэкенде реальным URL сгенерированного видео
        # (agents.tasks._run_agent_steps) — модель не может знать
        # настоящий адрес файла.
        "video_url": {"type": "string"},
    },
    "required": ["caption", "video_url"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="video-teaser-generator",
        defaults={
            "name": "Генератор видео-тизера",
            "description": (
                "Превращает вашу идею в готовый видео-промпт, генерирует "
                "короткое видео и пишет к нему подпись."
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
    Agent.objects.filter(slug="video-teaser-generator").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0030_seed_data_quick_check"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
