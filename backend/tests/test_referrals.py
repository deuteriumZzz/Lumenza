from decimal import Decimal

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from billing.models import CreditAccount, LedgerEntry
from referrals.models import Referral
from referrals.services import (
    check_referral_reward,
    record_referral,
    referral_code_for,
    referral_link_for,
)
from tests.helpers import authed_client as _authed_client
from tests.helpers import make_user as _user

pytestmark = pytest.mark.django_db


def test_record_referral_creates_pending_referral():
    referrer = _user("ref_owner")
    referred = _user("ref_new")

    created = record_referral(referred, referral_code_for(referrer))

    assert created is True
    referral = Referral.objects.get(referred=referred)
    assert referral.referrer_id == referrer.id
    assert referral.status == Referral.Status.PENDING


def test_record_referral_rejects_self_referral():
    user = _user("ref_self")
    created = record_referral(user, referral_code_for(user))
    assert created is False
    assert not Referral.objects.filter(referred=user).exists()


def test_record_referral_rejects_unknown_referrer():
    referred = _user("ref_orphan")
    created = record_referral(referred, "ref_999999")
    assert created is False
    assert not Referral.objects.filter(referred=referred).exists()


def test_record_referral_rejects_malformed_code():
    referred = _user("ref_malformed")
    assert record_referral(referred, "not-a-code") is False
    assert record_referral(referred, "") is False
    assert not Referral.objects.filter(referred=referred).exists()


@override_settings(REFERRAL_REWARD_CREDITS=200)
def test_check_referral_reward_credits_both_sides_once():
    referrer = _user("reward_referrer")
    referred = _user("reward_referred")
    Referral.objects.create(referrer=referrer, referred=referred)

    referrer_balance_before = CreditAccount.objects.get(user=referrer).balance
    referred_balance_before = CreditAccount.objects.get(user=referred).balance

    check_referral_reward(referred)

    referral = Referral.objects.get(referred=referred)
    assert referral.status == Referral.Status.REWARDED
    assert referral.rewarded_at is not None

    referrer_account = CreditAccount.objects.get(user=referrer)
    referred_account = CreditAccount.objects.get(user=referred)
    assert referrer_account.balance == referrer_balance_before + Decimal("200")
    assert referred_account.balance == referred_balance_before + Decimal("200")
    assert LedgerEntry.objects.filter(
        account=referrer_account, reason=LedgerEntry.Reason.REFERRAL_BONUS
    ).exists()

    # Вторая "успешная генерация" тем же приглашённым пользователем не
    # должна награждать повторно — в этом весь смысл проверки
    # status=PENDING.
    balance_after_first = referrer_account.balance
    check_referral_reward(referred)
    referrer_account.refresh_from_db()
    assert referrer_account.balance == balance_after_first


def test_check_referral_reward_is_noop_without_a_pending_referral():
    user = _user("no_referral")
    balance_before = CreditAccount.objects.get(user=user).balance
    check_referral_reward(user)  # must not raise
    assert CreditAccount.objects.get(user=user).balance == balance_before


@override_settings(TELEGRAM_BOT_USERNAME="lumenza_test_bot")
def test_referral_link_uses_bot_username_and_code():
    user = _user("linker")
    link = referral_link_for(user)
    assert link == f"https://t.me/lumenza_test_bot?start=ref_{user.id}"


def test_referral_stats_endpoint_requires_authentication():
    response = APIClient().get("/api/referrals/")
    assert response.status_code == 401


@override_settings(
    TELEGRAM_BOT_USERNAME="lumenza_test_bot", REFERRAL_REWARD_CREDITS=200
)
def test_referral_stats_endpoint_reports_counts():
    client, referrer = _authed_client("stats_referrer")
    referred_pending = _user("stats_pending")
    referred_rewarded = _user("stats_rewarded")
    Referral.objects.create(referrer=referrer, referred=referred_pending)
    Referral.objects.create(
        referrer=referrer,
        referred=referred_rewarded,
        status=Referral.Status.REWARDED,
    )

    response = client.get("/api/referrals/")

    assert response.status_code == 200
    assert response.data["referral_code"] == f"ref_{referrer.id}"
    assert response.data["referred_count"] == 2
    assert response.data["rewarded_count"] == 1
    assert Decimal(response.data["reward_credits"]) == Decimal("200")
