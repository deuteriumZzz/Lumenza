from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from billing.models import CreditAccount, LedgerEntry
from billing.services import InsufficientCreditsError, charge_credits, get_or_create_account, grant_credits

User = get_user_model()

pytestmark = pytest.mark.django_db


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
