from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "document_text",
            "label": "Текст документа",
            # Frontend-only hint: renders a file-upload control that runs the
            # document through OCR (POST /api/documents/) first and fills
            # this field with the extracted text — the backend still just
            # sees a plain required string, same as any other text field.
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
        {
            "key": "question",
            "label": "Что уточнить в документе (необязательно)",
            "type": "text",
            "required": False,
            "max_length": 300,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — ассистент Lumenza по работе с документами. Тебе дают текст, "
    "извлечённый из скана, скриншота или PDF пользователя, на русском "
    "языке. Составляешь краткое, точное саммари содержимого. Если "
    "пользователь задал уточняющий вопрос — отвечаешь на него по "
    "содержимому документа; если вопроса нет — оставляешь ответ пустой "
    "строкой."
)

WORKFLOW_STEPS = [
    {
        "key": "summary",
        "label": "Составляем саммари документа",
        "task": "longform",
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
        "summary": {"type": "string"},
        "key_points": {
            "type": "array",
            "items": {"type": "string"},
        },
        "answer": {"type": "string"},
    },
    "required": ["summary", "key_points", "answer"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="document-summary",
        defaults={
            "name": "Саммари документа",
            "description": (
                "Загрузите скан, скриншот или PDF — получите краткое "
                "саммари и ответ на уточняющий вопрос по содержимому."
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
    Agent.objects.filter(slug="document-summary").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0004_seed_research_digest"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
