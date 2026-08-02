from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "customer_message",
            "label": "Сообщение клиента",
            "type": "text",
            "required": True,
            "max_length": 2000,
        },
        {
            "key": "context",
            "label": "Контекст (что нужно знать для ответа)",
            "type": "text",
            "required": False,
            "max_length": 1000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — специалист поддержки Lumenza. По сообщению клиента и "
    "дополнительному контексту, которые указал пользователь, составляешь "
    "вежливый и конкретный ответ на русском языке, а также короткую "
    "заметку о выбранном тоне ответа."
)

WORKFLOW_STEPS = [
    {
        "key": "outline",
        "label": "Продумываем ответ",
        "task": "content_plan",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый ответ",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply_text": {"type": "string"},
        "tone_note": {"type": "string"},
    },
    "required": ["reply_text", "tone_note"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="support-reply-drafter",
        defaults={
            "name": "Ответ в поддержку",
            "description": (
                "Берёт сообщение клиента и контекст — выдаёт готовый "
                "ответ и заметку о выбранном тоне."
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
    Agent.objects.filter(slug="support-reply-drafter").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0019_seed_recipe_creator"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
