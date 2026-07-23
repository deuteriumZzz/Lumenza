from providers.registry import get_adapter

CLASSIFY_MODEL = "gpt-4o-mini"
# Самый общий по смыслу маршрут — безопасный fallback, если классификация
# не удалась или вернула что-то нераспознаваемое.
DEFAULT_TASK = "repurpose"


def classify_task(prompt: str, valid_tasks: tuple[str, ...]) -> str:
    """Лёгкий классифицирующий вызов вместо ручного выбора темы
    пользователем — определяет, к какой из существующих категорий
    (providers.services.TASK_ROUTES) относится промпт. Не биллится
    пользователю — это внутренние расходы на маршрутизацию, не продукт.
    Любой сбой (сеть, провайдер, неразборчивый ответ) тихо откатывается на
    DEFAULT_TASK, а не роняет вызывающий код — то же решение, что уже
    принято для модерации в core/moderation.py."""
    instruction = (
        "Определи, к какой из категорий относится запрос пользователя. "
        f"Ответь ровно одним словом из списка: {', '.join(valid_tasks)}. "
        "Ничего больше не пиши.\n\nЗапрос:\n" + prompt
    )
    try:
        result = get_adapter("openai").complete(instruction, model=CLASSIFY_MODEL)
        candidate = result.text.strip().lower()
        for task in valid_tasks:
            if task in candidate:
                return task
    except Exception:
        pass
    return DEFAULT_TASK
