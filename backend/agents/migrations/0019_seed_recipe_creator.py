from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "theme_or_ingredients",
            "label": "Тема или ингредиенты",
            "type": "text",
            "required": True,
            "max_length": 300,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — кулинарный автор Lumenza. По теме или списку ингредиентов, "
    "которые указал пользователь, придумываешь рецепт на русском языке: "
    "название, список ингредиентов, пошаговые инструкции и короткий "
    "вводный текст для публикации."
)

WORKFLOW_STEPS = [
    {
        "key": "outline",
        "label": "Продумываем рецепт",
        "task": "content_plan",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый рецепт",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "ingredients": {
            "type": "array",
            "items": {"type": "string"},
        },
        "steps": {
            "type": "array",
            "items": {"type": "string"},
        },
        "intro_text": {"type": "string"},
    },
    "required": ["title", "ingredients", "steps", "intro_text"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="recipe-creator",
        defaults={
            "name": "Генератор рецептов",
            "description": (
                "Собирает тему или ингредиенты — выдаёт рецепт с "
                "инструкциями и вводным текстом для публикации."
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
    Agent.objects.filter(slug="recipe-creator").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0018_seed_offer_letter_drafter"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
