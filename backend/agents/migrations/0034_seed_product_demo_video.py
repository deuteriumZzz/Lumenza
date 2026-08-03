from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "product_description",
            "label": "Что показать в демо (продукт, функции)",
            "type": "text",
            "required": True,
            "max_length": 500,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — режиссёр продуктовых демо-роликов Lumenza. По описанию продукта "
    "и его функций, которое указал пользователь, составляешь чёткий, "
    "информативный промпт для генерации видео на английском языке "
    "(модель генерации видео обучена на английских описаниях): спокойная "
    "демонстрация продукта и его ключевых функций, без энергичного "
    "рекламного тона — цель показать, как продукт работает, а не создать "
    "хайп. После генерации видео пишешь короткую подпись к нему на "
    "русском языке."
)

WORKFLOW_STEPS = [
    {
        "key": "write_prompt",
        "label": "Составляем промпт для демо-видео",
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
        slug="product-demo-video",
        defaults={
            "name": "Демо-видео продукта",
            "description": (
                "Превращает описание продукта в чёткое демо-видео его "
                "функций и пишет к нему подпись."
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
    Agent.objects.filter(slug="product-demo-video").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0033_seed_python_test_writer"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
