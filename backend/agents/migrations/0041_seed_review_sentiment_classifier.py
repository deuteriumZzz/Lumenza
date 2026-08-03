from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "reviews_text",
            "label": "Отзывы клиентов (по одному на строку)",
            "type": "text",
            "required": True,
            "max_length": 4000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — аналитик обратной связи Lumenza. По списку отзывов клиентов, "
    "которые прислал пользователь (каждый отзыв — отдельная строка), "
    "классифицируешь КАЖДЫЙ отзыв по отдельности: тональность "
    "(позитивная/нейтральная/негативная) и срочность реакции "
    "(низкая/средняя/высокая) с кратким пояснением причины. В конце "
    "даёшь общий вывод по всей выборке отзывов."
)

WORKFLOW_STEPS = [
    {
        "key": "assemble",
        "label": "Классифицируем отзывы",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "classified_reviews": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "review_snippet": {"type": "string"},
                    "sentiment": {"type": "string"},
                    "urgency": {"type": "string"},
                    "reason": {"type": "string"},
                },
            },
        },
        "overall_summary": {"type": "string"},
    },
    "required": ["classified_reviews", "overall_summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="review-sentiment-classifier",
        defaults={
            "name": "Классификатор тональности отзывов",
            "description": (
                "Разбирает список отзывов по одному: тональность, "
                "срочность реакции и общий вывод по выборке."
            ),
            "category": "research",
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
    Agent.objects.filter(slug="review-sentiment-classifier").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0040_seed_travel_itinerary_planner"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
