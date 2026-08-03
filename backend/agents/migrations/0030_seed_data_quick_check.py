from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "question",
            "label": "Вопрос",
            "type": "text",
            "required": True,
            "max_length": 300,
        },
        {
            "key": "data",
            "label": "Данные",
            "type": "text",
            "required": True,
            "max_length": 4000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — аналитик-программист Lumenza. По вопросу и данным, которые "
    "указал пользователь, пишешь короткий самодостаточный Python-скрипт, "
    "который вычисляет ответ и печатает его через print(). Скрипт "
    "запускается в изолированной песочнице без доступа к сети и внешним "
    "пакетам — используй только стандартную библиотеку Python. Не давай "
    "пояснений, верни только код."
)

WORKFLOW_STEPS = [
    {
        "key": "write_code",
        "label": "Пишем скрипт для ответа на вопрос",
        "task": "longform",
    },
    {
        "key": "run_code",
        "label": "Выполняем скрипт",
        "task": "code_execution",
    },
    {
        "key": "assemble",
        "label": "Объясняем результат",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "question": {"type": "string"},
        # Переопределяется на бэкенде реальным stdout шага выполнения кода
        # (agents.tasks._run_agent_steps) — модели нельзя доверять точную
        # передачу вывода программы.
        "code_stdout": {"type": "string"},
        "explanation": {"type": "string"},
    },
    "required": ["question", "code_stdout", "explanation"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="data-quick-check",
        defaults={
            "name": "Быстрая проверка данных",
            "description": (
                "Пишет и запускает короткий Python-скрипт, чтобы ответить "
                "на ваш вопрос по данным, и объясняет результат простыми "
                "словами."
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
    Agent.objects.filter(slug="data-quick-check").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0029_seed_investment_research"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
