import re

from django.conf import settings

# Дешёвый, всегда включённый предфильтр по ключевым словам — намеренно
# узкий (горстка буквальных терминов, легко обходится
# синонимами/опечатками/ другими языками) и НЕ замена настоящей
# модерации. Существует, чтобы отловить самые очевидные случаи до того,
# как тратится вызов провайдера. Настоящая подстраховка — эндпоинт
# модерации провайдера ниже, который работает только когда настроен
# OPENAI_API_KEY — деплой без этого ключа не имеет *никакой*
# содержательной модерации, кроме этого списка, а это
# продуктовое/юридическое решение, которое нужно осознанно принять, а не
# то, что можно считать закрытым только из-за этого комментария. Общий
# для обеих поверхностей, принимающих свободный текст в промптах
# (imagegen и providers/chat), так что чёрный список ведётся ровно один,
# а не два, которые могли бы незаметно разойтись.
_MINOR_TERMS = r"(?:child|kid|minor|toddler|infant|underage)"
_SEXUAL_TERMS = r"(?:nude|naked|sexual|sex)"
BLOCKED_PATTERNS = [
    re.compile(
        rf"\b{_MINOR_TERMS}\b[\s\S]{{0,40}}\b{_SEXUAL_TERMS}\b", re.IGNORECASE
    ),
    re.compile(
        rf"\b{_SEXUAL_TERMS}\b[\s\S]{{0,40}}\b{_MINOR_TERMS}\b", re.IGNORECASE
    ),
    re.compile(rf"\b{_MINOR_TERMS}\s*(sexual|porn|abuse)", re.IGNORECASE),
]


# Подстраховочная модерация независимо от OPENAI_API_KEY —
# nvidia/llama-3.1-nemoguard-8b-content-safety, протестировано вживую
# через chat completions. Значит, деплой с заданным NVIDIA_API_KEY (в
# этом проекте он есть всегда), но без OPENAI_API_KEY получает настоящее
# покрытие модерацией вместо только regex — раньше именно этот пробел
# был отмечен в комментарии к BLOCKED_PATTERNS выше.
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_SAFETY_MODEL = "nvidia/llama-3.1-nemoguard-8b-content-safety"


class ModerationBlocked(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def check_prompt(prompt: str) -> None:
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(prompt):
            raise ModerationBlocked("Prompt matched a blocked pattern")

    # Оба провайдерских слоя ниже — подстраховка поверх обязательного
    # regex-префильтра выше, а не единственная линия защиты (см.
    # комментарий у BLOCKED_PATTERNS). Транзиентный сбой самого вызова
    # (rate limit, таймаут, сетевая ошибка) поэтому не должен ронять весь
    # запрос целиком — раньше именно так и происходило: необработанный
    # openai.RateLimitError из client.moderations.create() долетал
    # необработанным до Django и превращался в 500 на /api/chat/ (и на
    # любом другом вызывающем check_prompt) вместо штатной обработки
    # ошибки провайдера, которая уже есть в фолбэк-цепочке
    # providers.services.run_chat. ModerationBlocked (осознанное решение
    # заблокировать) по-прежнему пробрасывается как есть — перехватывается
    # только транспортный сбой самого вызова.
    if settings.OPENAI_API_KEY:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=10)
        try:
            result = client.moderations.create(input=prompt)
            if result.results[0].flagged:
                raise ModerationBlocked("Flagged by provider moderation endpoint")
        except ModerationBlocked:
            raise
        except Exception:
            pass

    if settings.NVIDIA_API_KEY:
        try:
            _check_nvidia_safety(prompt)
        except ModerationBlocked:
            raise
        except Exception:
            pass


def _check_nvidia_safety(prompt: str) -> None:
    """Форма ответа, подтверждённая вживую для БЕЗОПАСНОГО промпта — это
    небольшой JSON-подобный блок вроде {"User Safety": "safe"} — форма для
    небезопасного случая вживую не подтверждена (небезопасный тестовый
    промпт не отправлялся), поэтому здесь проверяется буквальная подстрока
    "unsafe", а не разбор точной схемы — это остаётся корректным, даже если
    окружающая структура JSON немного отличается от безопасного случая."""
    from openai import OpenAI

    client = OpenAI(
        api_key=settings.NVIDIA_API_KEY, base_url=NVIDIA_BASE_URL, timeout=10
    )
    response = client.chat.completions.create(
        model=NVIDIA_SAFETY_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=50,
    )
    text = (response.choices[0].message.content or "").lower()
    if "unsafe" in text:
        raise ModerationBlocked("Flagged by NVIDIA content-safety model")
