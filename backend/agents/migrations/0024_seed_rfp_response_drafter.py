from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "document_text",
            "label": "Текст RFP",
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
        {
            "key": "company_context",
            "label": "О вашей компании (для ответа)",
            "type": "text",
            "required": True,
            "max_length": 1000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — ассистент Lumenza по тендерным заявкам. Тебе дают текст запроса "
    "предложений (RFP), извлечённый из документа пользователя, и "
    "контекст о его компании. Составляешь ответы на каждый вопрос/пункт "
    "RFP на русском языке, опираясь на контекст компании, и краткое "
    "резюме заявки."
)

WORKFLOW_STEPS = [
    {
        "key": "draft",
        "label": "Готовим ответы на пункты RFP",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговую заявку",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "responses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "answer": {"type": "string"},
                },
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["responses", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="rfp-response-drafter",
        defaults={
            "name": "Ответ на RFP",
            "description": (
                "Загрузите RFP и опишите вашу компанию — получите готовые "
                "ответы на каждый пункт и резюме заявки."
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
    Agent.objects.filter(slug="rfp-response-drafter").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0023_seed_invoice_data_extractor"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
