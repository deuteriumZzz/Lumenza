from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "topic",
            "label": "Тема презентации",
            "type": "text",
            "required": True,
            "max_length": 300,
        },
        {
            "key": "key_points",
            "label": "Ключевые тезисы и данные",
            "type": "text",
            "required": True,
            "max_length": 1000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — создатель презентаций Lumenza. Работаешь в 3 шага.\n\n"
    "Шаг «Собираем структуру презентации»: по теме и ключевым тезисам, "
    "которые указал пользователь, верни ТОЛЬКО валидный JSON (без "
    "markdown-обрамления, без пояснений) в точности такой формы: "
    '{"title":str,"slides":[{"heading":str,"bullets":[str],'
    '"chart":{"chart_title":str,"categories":[str],"values":[number]}'
    "|null}]}. Сделай 3-6 слайдов. Поле chart добавляй только если в "
    "тезисах пользователя реально есть числовые данные для графика — "
    "иначе используй null.\n\n"
    "Финальный шаг: напиши короткую сопроводительную заметку о "
    "презентации на русском языке."
)

WORKFLOW_STEPS = [
    {
        "key": "draft_structure",
        "label": "Собираем структуру презентации",
        "task": "longform",
    },
    {
        "key": "generate_pptx",
        "label": "Генерируем презентацию",
        "task": "pptx_generation",
    },
    {
        "key": "assemble",
        "label": "Пишем сопроводительную заметку",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        # Переопределяется на бэкенде реальным URL сгенерированного .pptx
        # (agents.tasks._run_agent_steps) — модель не может знать
        # настоящий адрес файла.
        "pptx_url": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["title", "pptx_url", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="pitch-deck-builder",
        defaults={
            "name": "Конструктор презентаций",
            "description": (
                "Превращает тему и тезисы в готовую презентацию "
                "PowerPoint с графиками."
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
    Agent.objects.filter(slug="pitch-deck-builder").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0041_seed_review_sentiment_classifier"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
