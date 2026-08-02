from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "target",
            "label": "Кому пишете (роль, компания)",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "context",
            "label": "Повод для контакта",
            "type": "text",
            "required": True,
            "max_length": 300,
        },
        {
            "key": "tone",
            "label": "Тон",
            "type": "select",
            "required": True,
            "options": ["дружелюбный", "формальный", "экспертный"],
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — специалист по нетворкингу Lumenza. По роли/компании адресата, "
    "поводу для контакта и тону, которые указал пользователь, составляешь "
    "короткое персонализированное сообщение для LinkedIn на русском языке "
    "и варианты первой строки. Никогда не отправляешь сообщение сам — "
    "только готовишь текст."
)

WORKFLOW_STEPS = [
    {
        "key": "outline",
        "label": "Продумываем угол подхода",
        "task": "content_plan",
    },
    {
        "key": "openers",
        "label": "Пишем варианты первой строки",
        "task": "hook",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговые сообщения",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "opening_lines": {
            "type": "array",
            "items": {"type": "string"},
        },
        "message": {"type": "string"},
        "follow_up": {"type": "string"},
    },
    "required": ["opening_lines", "message", "follow_up"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="linkedin-outreach",
        defaults={
            "name": "LinkedIn-аутрич",
            "description": (
                "Собирает роль адресата, повод и тон — выдаёт варианты "
                "первой строки, готовое сообщение и предложение для "
                "follow-up."
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
    Agent.objects.filter(slug="linkedin-outreach").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0014_seed_document_translation"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
