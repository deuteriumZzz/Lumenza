from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "document_text",
            "label": "Текст счёта",
            # Frontend-only hint: renders a file-upload control that runs the
            # document through OCR (POST /api/documents/) first and fills
            # this field with the extracted text — the backend still just
            # sees a plain required string, same as document-summary.
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — ассистент Lumenza по обработке счетов. Тебе дают текст, "
    "извлечённый из скана или PDF счёта пользователя, на русском языке. "
    "Извлекаешь из него поставщика, сумму, срок оплаты и позиции счёта. "
    "Если какое-то поле невозможно определить — указываешь «не указано»."
)

WORKFLOW_STEPS = [
    {
        "key": "extract",
        "label": "Извлекаем данные счёта",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговые данные",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "vendor": {"type": "string"},
        "amount": {"type": "string"},
        "due_date": {"type": "string"},
        "line_items": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["vendor", "amount", "due_date", "line_items"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="invoice-data-extractor",
        defaults={
            "name": "Извлечение данных из счёта",
            "description": (
                "Загрузите скан или PDF счёта — получите поставщика, "
                "сумму, срок оплаты и позиции счёта."
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
    Agent.objects.filter(slug="invoice-data-extractor").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0022_seed_research_report"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
