from django.db import migrations

INPUT_SCHEMA = {
    "fields": [
        {
            "key": "budget_description",
            "label": "Описание бюджета/расходов по категориям",
            "type": "text",
            "required": True,
            "max_length": 1000,
        },
    ]
}

SYSTEM_INSTRUCTIONS = (
    "Ты — финансовый помощник Lumenza, который строит таблицы Excel. "
    "Работаешь в 3 шага.\n\n"
    "Шаг «Собираем структуру таблицы»: по описанию бюджета/расходов, "
    "которое указал пользователь, верни ТОЛЬКО валидный JSON (без "
    "markdown-обрамления, без пояснений) в точности такой формы: "
    '{"sheet_title":str,"headers":[str],"rows":[[str]],'
    '"chart_title":str|null}. Первый заголовок — название категории, '
    "остальные — числовые колонки (суммы как строки чисел, например "
    '"1500"). Заполни chart_title только если есть хотя бы одна '
    "числовая колонка для графика — иначе используй null.\n\n"
    "Финальный шаг: напиши короткое резюме по таблице на русском языке."
)

WORKFLOW_STEPS = [
    {
        "key": "draft_structure",
        "label": "Собираем структуру таблицы",
        "task": "longform",
    },
    {
        "key": "generate_excel",
        "label": "Генерируем таблицу",
        "task": "excel_generation",
    },
    {
        "key": "assemble",
        "label": "Пишем резюме",
        "task": "content_plan",
    },
]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "sheet_title": {"type": "string"},
        # Переопределяется на бэкенде реальным URL сгенерированного .xlsx
        # (agents.tasks._run_agent_steps) — модель не может знать
        # настоящий адрес файла.
        "excel_url": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["sheet_title", "excel_url", "summary"],
}


def seed_agent(apps, schema_editor):
    Agent = apps.get_model("agents", "Agent")
    Agent.objects.update_or_create(
        slug="budget-tracker-builder",
        defaults={
            "name": "Конструктор бюджет-таблиц",
            "description": (
                "Превращает описание расходов в готовую таблицу Excel "
                "с графиком."
            ),
            "category": "finance",
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
    Agent.objects.filter(slug="budget-tracker-builder").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0042_seed_pitch_deck_builder"),
    ]

    operations = [
        migrations.RunPython(seed_agent, unseed_agent),
    ]
