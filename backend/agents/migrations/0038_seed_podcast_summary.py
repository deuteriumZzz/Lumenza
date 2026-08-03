from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "article_text",
            "label": "Текст статьи или материала",
            "type": "text",
            "required": True,
            "max_length": 4000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — ведущий подкаста Lumenza. По тексту статьи или материала, "
    "который прислал пользователь, пишешь сценарий короткого устного "
    "рассказа: не читаешь текст дословно, а пересказываешь его своими "
    "словами в разговорном стиле, как ведущий подкаста объясняет тему "
    "слушателям. После озвучки пишешь заголовок эпизода и короткое "
    "описание на русском языке."
)

WORKFLOW_STEPS = [
    {
        "key": "write_script",
        "label": "Пишем сценарий подкаста",
        "task": "longform",
    },
    {
        "key": "generate_audio",
        "label": "Озвучиваем подкаст",
        "task": "audio_generation",
    },
    {
        "key": "assemble",
        "label": "Пишем описание эпизода",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        # Переопределяется на бэкенде реальным URL сгенерированного аудио
        # (agents.tasks._run_agent_steps) — модель не может знать
        # настоящий адрес файла.
        "audio_url": {"type": "string"},
        "description": {"type": "string"},
    },
    "required": ["title", "audio_url", "description"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="podcast-summary",
        defaults={
            "name": "Подкаст из текста",
            "description": (
                "Превращает статью или текст в короткий аудио-подкаст с "
                "заголовком и описанием эпизода."
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
    Agent.objects.filter(slug="podcast-summary").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0037_alter_agent_category"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
