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

# Число чанков knowledge.Workspace, подмешиваемых в system при RAG-вложении
# — то же значение, что и дефолт knowledge.services.search().
RAG_TOP_K = 5

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
        "invalid_workspace",
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


@dataclass
class _PreparedChatRequest:
    task: str
    routes: list
    system: Optional[str]


def _prepare_chat_request(
    user,
    prompt: str,
    task: Optional[str],
    model: Optional[str],
    system: Optional[str],
    workspace_id: Optional[int],
):
    """Routing/RAG/moderation only — no credits touched, no provider ever
    called. Shared by run_chat() and start_chat_stream() so both reject the
    same way for the same reasons. Returns a ChatOutcome for any rejection
    (blocked/invalid_model/model_requires_pro/invalid_workspace), or a
    _PreparedChatRequest ready for a credit hold + provider attempt.

    workspace_id — необязательное вложение knowledge.Workspace (RAG):
    найденные чанки подмешиваются в system одним блоком до входа в цикл
    провайдеров, чтобы не пересчитывать поиск на каждой fallback-попытке.
    Поиск не тарифицируется — тот же принцип, что у classify_task ниже."""
    if workspace_id is not None:
        from knowledge.services import format_matches_for_prompt
        from knowledge.services import search as search_workspace

        matches = search_workspace(user, workspace_id, prompt, top_k=RAG_TOP_K)
        if matches is None:
            return ChatOutcome(status="invalid_workspace", task=task)
        if matches:
            context_block = format_matches_for_prompt(matches)
            system = f"{context_block}\n\n{system}" if system else context_block

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

    return _PreparedChatRequest(task=task, routes=routes, system=system)


def _hold_credits_or_reject(user, routes, prompt: str, task: str):
    get_or_create_account(user)
    hold_credits = _route_hold_credits(routes, prompt)
    try:
        charge_credits(user, hold_credits, reason=LedgerEntry.Reason.CHAT_REQUEST)
    except InsufficientCreditsError:
        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            task=task,
            status=RequestLog.Status.INSUFFICIENT_CREDITS,
        )
        return ChatOutcome(status="insufficient_credits", task=task)
    return hold_credits


def _finalize_provider_failure(
    user, task: str, routes, hold_credits: Decimal, error_message: str, used_fallback: bool
) -> None:
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
        used_fallback=used_fallback,
    )


def _finalize_provider_success(
    user,
    task: str,
    provider_name: str,
    matched_model: str,
    result,
    hold_credits: Decimal,
    used_fallback: bool,
    error_message: str,
):
    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        account = grant_credits(user, refund, reason=LedgerEntry.Reason.REFUND)
    else:
        account = get_or_create_account(user)

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

    return actual_credits, account


def run_chat(
    user,
    prompt: str,
    task: Optional[str] = None,
    model: Optional[str] = None,
    system: Optional[str] = None,
    temperature: Optional[float] = None,
    workspace_id: Optional[int] = None,
) -> ChatOutcome:
    """Общая функция для /api/chat/ и для Telegram-бота — это единственные
    два вызывающих слоя провайдеров, поэтому логика резервирования/сверки
    кредитов существует ровно в одном месте (см. также start_chat_stream()
    ниже для потокового варианта /api/threads/<id>/messages/stream/ —
    делит с этой функцией все четыре helper'а выше).

    task=None (веб-чат больше не заставляет выбирать тему вручную —
    Telegram-бот и явный override через UI по-прежнему передают строку
    напрямую) запускает лёгкую классификацию по смыслу промпта вместо
    отсутствующего выбора пользователя. Base-план получает все категории,
    но маршрутизация использует только доступные ему standard-модели.
    Явный premium-выбор требует Pro."""
    prepared = _prepare_chat_request(user, prompt, task, model, system, workspace_id)
    if isinstance(prepared, ChatOutcome):
        return prepared
    task, routes, system = prepared.task, prepared.routes, prepared.system

    hold_or_outcome = _hold_credits_or_reject(user, routes, prompt, task)
    if isinstance(hold_or_outcome, ChatOutcome):
        return hold_or_outcome
    hold_credits = hold_or_outcome

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
        _finalize_provider_failure(
            user, task, routes, hold_credits, error_message, attempt_index > 0
        )
        return ChatOutcome(status="provider_error", task=task)

    actual_credits, account = _finalize_provider_success(
        user,
        task,
        provider_name,
        matched_model,
        result,
        hold_credits,
        attempt_index > 0,
        error_message,
    )

    return ChatOutcome(
        status="ok",
        text=result.text,
        provider=provider_name,
        model=matched_model,
        task=task,
        mocked=result.mocked,
        used_fallback=attempt_index > 0,
        credits_charged=actual_credits,
        balance=account.balance,
    )


@dataclass
class StreamStartOutcome:
    status: Literal[
        "accepted",
        "insufficient_credits",
        "provider_error",
        "blocked",
        "invalid_model",
        "model_requires_pro",
        "invalid_workspace",
        "enqueue_failed",
    ]
    generation_id: Optional[str] = None
    task: Optional[str] = None
    rejection: Optional[ChatOutcome] = None


def start_chat_stream(
    user,
    prompt: str,
    task: Optional[str] = None,
    model: Optional[str] = None,
    system: Optional[str] = None,
    temperature: Optional[float] = None,
    workspace_id: Optional[int] = None,
    thread_id: Optional[int] = None,
) -> StreamStartOutcome:
    """Streaming counterpart to run_chat() for
    POST /api/threads/<id>/messages/stream/. Does the exact same
    synchronous pre-flight (routing/RAG/moderation/credit hold) so a
    rejection is returned immediately without the client ever opening an
    SSE connection — only on success does it create a generation buffer
    and hand the actual provider call off to a Celery task
    (providers.tasks.stream_chat_task), mirroring
    agents.services.start_agent_run's shape."""
    prepared = _prepare_chat_request(user, prompt, task, model, system, workspace_id)
    if isinstance(prepared, ChatOutcome):
        return StreamStartOutcome(
            status=prepared.status, task=prepared.task, rejection=prepared
        )
    task, routes, system = prepared.task, prepared.routes, prepared.system

    hold_or_outcome = _hold_credits_or_reject(user, routes, prompt, task)
    if isinstance(hold_or_outcome, ChatOutcome):
        return StreamStartOutcome(
            status=hold_or_outcome.status, task=task, rejection=hold_or_outcome
        )
    hold_credits = hold_or_outcome

    from providers.streaming import create_generation, mark_error

    generation_id = create_generation(user_id=user.id, thread_id=thread_id)

    # Set *before* enqueueing, not after: under CELERY_TASK_ALWAYS_EAGER
    # (tests, and any future eager-in-prod config) .delay() below runs the
    # whole task synchronously — including its own clear-on-completion of
    # this same field — so setting it afterwards would clobber that clear
    # with a stale value. Setting it first is correct in both the eager
    # and the normal async-worker case.
    if thread_id is not None:
        from providers.models import Thread

        Thread.objects.filter(id=thread_id).update(
            active_generation_id=generation_id
        )

    try:
        from providers.tasks import stream_chat_task

        stream_chat_task.delay(
            generation_id,
            user.id,
            prompt,
            task,
            system,
            temperature,
            routes,
            str(hold_credits),
            thread_id,
        )
    except Exception:
        grant_credits(user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        mark_error(
            generation_id,
            {"code": "enqueue_failed", "detail": "Failed to enqueue generation"},
        )
        if thread_id is not None:
            from providers.models import Thread

            Thread.objects.filter(id=thread_id).update(active_generation_id=None)
        return StreamStartOutcome(
            status="enqueue_failed",
            task=task,
            rejection=ChatOutcome(status="provider_error", task=task),
        )

    return StreamStartOutcome(status="accepted", generation_id=generation_id, task=task)
