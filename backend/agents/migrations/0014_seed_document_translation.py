from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "document_text",
            "label": "Текст документа",
            # Frontend-only hint: renders a file-upload control that runs the
            # document through OCR (POST /api/documents/) first and fills
            # this field with the extracted text — the backend still just
            # sees a plain required string, same as document-summary.
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
        {
            "key": "target_language",
            "label": "Целевой язык",
            "type": "select",
            "required": True,
            "options": ["English", "Русский", "Español", "Deutsch", "Français"],
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — переводчик Lumenza. Тебе дают текст, извлечённый из скана, "
    "скриншота или PDF пользователя, и целевой язык. Переводишь текст "
    "полностью и точно на целевой язык, сохраняя структуру и смысл, затем "
    "добавляешь короткое саммари содержимого на этом же целевом языке."
)

# Один шаг, а не 2-3 как у остальных агентов: второй ассемблирующий проход
# здесь означал бы, что модели нужно дословно воспроизвести весь переведённый
# документ (до тех же ~20000 символов) внутри JSON-строки — риск обрезания
# вывода и молчаливого "редактирования" перевода вместо копирования, плюс
# двойная стоимость за повторную обработку того же объёма текста. Ничего в
# agents.services не требует минимум 2 шагов — JSON-инструкция навешивается
# по step["key"] == "assemble", а не по task/позиции, так что шаг с
# task="translation" может сам быть тем самым assemble-шагом.
WORKFLOW_STEPS = [
    {
        "key": "assemble",
        "label": "Переводим документ",
        "task": "translation",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "translated_text": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["translated_text", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="document-translation",
        defaults={
            "name": "Перевод документа",
            "description": (
                "Загрузите скан, скриншот или PDF и выберите целевой язык "
                "— получите полный перевод и краткое саммари."
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
    Agent.objects.filter(slug="document-translation").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0013_seed_competitor_analysis"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
