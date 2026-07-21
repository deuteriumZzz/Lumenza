from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import User as UserModel
from billing.models import CreditAccount
from billing.services import usd_to_credits
from providers.models import RequestLog
from providers.pricing import estimate_max_cost_usd
from providers.registry import REGISTRY
from providers.services import TASK_ROUTES, _route_hold_credits
from tests.helpers import authed_client as _shared_authed_client

pytestmark = pytest.mark.django_db


def test_route_hold_credits_uses_the_most_expensive_route_candidate():
    # "repurpose" в основном маршрутизируется на openai, с anthropic
    # (цена за токен намного выше) как запасным вариантом. Резерв должен
    # покрывать тот, что в итоге реально сработает, поэтому здесь размер
    # считается по anthropic, а не по более дешёвому основному варианту.
    prompt = "x" * 100
    routes = TASK_ROUTES["repurpose"]
    openai_provider, openai_model = routes[0]
    anthropic_provider, anthropic_model = routes[1]

    openai_cost = estimate_max_cost_usd(
        openai_model,
        len(prompt),
        REGISTRY[openai_provider].max_completion_tokens,
    )
    anthropic_cost = estimate_max_cost_usd(
        anthropic_model,
        len(prompt),
        REGISTRY[anthropic_provider].max_completion_tokens,
    )
    assert (
        anthropic_cost > openai_cost
    ), "test assumption: anthropic is the pricier candidate"

    hold = _route_hold_credits(routes, prompt)
    assert hold == usd_to_credits(anthropic_cost)


def _authed_client(username="chatter", tier=UserModel.Tier.PAID):
    # PAID по умолчанию: тесты биллинга/запасных вариантов/модерации не
    # зависят от блокировки задач; тест самой блокировки передаёт
    # tier=FREE явно.
    return _shared_authed_client(username, tier=tier)


def test_chat_with_explicit_model_prefers_it_over_the_default_primary():
    client, user = _authed_client()  # PAID -> все модели разблокированы
    routes = TASK_ROUTES["repurpose"]
    # не основной вариант — доказывает именно выбор, а не дефолтную
    # маршрутизацию
    _, chosen_model = routes[1]

    response = client.post(
        "/api/chat/",
        {
            "prompt": "Hello, this is a test prompt",
            "task": "repurpose",
            "model": chosen_model,
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["model"] == chosen_model
    assert (
        response.data["used_fallback"] is False
    )  # пробовалась первой, не как запасной вариант


def test_chat_with_unknown_model_returns_403_model_locked():
    client, _ = _authed_client()  # PAID
    response = client.post(
        "/api/chat/",
        {
            "prompt": "Hello, this is a test prompt",
            "task": "repurpose",
            "model": "not-a-real-model",
        },
        format="json",
    )
    assert response.status_code == 403
    assert response.data["code"] == "model_locked"


def test_chat_with_not_yet_unlocked_model_returns_403_for_free_user():
    client, user = _authed_client(
        "model_locked_free", tier=UserModel.Tier.FREE
    )
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance
    routes = TASK_ROUTES["repurpose"]
    # позиция 1 требует реального использования; у свежего
    # FREE-пользователя его нет
    _, locked_model = routes[1]

    response = client.post(
        "/api/chat/",
        {
            "prompt": "Hello, this is a test prompt",
            "task": "repurpose",
            "model": locked_model,
        },
        format="json",
    )

    assert response.status_code == 403
    assert response.data["code"] == "model_locked"
    assert not RequestLog.objects.filter(
        user=user, status=RequestLog.Status.OK
    ).exists()
    account.refresh_from_db()
    assert account.balance == starting_balance


def test_chat_without_model_still_uses_default_primary():
    client, user = _authed_client()
    routes = TASK_ROUTES["repurpose"]
    _, primary_model = routes[0]

    response = client.post(
        "/api/chat/",
        {"prompt": "Hello, this is a test prompt", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["model"] == primary_model


def test_chat_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/chat/", {"prompt": "hi", "task": "repurpose"}, format="json"
    )
    assert response.status_code == 401


def test_chat_rejects_invalid_task():
    client, _ = _authed_client()
    response = client.post(
        "/api/chat/", {"prompt": "hi", "task": "ultra"}, format="json"
    )
    assert response.status_code == 400


def test_chat_success_charges_credits_and_logs_request():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/chat/",
        {"prompt": "Hello, this is a test prompt", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["mocked"] is True

    account.refresh_from_db()
    assert account.balance < starting_balance
    assert str(account.balance) == response.data["balance"]

    log = RequestLog.objects.get(user=user)
    assert log.status == RequestLog.Status.OK
    assert log.provider == "openai"
    assert log.mocked is True
    assert log.prompt_tokens > 0
    assert log.credits_charged > 0
    assert log.credits_charged == starting_balance - account.balance


def test_chat_with_zero_balance_returns_402_without_calling_provider(
    monkeypatch,
):
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    called = {"count": 0}
    original_complete = REGISTRY["openai"].complete

    def spy_complete(*args, **kwargs):
        called["count"] += 1
        return original_complete(*args, **kwargs)

    monkeypatch.setattr(REGISTRY["openai"], "complete", spy_complete)

    response = client.post(
        "/api/chat/",
        {"prompt": "should be blocked", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 402
    assert called["count"] == 0

    log = RequestLog.objects.get(user=user)
    assert log.status == RequestLog.Status.INSUFFICIENT_CREDITS
    assert log.cost_usd == 0
    assert log.credits_charged == 0

    account.refresh_from_db()
    assert account.balance == Decimal("0")


def test_chat_rejects_blank_prompt():
    client, _ = _authed_client()
    response = client.post(
        "/api/chat/", {"prompt": "   ", "task": "repurpose"}, format="json"
    )
    assert response.status_code == 400


def test_chat_with_low_but_positive_balance_never_reaches_provider_repeatedly(
    monkeypatch,
):
    # Регрессионный тест: баланс, который положительный, но никогда не
    # может покрыть стоимость запроса в худшем случае, раньше проходил
    # наивную проверку "balance > 0" при каждом вызове, позволяя бить по
    # (платному) провайдеру неограниченное число раз, пока баланс
    # леджера вообще не менялся. Поток резерв-затем-сверка должен
    # отклонять это сразу же, каждый раз, без единого вызова провайдера.
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0.0001")
    account.save(update_fields=["balance"])

    called = {"count": 0}
    original_complete = REGISTRY["openai"].complete

    def spy_complete(*args, **kwargs):
        called["count"] += 1
        return original_complete(*args, **kwargs)

    monkeypatch.setattr(REGISTRY["openai"], "complete", spy_complete)

    long_prompt = "x" * 4000
    for _ in range(3):
        response = client.post(
            "/api/chat/",
            {"prompt": long_prompt, "task": "repurpose"},
            format="json",
        )
        assert response.status_code == 402

    assert called["count"] == 0
    account.refresh_from_db()
    assert account.balance == Decimal("0.0001")
    assert (
        RequestLog.objects.filter(
            user=user, status=RequestLog.Status.INSUFFICIENT_CREDITS
        ).count()
        == 3
    )


def test_chat_provider_error_returns_502_and_does_not_charge(monkeypatch):
    # Маршрут задачи "repurpose" — [openai, anthropic, nvidia];
    # чтобы увидеть 502, должны отказать все три, иначе запрос
    # восстанавливается через запасной вариант (см. тесты ниже).
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("upstream provider is down")

    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)
    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)
    monkeypatch.setattr(REGISTRY["nvidia"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "trigger failure", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 502

    account.refresh_from_db()
    assert account.balance == starting_balance

    log = RequestLog.objects.get(user=user)
    assert log.status == RequestLog.Status.ERROR
    assert "upstream provider is down" in log.error_message
    assert log.used_fallback is True


def test_chat_falls_back_to_next_provider_when_primary_fails(monkeypatch):
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("openai is having an outage")

    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "should recover via fallback", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "anthropic"
    assert response.data["used_fallback"] is True

    account.refresh_from_db()
    assert account.balance < starting_balance

    log = RequestLog.objects.get(user=user)
    assert log.status == RequestLog.Status.OK
    assert log.provider == "anthropic"
    assert log.used_fallback is True
    assert "openai is having an outage" in log.error_message


def test_chat_hashtags_task_falls_back_to_nvidia_when_first_two_fail(
    monkeypatch,
):
    # Маршрут "hashtags" — [google, openai, nvidia] — оба первых
    # должны отказать, прежде чем будет достигнут третий (подобранный
    # вручную) запасной вариант.
    client, user = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr(REGISTRY["google"], "complete", boom)
    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "give me hashtags via nvidia fallback", "task": "hashtags"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "nvidia"
    assert response.data["used_fallback"] is True
    assert response.data["mocked"] is True

    log = RequestLog.objects.get(user=user)
    assert log.provider == "nvidia"
    assert log.model == "meta/llama-3.2-3b-instruct"


def test_chat_content_plan_task_falls_back_to_nvidia_when_first_two_fail(
    monkeypatch,
):
    client, user = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)
    monkeypatch.setattr(REGISTRY["google"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "plan via nvidia fallback", "task": "content_plan"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "nvidia"
    assert response.data["mocked"] is True

    log = RequestLog.objects.get(user=user)
    assert log.model == "qwen/qwen3.5-122b-a10b"


def test_chat_translation_task_falls_back_to_nvidia_when_first_two_fail(
    monkeypatch,
):
    client, user = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr(REGISTRY["google"], "complete", boom)
    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "translate via nvidia fallback", "task": "translation"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "nvidia"
    assert response.data["mocked"] is True

    log = RequestLog.objects.get(user=user)
    assert log.model == "qwen/qwen3-next-80b-a3b-instruct"


def test_chat_repurpose_task_falls_back_to_nvidia_when_first_two_fail(
    monkeypatch,
):
    client, user = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)
    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "repurpose via nvidia fallback", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "nvidia"
    assert response.data["mocked"] is True

    log = RequestLog.objects.get(user=user)
    assert log.model == "meta/llama-3.1-8b-instruct"


def test_chat_hook_task_falls_back_to_nvidia_when_first_two_fail(monkeypatch):
    client, user = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)
    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "hook via nvidia fallback", "task": "hook"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "nvidia"
    assert response.data["mocked"] is True

    log = RequestLog.objects.get(user=user)
    assert log.model == "nvidia/nvidia-nemotron-nano-9b-v2"


def test_chat_longform_task_falls_back_to_nvidia_when_first_two_fail(
    monkeypatch,
):
    client, user = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("upstream is down")

    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)
    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)

    response = client.post(
        "/api/chat/",
        {"prompt": "longform via nvidia fallback", "task": "longform"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["provider"] == "nvidia"
    assert response.data["mocked"] is True

    log = RequestLog.objects.get(user=user)
    assert log.model == "nvidia/llama-3.3-nemotron-super-49b-v1.5"


def test_chat_hook_task_routes_to_anthropic_by_default():
    client, user = _authed_client()
    response = client.post(
        "/api/chat/",
        {"prompt": "give me a hook", "task": "hook"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["provider"] == "anthropic"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "anthropic"
    assert log.mocked is True


def test_chat_hashtags_task_routes_to_google_by_default():
    client, user = _authed_client()
    response = client.post(
        "/api/chat/",
        {"prompt": "give me hashtags", "task": "hashtags"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["provider"] == "google"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "google"
    assert log.mocked is True


def test_chat_content_plan_task_routes_to_anthropic_by_default():
    client, user = _authed_client()
    response = client.post(
        "/api/chat/",
        {"prompt": "plan my content for the week", "task": "content_plan"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["provider"] == "anthropic"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "anthropic"


def test_chat_translation_task_routes_to_google_by_default():
    client, user = _authed_client()
    response = client.post(
        "/api/chat/",
        {"prompt": "translate this caption", "task": "translation"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["provider"] == "google"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "google"


def test_chat_longform_task_routes_to_anthropic_by_default():
    client, user = _authed_client()
    response = client.post(
        "/api/chat/",
        {"prompt": "write a long article", "task": "longform"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["provider"] == "anthropic"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "anthropic"


def test_history_requires_authentication():
    client = APIClient()
    response = client.get("/api/history/")
    assert response.status_code == 401


def test_history_returns_only_the_requesting_users_entries():
    client, user = _authed_client("history_owner")
    other_client, other_user = _authed_client("history_other")

    client.post(
        "/api/chat/", {"prompt": "mine", "task": "repurpose"}, format="json"
    )
    other_client.post(
        "/api/chat/",
        {"prompt": "not mine", "task": "repurpose"},
        format="json",
    )

    response = client.get("/api/history/")
    assert response.status_code == 200
    results = response.data["results"]
    assert len(results) == 1
    assert RequestLog.objects.get(id=results[0]["id"]).user == user


def test_history_is_paginated_newest_first():
    client, user = _authed_client("history_paged")
    for i in range(3):
        client.post(
            "/api/chat/",
            {"prompt": f"prompt {i}", "task": "repurpose"},
            format="json",
        )

    response = client.get("/api/history/")
    assert response.status_code == 200
    assert response.data["count"] == 3
    created_at_values = [row["created_at"] for row in response.data["results"]]
    assert created_at_values == sorted(created_at_values, reverse=True)


def test_chat_blocked_by_moderation_returns_422_uncharged(monkeypatch):
    client, user = _authed_client("moderated")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    called = {"count": 0}
    original_complete = REGISTRY["openai"].complete

    def spy_complete(*args, **kwargs):
        called["count"] += 1
        return original_complete(*args, **kwargs)

    monkeypatch.setattr(REGISTRY["openai"], "complete", spy_complete)

    response = client.post(
        "/api/chat/",
        {"prompt": "child sexual content", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 422
    assert called["count"] == 0
    account.refresh_from_db()
    assert account.balance == starting_balance
    assert RequestLog.objects.filter(
        user=user, status=RequestLog.Status.BLOCKED
    ).exists()


def test_chat_locked_task_returns_403_without_charging_or_calling_provider(
    monkeypatch,
):
    # "hook" отсутствует в progression.services.BASE_FREE_KEYS, поэтому
    # свежий FREE-пользователь (тариф по умолчанию) ещё не заработал её.
    client, user = _authed_client("locked_task", tier=UserModel.Tier.FREE)
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    called = {"count": 0}
    original_complete = REGISTRY["anthropic"].complete

    def spy_complete(*args, **kwargs):
        called["count"] += 1
        return original_complete(*args, **kwargs)

    monkeypatch.setattr(REGISTRY["anthropic"], "complete", spy_complete)

    response = client.post(
        "/api/chat/",
        {"prompt": "should be locked", "task": "hook"},
        format="json",
    )

    assert response.status_code == 403
    assert response.data["code"] == "task_locked"
    assert called["count"] == 0

    account.refresh_from_db()
    assert account.balance == starting_balance
    assert RequestLog.objects.filter(
        user=user, status=RequestLog.Status.TASK_LOCKED
    ).exists()


def test_chat_is_rate_limited(monkeypatch):
    from providers.throttling import ChatRateThrottle

    monkeypatch.setattr(ChatRateThrottle, "rate", "1/min", raising=False)
    client, _ = _authed_client("rate_limited")

    first = client.post(
        "/api/chat/", {"prompt": "hello", "task": "repurpose"}, format="json"
    )
    second = client.post(
        "/api/chat/",
        {"prompt": "hello again", "task": "repurpose"},
        format="json",
    )

    assert first.status_code == 200
    assert second.status_code == 429
