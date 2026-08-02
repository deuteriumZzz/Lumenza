from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "topic",
            "label": "Тема",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "audience",
            "label": "Аудитория",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "platforms",
            "label": "Платформы (через запятую)",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — контент-стратег Lumenza. Составляешь недельный контент-план на "
    "русском языке по теме, аудитории и списку платформ, которые указал "
    "пользователь: по одному посту в день на 7 дней, с хэштегами под "
    "каждый пост. Ты никогда не публикуешь и не утверждаешь, что "
    "опубликовал что-либо — публикация вне твоей ответственности; ты "
    "выдаёшь только план."
)

WORKFLOW_STEPS = [
    {
        "key": "outline",
        "label": "Продумываем план на неделю",
        "task": "content_plan",
    },
    {
        "key": "hashtags",
        "label": "Подбираем хэштеги под каждый день",
        "task": "hashtags",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый план",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "day_label": {"type": "string"},
                    "platform": {"type": "string"},
                    "post_text": {"type": "string"},
                    "hashtags": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
    },
    "required": ["days"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="weekly-content-plan",
        defaults={
            "name": "Недельный контент-план",
            "description": (
                "Собирает тему, аудиторию и платформы — выдаёт полный "
                "недельный контент-план: пост на каждый день с хэштегами."
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
    Agent.objects.filter(slug="weekly-content-plan").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0011_seed_content_optimizer"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
