from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from billing.models import CreditAccount
from billing.services import usd_to_credits
from providers.models import RequestLog
from providers.pricing import estimate_max_cost_usd
from providers.registry import REGISTRY
from providers.services import MODE_ROUTES, _route_hold_credits

User = get_user_model()

pytestmark = pytest.mark.django_db


def test_route_hold_credits_uses_the_most_expensive_route_candidate():
    # "fast" mode routes to openai primarily, with anthropic (priced far
    # higher per token) as its fallback. The hold must cover whichever one
    # actually ends up running, so it has to be sized off anthropic here,
    # not off the cheaper primary.
    prompt = "x" * 100
    routes = MODE_ROUTES["fast"]
    openai_provider, openai_model = routes[0]
    anthropic_provider, anthropic_model = routes[1]

    openai_cost = estimate_max_cost_usd(
        openai_model, len(prompt), REGISTRY[openai_provider].max_completion_tokens
    )
    anthropic_cost = estimate_max_cost_usd(
        anthropic_model, len(prompt), REGISTRY[anthropic_provider].max_completion_tokens
    )
    assert anthropic_cost > openai_cost, "test assumption: anthropic is the pricier candidate"

    hold = _route_hold_credits(routes, prompt)
    assert hold == usd_to_credits(anthropic_cost)


def _authed_client(username="chatter"):
    user = User.objects.create_user(username=username, password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def test_chat_requires_authentication():
    client = APIClient()
    response = client.post("/api/chat/", {"prompt": "hi", "mode": "fast"}, format="json")
    assert response.status_code == 401


def test_chat_rejects_invalid_mode():
    client, _ = _authed_client()
    response = client.post("/api/chat/", {"prompt": "hi", "mode": "ultra"}, format="json")
    assert response.status_code == 400


def test_chat_success_charges_credits_and_logs_request():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/chat/", {"prompt": "Hello, this is a test prompt", "mode": "fast"}, format="json"
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


def test_chat_with_zero_balance_returns_402_without_calling_provider(monkeypatch):
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

    response = client.post("/api/chat/", {"prompt": "should be blocked", "mode": "fast"}, format="json")

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
    response = client.post("/api/chat/", {"prompt": "   ", "mode": "fast"}, format="json")
    assert response.status_code == 400


def test_chat_with_low_but_positive_balance_never_reaches_provider_repeatedly(monkeypatch):
    # Regression test: a balance that is positive but can never cover this
    # request's worst-case cost used to pass a naive "balance > 0" check on
    # every call, letting the (paid) provider be hit an unbounded number of
    # times while the ledger balance never moved. The hold-then-reconcile
    # flow must reject this up front, every time, with no provider call.
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
        response = client.post("/api/chat/", {"prompt": long_prompt, "mode": "fast"}, format="json")
        assert response.status_code == 402

    assert called["count"] == 0
    account.refresh_from_db()
    assert account.balance == Decimal("0.0001")
    assert RequestLog.objects.filter(user=user, status=RequestLog.Status.INSUFFICIENT_CREDITS).count() == 3


def test_chat_provider_error_returns_502_and_does_not_charge(monkeypatch):
    # "fast" mode's route is [openai, anthropic]; both must fail to see a 502,
    # otherwise the request should recover via fallback (see the test below).
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("upstream provider is down")

    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)
    monkeypatch.setattr(REGISTRY["anthropic"], "complete", boom)

    response = client.post("/api/chat/", {"prompt": "trigger failure", "mode": "fast"}, format="json")

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
        "/api/chat/", {"prompt": "should recover via fallback", "mode": "fast"}, format="json"
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


def test_chat_smart_mode_routes_to_anthropic_by_default():
    client, user = _authed_client()
    response = client.post("/api/chat/", {"prompt": "give me the smart route", "mode": "smart"}, format="json")
    assert response.status_code == 200
    assert response.data["provider"] == "anthropic"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "anthropic"
    assert log.mocked is True


def test_chat_cheap_mode_routes_to_google_by_default():
    client, user = _authed_client()
    response = client.post("/api/chat/", {"prompt": "give me the cheap route", "mode": "cheap"}, format="json")
    assert response.status_code == 200
    assert response.data["provider"] == "google"
    assert response.data["used_fallback"] is False

    log = RequestLog.objects.get(user=user)
    assert log.provider == "google"
    assert log.mocked is True


def test_history_requires_authentication():
    client = APIClient()
    response = client.get("/api/history/")
    assert response.status_code == 401


def test_history_returns_only_the_requesting_users_entries():
    client, user = _authed_client("history_owner")
    other_client, other_user = _authed_client("history_other")

    client.post("/api/chat/", {"prompt": "mine", "mode": "fast"}, format="json")
    other_client.post("/api/chat/", {"prompt": "not mine", "mode": "fast"}, format="json")

    response = client.get("/api/history/")
    assert response.status_code == 200
    results = response.data["results"]
    assert len(results) == 1
    assert RequestLog.objects.get(id=results[0]["id"]).user == user


def test_history_is_paginated_newest_first():
    client, user = _authed_client("history_paged")
    for i in range(3):
        client.post("/api/chat/", {"prompt": f"prompt {i}", "mode": "fast"}, format="json")

    response = client.get("/api/history/")
    assert response.status_code == 200
    assert response.data["count"] == 3
    created_at_values = [row["created_at"] for row in response.data["results"]]
    assert created_at_values == sorted(created_at_values, reverse=True)
