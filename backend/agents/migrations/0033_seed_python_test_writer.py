from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "code",
            "label": "Python-функция или модуль для тестирования",
            "type": "text",
            "required": True,
            "max_length": 4000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — инженер по тестированию Lumenza. По Python-коду, который указал "
    "пользователь, пишешь ОДИН самодостаточный скрипт: сначала дословно "
    "воспроизводишь исходный код целиком, затем добавляешь набор "
    "юнит-тестов на модуле unittest из стандартной библиотеки (без pytest "
    "и сторонних пакетов — песочница без доступа к сети), затем запускаешь "
    "их через unittest.main(exit=False) или вручную и печатаешь через "
    "print() итог: сколько тестов прошло и сколько упало, с названием "
    "каждого теста. Верни только код, без пояснений и markdown-обрамления."
)

WORKFLOW_STEPS = [
    {
        "key": "write_tests",
        "label": "Пишем тесты",
        "task": "longform",
    },
    {
        "key": "run_tests",
        "label": "Запускаем тесты",
        "task": "code_execution",
    },
    {
        "key": "assemble",
        "label": "Собираем итоговый отчёт",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "test_code": {"type": "string"},
        # Переопределяется на бэкенде реальным stdout запуска тестов
        # (agents.tasks._run_agent_steps) — модели нельзя доверять точную
        # передачу pass/fail.
        "code_stdout": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["test_code", "code_stdout", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="python-test-writer",
        defaults={
            "name": "Генератор и запуск юнит-тестов",
            "description": (
                "Вставьте Python-функцию — агент напишет юнит-тесты, "
                "реально запустит их и покажет настоящий результат "
                "pass/fail."
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
    Agent.objects.filter(slug="python-test-writer").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0032_seed_code_review_agent"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
