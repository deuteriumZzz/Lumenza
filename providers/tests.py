from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from billing.models import CreditAccount
from providers.models import RequestLog
from providers.registry import REGISTRY

User = get_user_model()

pytestmark = pytest.mark.django_db


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
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("upstream provider is down")

    monkeypatch.setattr(REGISTRY["openai"], "complete", boom)

    response = client.post("/api/chat/", {"prompt": "trigger failure", "mode": "fast"}, format="json")

    assert response.status_code == 502

    account.refresh_from_db()
    assert account.balance == starting_balance

    log = RequestLog.objects.get(user=user)
    assert log.status == RequestLog.Status.ERROR
    assert "upstream provider is down" in log.error_message
