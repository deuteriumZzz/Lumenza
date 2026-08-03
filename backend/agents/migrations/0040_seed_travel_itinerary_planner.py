from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "destination",
            "label": "Направление поездки",
            "type": "text",
            "required": True,
            "max_length": 200,
        },
        {
            "key": "trip_details",
            "label": "Длительность, бюджет и интересы",
            "type": "text",
            "required": True,
            "max_length": 500,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — тревел-планировщик Lumenza. По направлению поездки и деталям "
    "(длительность, бюджет, интересы), которые указал пользователь, "
    "составляешь практичный маршрут по дням: главные достопримечательности, "
    "советы по транспорту и питанию, с учётом указанного бюджета. Не "
    "выдумываешь актуальные цены, расписания или бронирования как факт — "
    "даёшь общие ориентиры и советы проверить актуальность перед поездкой."
)

WORKFLOW_STEPS = [
    {
        "key": "research_destination",
        "label": "Изучаем направление",
        "task": "longform",
    },
    {
        "key": "assemble",
        "label": "Собираем маршрут по дням",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "destination": {"type": "string"},
        "itinerary": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "day_label": {"type": "string"},
                    "activities": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "budget_note": {"type": "string"},
    },
    "required": ["destination", "itinerary", "budget_note"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="travel-itinerary-planner",
        defaults={
            "name": "Тревел-планировщик",
            "description": (
                "Превращает направление и пожелания по поездке в готовый "
                "маршрут по дням с советами по бюджету."
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
    Agent.objects.filter(slug="travel-itinerary-planner").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0039_seed_audio_ad_creator"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
