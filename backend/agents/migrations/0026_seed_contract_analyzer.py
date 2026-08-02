from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "document_text",
            "label": "Текст договора",
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — ассистент Lumenza по анализу договоров. Тебе дают текст "
    "договора, извлечённый из документа пользователя, на русском языке. "
    "Составляешь краткое саммари, выделяешь ключевые условия, "
    "потенциальные риски и даёшь рекомендации, на что обратить внимание. "
    "Ты не являешься юристом — явно указываешь, что это не юридическая "
    "консультация."
)

WORKFLOW_STEPS = [
    {
        "key": "analyze",
        "label": "Анализируем договор",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый анализ",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "key_terms": {
            "type": "array",
            "items": {"type": "string"},
        },
        "risks": {
            "type": "array",
            "items": {"type": "string"},
        },
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["summary", "key_terms", "risks", "recommendations"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="contract-analyzer",
        defaults={
            "name": "Анализ договора",
            "description": (
                "Загрузите договор — получите саммари, ключевые условия, "
                "риски и рекомендации. Не является юридической "
                "консультацией."
            ),
            "category": "documents",
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
    Agent.objects.filter(slug="contract-analyzer").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0025_seed_resume_job_matcher"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
