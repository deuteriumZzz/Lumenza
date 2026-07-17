from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from billing.models import CreditAccount, LedgerEntry
from billing.services import InsufficientCreditsError, charge_credits, get_or_create_account, grant_credits

User = get_user_model()

pytestmark = pytest.mark.django_db


def _authed_client(username="billed"):
    user = User.objects.create_user(username=username, password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@override_settings(SIGNUP_BONUS_CREDITS=500)
def test_creating_user_grants_signup_bonus():
    user = User.objects.create_user(username="signup", password="strongpass123")
    account = CreditAccount.objects.get(user=user)
    assert account.balance == Decimal("500")
    entry = LedgerEntry.objects.get(account=account)
    assert entry.reason == LedgerEntry.Reason.SIGNUP_BONUS
    assert entry.balance_after == Decimal("500")


def test_get_or_create_account_is_idempotent():
    user = User.objects.create_user(username="idem", password="strongpass123")
    first = get_or_create_account(user)
    second = get_or_create_account(user)
    assert first.pk == second.pk
    assert CreditAccount.objects.filter(user=user).count() == 1


def test_grant_credits_increases_balance_and_logs_entry():
    user = User.objects.create_user(username="grantee", password="strongpass123")
    account = grant_credits(user, Decimal("100"), reason=LedgerEntry.Reason.TOPUP)
    assert account.balance == Decimal("500") + Decimal("100")
    last_entry = LedgerEntry.objects.filter(account=account).order_by("-created_at").first()
    assert last_entry.reason == LedgerEntry.Reason.TOPUP
    assert last_entry.amount == Decimal("100")


def test_charge_credits_decreases_balance_and_logs_negative_entry():
    user = User.objects.create_user(username="spender", password="strongpass123")
    account = charge_credits(user, Decimal("50"), reason=LedgerEntry.Reason.CHAT_REQUEST)
    assert account.balance == Decimal("500") - Decimal("50")
    last_entry = LedgerEntry.objects.filter(account=account).order_by("-created_at").first()
    assert last_entry.amount == Decimal("-50")
    assert last_entry.balance_after == account.balance


def test_charge_credits_raises_when_balance_insufficient():
    user = User.objects.create_user(username="poor", password="strongpass123")
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("10")
    account.save(update_fields=["balance"])

    with pytest.raises(InsufficientCreditsError):
        charge_credits(user, Decimal("50"), reason=LedgerEntry.Reason.CHAT_REQUEST)

    account.refresh_from_db()
    assert account.balance == Decimal("10")
    assert not LedgerEntry.objects.filter(account=account, reason=LedgerEntry.Reason.CHAT_REQUEST).exists()


def test_balance_endpoint_requires_authentication():
    client = APIClient()
    response = client.get("/api/billing/balance/")
    assert response.status_code == 401


def test_balance_endpoint_returns_current_balance():
    client, user = _authed_client()
    response = client.get("/api/billing/balance/")
    assert response.status_code == 200
    assert Decimal(response.data["balance"]) == Decimal("500")


@override_settings(SANDBOX_TOPUP_ENABLED=True)
def test_sandbox_topup_grants_credits_when_enabled():
    client, user = _authed_client()
    response = client.post("/api/billing/topup/sandbox/", {"amount": "25"}, format="json")
    assert response.status_code == 201
    assert Decimal(response.data["balance"]) == Decimal("525")

    account = CreditAccount.objects.get(user=user)
    assert account.balance == Decimal("525")
    last_entry = LedgerEntry.objects.filter(account=account).order_by("-created_at").first()
    assert last_entry.reason == LedgerEntry.Reason.TOPUP
    assert last_entry.amount == Decimal("25")


@override_settings(SANDBOX_TOPUP_ENABLED=False)
def test_sandbox_topup_returns_404_when_disabled():
    client, user = _authed_client()
    response = client.post("/api/billing/topup/sandbox/", {"amount": "25"}, format="json")
    assert response.status_code == 404

    account = CreditAccount.objects.get(user=user)
    assert account.balance == Decimal("500")


@override_settings(SANDBOX_TOPUP_ENABLED=True)
def test_sandbox_topup_rejects_non_positive_amount():
    client, _ = _authed_client()
    response = client.post("/api/billing/topup/sandbox/", {"amount": "0"}, format="json")
    assert response.status_code == 400
