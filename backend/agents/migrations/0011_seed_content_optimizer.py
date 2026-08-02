from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "post_text",
            "label": "Текст поста",
            "type": "text",
            "required": True,
            "max_length": 4000,
        },
        {
            "key": "platform",
            "label": "Платформа",
            "type": "select",
            "required": True,
            "options": ["Threads", "Instagram", "X", "LinkedIn"],
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — редактор контента Lumenza. Тебе дают черновик поста и целевую "
    "платформу. Ты переупаковываешь его в несколько вариантов под формат "
    "платформы, предлагаешь альтернативные хуки-открывашки и даёшь краткую "
    "предметную обратную связь по качеству — что усилить, что убрать. "
    "Всегда на русском языке, без воды."
)

WORKFLOW_STEPS = [
    {
        "key": "repurpose",
        "label": "Переупаковываем под платформу",
        "task": "repurpose",
    },
    {
        "key": "hooks",
        "label": "Пишем альтернативные хуки",
        "task": "hook",
    },
    {
        "key": "assemble",
        "label": "Собираем варианты и обратную связь",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "variants": {
            "type": "array",
            "items": {"type": "string"},
        },
        "hooks": {
            "type": "array",
            "items": {"type": "string"},
        },
        "feedback": {"type": "string"},
    },
    "required": ["variants", "hooks", "feedback"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="content-optimizer",
        defaults={
            "name": "Оптимизатор поста",
            "description": (
                "Берёт черновик поста и платформу — выдаёт переупакованные "
                "варианты, альтернативные хуки и обратную связь по "
                "качеству."
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
    Agent.objects.filter(slug="content-optimizer").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0010_seed_finance_digest"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
