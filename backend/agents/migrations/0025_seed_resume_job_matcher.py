from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "resume_text",
            "label": "Текст резюме",
            "type": "document_upload",
            "required": True,
            "max_length": 20000,
        },
        {
            "key": "job_description",
            "label": "Описание вакансии (необязательно)",
            "type": "text",
            "required": False,
            "max_length": 3000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — карьерный консультант Lumenza. Тебе дают текст резюме, "
    "извлечённый из документа пользователя, на русском языке. Если "
    "описание вакансии не указано — даёшь общий анализ сильных сторон и "
    "возможных пробелов резюме. Если описание вакансии указано — "
    "дополнительно оцениваешь соответствие резюме этой вакансии."
)

WORKFLOW_STEPS = [
    {
        "key": "analyze",
        "label": "Анализируем резюме",
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
        "strengths": {
            "type": "array",
            "items": {"type": "string"},
        },
        "gaps": {
            "type": "array",
            "items": {"type": "string"},
        },
        "tailored_summary": {"type": "string"},
    },
    "required": ["strengths", "gaps", "tailored_summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="resume-job-matcher",
        defaults={
            "name": "Анализ резюме",
            "description": (
                "Загрузите резюме и, при желании, описание вакансии — "
                "получите сильные стороны, пробелы и адаптированное "
                "резюме."
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
    Agent.objects.filter(slug="resume-job-matcher").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0024_seed_rfp_response_drafter"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
