from core.pricing import lookup_price

# USD за 1M токенов. Обновлять при изменении цен провайдеров.
PRICING = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "claude-3-5-sonnet-latest": {"input": 3.00, "output": 15.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    # Тарификация NVIDIA NIM основана на кредитах, а не на
    # опубликованной ставке $/токен на момент интеграции
    # (build.nvidia.com не раскрывает статичные цены) — это временное
    # значение повторяет gemini-1.5-flash (сравнимый класс маленькой
    # модели) до подтверждения по реальному счёту/дашборду NVIDIA. TODO:
    # сверить с реальным счётом NVIDIA, прежде чем полагаться на это
    # значение для реальной тарификации в масштабе.
    "meta/llama-3.2-3b-instruct": {"input": 0.075, "output": 0.30},
    # TODO: сверить с реальным счётом NVIDIA (см. комментарий выше) — та
    # же оговорка про временные цены применима ко всем моделям NVIDIA
    # ниже.
    "meta/llama-3.1-8b-instruct": {"input": 0.075, "output": 0.30},
    "qwen/qwen3.5-122b-a10b": {"input": 0.20, "output": 0.80},
    "qwen/qwen3-next-80b-a3b-instruct": {"input": 0.15, "output": 0.60},
    "nvidia/nvidia-nemotron-nano-9b-v2": {"input": 0.075, "output": 0.30},
    "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
        "input": 0.15,
        "output": 0.60,
    },
    "nvidia/llama-3.3-nemotron-super-49b-v1": {"input": 0.15, "output": 0.60},
    "nvidia/nemotron-mini-4b-instruct": {"input": 0.05, "output": 0.20},
    "google/gemma-2-2b-it": {"input": 0.05, "output": 0.20},
    "deepseek-ai/deepseek-v4-flash": {"input": 0.10, "output": 0.40},
    "minimaxai/minimax-m2.7": {"input": 0.15, "output": 0.60},
    "minimaxai/minimax-m3": {"input": 0.20, "output": 0.80},
    "upstage/solar-10.7b-instruct": {"input": 0.10, "output": 0.40},
    "sarvamai/sarvam-m": {"input": 0.10, "output": 0.40},
    "stepfun-ai/step-3.7-flash": {"input": 0.075, "output": 0.30},
    "abacusai/dracarys-llama-3.1-70b-instruct": {
        "input": 0.20,
        "output": 0.80,
    },
    # Бывший «резервный пул» (партия ~45 моделей, успешно протестирована
    # вживую) — теперь подключён в TASK_ROUTES как
    # дополнительные запасные варианты по запросу пользователя. Остаются
    # кандидатами и для будущей функции явного выбора модели
    # пользователем (см. память), поскольку та фича про явный выбор, а
    # не только про порядок запасных вариантов.
    "bytedance/seed-oss-36b-instruct": {"input": 0.15, "output": 0.60},
    "google/gemma-3n-e2b-it": {"input": 0.05, "output": 0.20},
    "google/gemma-3n-e4b-it": {"input": 0.075, "output": 0.30},
    "mistralai/mistral-small-4-119b-2603": {"input": 0.15, "output": 0.60},
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
        "input": 0.15,
        "output": 0.60,
    },
    "nvidia/nemotron-3-super-120b-a12b": {"input": 0.20, "output": 0.80},
    "openai/gpt-oss-20b": {"input": 0.10, "output": 0.40},
    "poolside/laguna-xs-2.1": {"input": 0.075, "output": 0.30},
    "stepfun-ai/step-3.5-flash": {"input": 0.075, "output": 0.30},
    "thinkingmachines/inkling": {"input": 0.10, "output": 0.40},
    # Подключены в TASK_ROUTES ниже (по одной на категорию, подобраны
    # вручную):
    "meta/llama-3.1-70b-instruct": {"input": 0.20, "output": 0.80},
    "mistralai/mistral-nemotron": {"input": 0.10, "output": 0.40},
    "nvidia/nemotron-3-nano-30b-a3b": {"input": 0.05, "output": 0.20},
    "nvidia/nemotron-3-ultra-550b-a55b": {"input": 0.30, "output": 1.20},
    "nvidia/riva-translate-4b-instruct-v1.1": {"input": 0.075, "output": 0.30},
    "openai/gpt-oss-120b": {"input": 0.20, "output": 0.80},
}


def _price_for(model: str) -> dict:
    return lookup_price(PRICING, model, "chat")


def estimate_cost_usd(
    model: str, prompt_tokens: int, completion_tokens: int
) -> float:
    price = _price_for(model)
    return (prompt_tokens / 1_000_000) * price["input"] + (
        completion_tokens / 1_000_000
    ) * price["output"]


def estimate_max_cost_usd(
    model: str, prompt_chars: int, max_completion_tokens: int
) -> float:
    """Консервативная оценка стоимости запроса в худшем случае, до того как
    известно реальное число токенов.

    Предполагает 1 токен на символ промпта (реальные токенизаторы упаковывают
    больше символов в токен, поэтому это всегда переоценка сверху) и полный
    лимит токенов ответа для выходных токенов.
    """
    price = _price_for(model)
    return (prompt_chars / 1_000_000) * price["input"] + (
        max_completion_tokens / 1_000_000
    ) * price["output"]
