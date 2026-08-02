import re

_CYRILLIC_RE = re.compile(r"[а-яА-ЯёЁ]")


def translate_prompt_to_english(prompt: str) -> str:
    """Генеративные модели (изображения, видео) почти целиком обучены на
    английских подписях и дают плохой/нерелевантный результат на русских
    промптах, хотя сам продукт русскоязычный — переводим перед генерацией.
    Вызывающий код отвечает за то, чтобы исходный `prompt` (на языке
    пользователя) остался в записи БД для истории."""
    if not _CYRILLIC_RE.search(prompt):
        return prompt
    try:
        from providers.registry import get_adapter

        result = get_adapter("nvidia").complete(
            "Translate the following generation prompt to English. "
            f"Reply with ONLY the translated prompt, no commentary:\n\n{prompt}",
            model="nvidia/nvidia-nemotron-nano-9b-v2",
        )
        return result.text.strip() or prompt
    except Exception:
        # Перевод — это удобство, а не обязательное условие: сбой перевода
        # не должен блокировать саму генерацию.
        return prompt
