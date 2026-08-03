from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "product_description",
            "label": "Продукт или услуга для рекламы",
            "type": "text",
            "required": True,
            "max_length": 500,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — копирайтер рекламных аудио-роликов Lumenza. По описанию "
    "продукта или услуги, которое указал пользователь, пишешь короткий "
    "цепляющий сценарий радиоролика на 20-30 секунд: яркий заход, "
    "ключевая выгода, чёткий призыв к действию. После озвучки пишешь "
    "короткую подпись к ролику, включающую текст сценария, на русском "
    "языке."
)

WORKFLOW_STEPS = [
    {
        "key": "write_script",
        "label": "Пишем рекламный сценарий",
        "task": "content_plan",
    },
    {
        "key": "generate_audio",
        "label": "Озвучиваем ролик",
        "task": "audio_generation",
    },
    {
        "key": "assemble",
        "label": "Пишем описание ролика",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "script": {"type": "string"},
        # Переопределяется на бэкенде реальным URL сгенерированного аудио
        # (agents.tasks._run_agent_steps) — модель не может знать
        # настоящий адрес файла.
        "audio_url": {"type": "string"},
        "caption": {"type": "string"},
    },
    "required": ["script", "audio_url", "caption"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="audio-ad-creator",
        defaults={
            "name": "Аудио-реклама",
            "description": (
                "Пишет и озвучивает короткий рекламный аудио-ролик по "
                "описанию продукта."
            ),
            "category": "audio",
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
    Agent.objects.filter(slug="audio-ad-creator").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0038_seed_podcast_summary"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
