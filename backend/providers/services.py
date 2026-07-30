import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Optional

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    grant_credits,
    usd_to_credits,
)
from core.constants import ERROR_MESSAGE_MAX_LEN
from core.moderation import ModerationBlocked, check_prompt
from progression.services import check_and_unlock
from providers.access import can_use_model
from providers.models import RequestLog
from providers.pricing import estimate_max_cost_usd
from providers.registry import get_adapter
from referrals.services import check_referral_reward

# Каждая категория задач маршрутизируется на основной вариант (provider,
# model) и упорядоченный список запасных, которые пробуются по очереди,
# если основной (или более ранний запасной) выбрасывает исключение.
# Категории — по типу контента, а не по скорости/цене — подбираются
# вручную под каждую категорию (см. стратегию curation-gate в SPEC.md),
# а не через плоский переключатель fast/smart/cheap. Новые провайдеры
# (например, NVIDIA NIM) добавляются в список категории только после
# проверки именно на этой задаче.
TASK_ROUTES = {
    # nvidia-nemotron-nano-9b-v2 (маленькая/быстрая модель NVIDIA)
    # протестирован вживую на доступность; добавлен третьим запасным
    # вариантом под потребность hook в быстром отклике.
    "hook": [
        ("anthropic", "claude-3-5-sonnet-latest"),
        ("openai", "gpt-4o-mini"),
        ("nvidia", "nvidia/nvidia-nemotron-nano-9b-v2"),
        ("nvidia", "deepseek-ai/deepseek-v4-flash"),
        ("nvidia", "openai/gpt-oss-120b"),
        # Из подтверждённо рабочего резервного пула (партия ~45
        # моделей), переведена из резерва в активный запасной слот по
        # явному указанию пользователя «подключить резервный пул».
        ("nvidia", "bytedance/seed-oss-36b-instruct"),
    ],
    # llama-3.3-nemotron-super-49b-v1.5 (49B reasoning-модель NVIDIA)
    # протестирована вживую на доступность; добавлена третьим запасным
    # вариантом под потребность longform в связности на длинном тексте.
    "longform": [
        ("anthropic", "claude-3-5-sonnet-latest"),
        ("openai", "gpt-4o-mini"),
        ("nvidia", "nvidia/llama-3.3-nemotron-super-49b-v1.5"),
        ("nvidia", "minimaxai/minimax-m3"),
        ("nvidia", "abacusai/dracarys-llama-3.1-70b-instruct"),
        ("nvidia", "meta/llama-3.1-70b-instruct"),
        # Продвижение из резервного пула — у обеих в названии
        # "reasoning"/"super", разумно подходит longform по признаку
        # связности на длинном тексте.
        ("nvidia", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"),
        ("nvidia", "nvidia/nemotron-3-super-120b-a12b"),
    ],
    # NVIDIA-модели meta/llama-3.2-3b-instruct +
    # nemotron-mini-4b-instruct добавлены после проверки
    # доступности/связности вживую — не основные, так как строгого
    # сравнения качества с gemini/openai бок о бок ещё не проводилось.
    # Цена — временное значение-заглушка (см. providers/pricing.py) до
    # подтверждения по реальному счёту NVIDIA.
    "hashtags": [
        ("google", "gemini-1.5-flash"),
        ("openai", "gpt-4o-mini"),
        ("nvidia", "meta/llama-3.2-3b-instruct"),
        ("nvidia", "nvidia/nemotron-mini-4b-instruct"),
        ("nvidia", "stepfun-ai/step-3.7-flash"),
        ("nvidia", "nvidia/nemotron-3-nano-30b-a3b"),
        # Продвижение из резервного пула — обе с "быстрый/маленький" в
        # названии, подходят под профиль hashtags: дёшево и быстро.
        ("nvidia", "google/gemma-3n-e2b-it"),
        ("nvidia", "stepfun-ai/step-3.5-flash"),
    ],
    # qwen3.5-122b-a10b + llama-3.3-nemotron-super-49b-v1 (тот же класс
    # reasoning-моделей, что и v1.5 для longform) — обе протестированы
    # вживую на доступность; добавлены как запасные до реального
    # сравнения качества с Claude.
    "content_plan": [
        ("anthropic", "claude-3-5-sonnet-latest"),
        ("google", "gemini-1.5-flash"),
        ("nvidia", "qwen/qwen3.5-122b-a10b"),
        ("nvidia", "nvidia/llama-3.3-nemotron-super-49b-v1"),
        ("nvidia", "upstage/solar-10.7b-instruct"),
        ("nvidia", "nvidia/nemotron-3-ultra-550b-a55b"),
        # Продвижение из резервного пула — 119B параметров, несмотря на
        # маркетинговое "small" в названии, разумная мощность для
        # структурирования/рассуждений при планировании контента.
        ("nvidia", "mistralai/mistral-small-4-119b-2603"),
    ],
    # llama-3.1-8b-instruct + gemma-2-2b-it (маленькие/быстрые модели)
    # протестированы вживую на доступность; подходят под задачу
    # адаптации формата в repurpose, добавлены как запасные.
    "repurpose": [
        ("openai", "gpt-4o-mini"),
        ("anthropic", "claude-3-5-sonnet-latest"),
        ("nvidia", "meta/llama-3.1-8b-instruct"),
        ("nvidia", "google/gemma-2-2b-it"),
        ("nvidia", "minimaxai/minimax-m2.7"),
        ("nvidia", "mistralai/mistral-nemotron"),
        # Продвижение из резервного пула — обе с "быстрый/маленький" в
        # названии, соответствуют дешёвому профилю адаптации формата в
        # repurpose.
        ("nvidia", "google/gemma-3n-e4b-it"),
        ("nvidia", "poolside/laguna-xs-2.1"),
    ],
    # nvidia/riva-translate-4b-instruct (специализированная модель
    # NVIDIA для перевода) была очевидным подобранным вариантом, но
    # отдаёт 404 для этого аккаунта/ключа, хотя и числится в общем
    # каталоге /v1/models — не каждая модель из каталога доступна для
    # каждого аккаунта. Вместо неё успешно протестирован вживую
    # qwen3-next-80b-a3b-instruct, добавлен третьим запасным (сильная
    # репутация в многоязычности, но пока не сравнивался напрямую по
    # качеству с Gemini/Claude именно на переводе).
    "translation": [
        ("google", "gemini-1.5-flash"),
        ("anthropic", "claude-3-5-sonnet-latest"),
        ("nvidia", "qwen/qwen3-next-80b-a3b-instruct"),
        ("nvidia", "sarvamai/sarvam-m"),
        # riva-translate-4b-instruct-v1.1 — это собственная
        # специализированная модель NVIDIA для перевода, та самая v1,
        # что раньше отдавала 404 — эта более новая версия успешно
        # проходит проверку вживую. Сильный кандидат в основные варианты
        # после сравнения качества с Gemini/Claude на реальных задачах
        # перевода; пока оставлена запасным вариантом, так как это
        # сравнение ещё не проводилось.
        ("nvidia", "nvidia/riva-translate-4b-instruct-v1.1"),
        # Оставшиеся модели из резервного пула, размещены здесь за
        # неимением более сильного сигнала по названию для конкретной
        # категории.
        ("nvidia", "thinkingmachines/inkling"),
        ("nvidia", "openai/gpt-oss-20b"),
    ],
    # Единственный реальный поисковый провайдер сейчас — без запасных
    # вариантов, в отличие от остальных категорий
    # (см. providers/search_adapter.py).
    "search": [("search", "gpt-4o-mini")],
}

# У каждого вызова адаптера уже есть свой собственный таймаут на вызов
# (см. providers/base.py, request_timeout_seconds, по умолчанию 15с), но
# цикл перебора запасных вариантов ниже может пройти по всем маршрутам
# для задачи (до ~8 кандидатов в маршрутах с резервным пулом) — без
# общего ограничения запрос, где каждый кандидат уходит в таймаут, мог
# бы держать поток запроса несколько минут. Это ограничивает суммарное
# время по всем попыткам перебора вместе; та попытка, что уже
# выполняется в момент превышения бюджета, всё равно может завершиться
# (у неё уже есть свой собственный лимит), но новая попытка после этого
# не начинается.
FALLBACK_BUDGET_SECONDS = 45.0


@dataclass
class ChatOutcome:
    status: Literal[
        "ok",
        "insufficient_credits",
        "provider_error",
        "blocked",
        "invalid_model",
        "model_requires_pro",
    ]
    text: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    task: Optional[str] = None
    mocked: bool = False
    used_fallback: bool = False
    credits_charged: Optional[Decimal] = None
    balance: Optional[Decimal] = None


def _route_hold_credits(routes, prompt):
    # Резерв кредитов, рассчитанный только на основной маршрут, мог бы
    # не хватить, если в итоге сработает более дорогой запасной вариант
    # — поэтому размер считается по самому дорогому кандидату во всём
    # маршруте.
    max_cost_usd = max(
        estimate_max_cost_usd(
            model,
            len(prompt),
            get_adapter(provider_name).max_completion_tokens,
        )
        for provider_name, model in routes
    )
    return usd_to_credits(max_cost_usd)


def run_chat(
    user,
    prompt: str,
    task: Optional[str] = None,
    model: Optional[str] = None,
    system: Optional[str] = None,
    temperature: Optional[float] = None,
) -> ChatOutcome:
    """Общая функция для /api/chat/ и для Telegram-бота — это единственные
    два вызывающих слоя провайдеров, поэтому логика резервирования/сверки
    кредитов существует ровно в одном месте.

    task=None (веб-чат больше не заставляет выбирать тему вручную —
    Telegram-бот и явный override через UI по-прежнему передают строку
    напрямую) запускает лёгкую классификацию по смыслу промпта вместо
    отсутствующего выбора пользователя. Base-план получает все категории,
    но маршрутизация использует только доступные ему standard-модели.
    Явный premium-выбор требует Pro."""
    if not task:
        from providers.intent import classify_task

        task = classify_task(prompt, tuple(TASK_ROUTES.keys()))

    routes = TASK_ROUTES[task]

    available_routes = frozenset(
        route for route in routes if can_use_model(user, *route)
    )
    if model is not None:
        chosen = next((route for route in routes if route[1] == model), None)
        if chosen is None:
            return ChatOutcome(status="invalid_model", task=task)
        if chosen not in available_routes:
            RequestLog.objects.create(
                user=user,
                provider=chosen[0],
                model=model,
                task=task,
                status=RequestLog.Status.MODEL_LOCKED,
            )
            return ChatOutcome(status="model_requires_pro", task=task)

    routes = [route for route in routes if route in available_routes]
    if model is not None:
        routes = [chosen] + [route for route in routes if route != chosen]

    # Проверяется до того, как вообще затронуты кредиты, и до вызова
    # любого провайдера — заблокированный промпт никогда не стоит
    # пользователю цикла резерв/возврат и никогда не стоит нам платного
    # вызова провайдера.
    try:
        check_prompt(prompt)
    except ModerationBlocked as exc:
        from core.services import flag_repeated_moderation_blocks

        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            task=task,
            status=RequestLog.Status.BLOCKED,
            error_message=str(exc)[:ERROR_MESSAGE_MAX_LEN],
        )
        flag_repeated_moderation_blocks(user)
        return ChatOutcome(status="blocked", task=task)

    get_or_create_account(user)
    hold_credits = _route_hold_credits(routes, prompt)

    try:
        account = charge_credits(
            user, hold_credits, reason=LedgerEntry.Reason.CHAT_REQUEST
        )
    except InsufficientCreditsError:
        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            task=task,
            status=RequestLog.Status.INSUFFICIENT_CREDITS,
        )
        return ChatOutcome(status="insufficient_credits", task=task)

    result = None
    provider_name = matched_model = None
    errors = []
    fallback_started_at = time.monotonic()
    for attempt_index, (provider_name, matched_model) in enumerate(routes):
        if (
            attempt_index > 0
            and time.monotonic() - fallback_started_at
            > FALLBACK_BUDGET_SECONDS
        ):
            remaining = len(routes) - attempt_index
            errors.append(
                f"fallback budget of {FALLBACK_BUDGET_SECONDS}s "
                f"exceeded, {remaining} route(s) not attempted"
            )
            break
        adapter = get_adapter(provider_name)
        try:
            result = adapter.complete(
                prompt,
                model=matched_model,
                system=system,
                temperature=temperature,
            )
            break
        except Exception as exc:
            errors.append(f"{provider_name}/{matched_model}: {exc}")

    error_message = " | ".join(errors)[:ERROR_MESSAGE_MAX_LEN]

    if result is None:
        grant_credits(user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        # Ошибка приписывается основному варианту маршрута (а не тому
        # кандидату, что оказался последним), чтобы отчёты о надёжности
        # провайдеров группировались по «какой маршрут не сработал», а
        # не по «какой запасной вариант тоже не сработал» —
        # error_message всё равно содержит детали каждой попытки.
        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            task=task,
            status=RequestLog.Status.ERROR,
            error_message=error_message,
            used_fallback=attempt_index > 0,
        )
        return ChatOutcome(status="provider_error", task=task)

    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        account = grant_credits(user, refund, reason=LedgerEntry.Reason.REFUND)

    used_fallback = attempt_index > 0
    RequestLog.objects.create(
        user=user,
        provider=provider_name,
        model=matched_model,
        task=task,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        cost_usd=Decimal(str(result.cost_usd)),
        credits_charged=actual_credits,
        latency_ms=result.latency_ms,
        status=RequestLog.Status.OK,
        mocked=result.mocked,
        used_fallback=used_fallback,
        error_message=error_message,
    )
    check_and_unlock(user)
    check_referral_reward(user)

    return ChatOutcome(
        status="ok",
        text=result.text,
        provider=provider_name,
        model=matched_model,
        task=task,
        mocked=result.mocked,
        used_fallback=used_fallback,
        credits_charged=actual_credits,
        balance=account.balance,
    )
