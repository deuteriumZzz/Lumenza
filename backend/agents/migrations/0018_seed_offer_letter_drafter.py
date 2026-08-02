from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "candidate_name",
            "label": "Имя кандидата",
            "type": "text",
            "required": True,
            "max_length": 120,
        },
        {
            "key": "role",
            "label": "Должность",
            "type": "text",
            "required": True,
            "max_length": 150,
        },
        {
            "key": "key_terms",
            "label": "Ключевые условия (оклад, дата начала, формат)",
            "type": "text",
            "required": True,
            "max_length": 500,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — HR-ассистент Lumenza. По имени кандидата, должности и ключевым "
    "условиям, которые указал пользователь, составляешь официальное "
    "оффер-письмо на русском языке в вежливом деловом тоне и выделяешь "
    "ключевые условия отдельным списком."
)

WORKFLOW_STEPS = [
    {
        "key": "outline",
        "label": "Продумываем структуру письма",
        "task": "content_plan",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговое письмо",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "offer_letter_text": {"type": "string"},
        "key_terms": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["offer_letter_text", "key_terms"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="offer-letter-drafter",
        defaults={
            "name": "Оффер-письмо",
            "description": (
                "Собирает имя кандидата, должность и условия — выдаёт "
                "готовое оффер-письмо и список ключевых условий."
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
    Agent.objects.filter(slug="offer-letter-drafter").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0017_seed_blog_post_generator"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
