import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from billing.models import CreditAccount, LedgerEntry, Payment
from billing.services import InsufficientCreditsError, charge_credits, get_or_create_account, grant_credits
from billing.yookassa_client import YooKassaError

User = get_user_model()

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    # The webhook rate limit's counter lives in Django's cache, which isn't
    # rolled back between tests like the DB is — several tests below share
    # _pending_payment's hardcoded "pay_xyz" id, so a stale count could leak
    # from one test into the next without this.
    from django.core.cache import cache

    cache.clear()


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


YOOKASSA_SETTINGS = {"YOOKASSA_SHOP_ID": "shop_123", "YOOKASSA_SECRET_KEY": "secret_123", "CREDIT_RUB_VALUE": 0.1}


def _fake_create_payment(yookassa_payment_id="pay_abc"):
    def create_payment(amount_rub, return_url, description):
        return {
            "id": yookassa_payment_id,
            "confirmation": {"confirmation_url": f"https://yookassa.ru/pay/{yookassa_payment_id}"},
        }

    return create_payment


@override_settings(**YOOKASSA_SETTINGS)
def test_topup_creates_pending_payment_and_returns_confirmation_url(monkeypatch):
    import billing.services as services

    monkeypatch.setattr(services, "create_payment", _fake_create_payment())
    client, user = _authed_client()

    response = client.post("/api/billing/topup/", {"amount_rub": "100"}, format="json")

    assert response.status_code == 201
    assert response.data["confirmation_url"] == "https://yookassa.ru/pay/pay_abc"
    assert response.data["status"] == Payment.Status.PENDING

    payment = Payment.objects.get(user=user)
    assert payment.yookassa_payment_id == "pay_abc"
    assert payment.amount_rub == Decimal("100")
    assert payment.credits_amount == Decimal("1000")  # 100 RUB / 0.1 RUB-per-credit


@override_settings(YOOKASSA_SHOP_ID="", YOOKASSA_SECRET_KEY="")
def test_topup_returns_503_when_yookassa_not_configured():
    client, _ = _authed_client()
    response = client.post("/api/billing/topup/", {"amount_rub": "100"}, format="json")
    assert response.status_code == 503
    assert not Payment.objects.exists()


@override_settings(**YOOKASSA_SETTINGS)
def test_topup_returns_503_and_creates_no_payment_when_yookassa_api_fails(monkeypatch):
    import billing.services as services

    def boom(amount_rub, return_url, description):
        raise YooKassaError("boom")

    monkeypatch.setattr(services, "create_payment", boom)
    client, _ = _authed_client()

    response = client.post("/api/billing/topup/", {"amount_rub": "100"}, format="json")

    assert response.status_code == 503
    assert not Payment.objects.exists()


def _pending_payment(user, credits_amount=Decimal("1000")):
    return Payment.objects.create(
        user=user,
        yookassa_payment_id="pay_xyz",
        amount_rub=Decimal("100"),
        credits_amount=credits_amount,
    )


def _post_webhook(client, payment_id):
    return client.post(
        "/api/billing/topup/yookassa/webhook/",
        data=json.dumps({"type": "notification", "event": "payment.succeeded", "object": {"id": payment_id}}),
        content_type="application/json",
    )


def test_webhook_credits_account_when_yookassa_confirms_succeeded(monkeypatch):
    import billing.services as services

    client, user = _authed_client()
    payment = _pending_payment(user)
    balance_before = CreditAccount.objects.get(user=user).balance

    monkeypatch.setattr(services, "get_payment", lambda payment_id: {"status": "succeeded"})
    response = _post_webhook(APIClient(), payment.yookassa_payment_id)

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == Payment.Status.SUCCEEDED

    account = CreditAccount.objects.get(user=user)
    assert account.balance == balance_before + payment.credits_amount
    assert LedgerEntry.objects.filter(account=account, reason=LedgerEntry.Reason.TOPUP).exists()


def test_webhook_is_idempotent_on_duplicate_delivery(monkeypatch):
    import billing.services as services

    client, user = _authed_client()
    payment = _pending_payment(user)

    monkeypatch.setattr(services, "get_payment", lambda payment_id: {"status": "succeeded"})
    first = _post_webhook(APIClient(), payment.yookassa_payment_id)
    second = _post_webhook(APIClient(), payment.yookassa_payment_id)

    assert first.status_code == 200
    assert second.status_code == 200

    account = CreditAccount.objects.get(user=user)
    # Credited exactly once despite two notification deliveries for the
    # same payment — the whole point of the idempotency guard.
    assert account.balance == Decimal("500") + payment.credits_amount
    assert LedgerEntry.objects.filter(account=account, reason=LedgerEntry.Reason.TOPUP).count() == 1


def test_webhook_does_not_credit_when_yookassa_reports_pending(monkeypatch):
    import billing.services as services

    client, user = _authed_client()
    payment = _pending_payment(user)
    balance_before = CreditAccount.objects.get(user=user).balance

    monkeypatch.setattr(services, "get_payment", lambda payment_id: {"status": "pending"})
    response = _post_webhook(APIClient(), payment.yookassa_payment_id)

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == Payment.Status.PENDING
    assert CreditAccount.objects.get(user=user).balance == balance_before


def test_webhook_marks_canceled_when_yookassa_reports_canceled(monkeypatch):
    import billing.services as services

    client, user = _authed_client()
    payment = _pending_payment(user)

    monkeypatch.setattr(services, "get_payment", lambda payment_id: {"status": "canceled"})
    response = _post_webhook(APIClient(), payment.yookassa_payment_id)

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == Payment.Status.CANCELED


def test_webhook_ignores_unknown_payment_id():
    response = _post_webhook(APIClient(), "no-such-payment")
    assert response.status_code == 200


def test_webhook_returns_502_when_yookassa_lookup_fails(monkeypatch):
    import billing.services as services

    client, user = _authed_client()
    payment = _pending_payment(user)

    def boom(payment_id):
        raise YooKassaError("boom")

    monkeypatch.setattr(services, "get_payment", boom)
    response = _post_webhook(APIClient(), payment.yookassa_payment_id)

    assert response.status_code == 502
    payment.refresh_from_db()
    assert payment.status == Payment.Status.PENDING


def test_webhook_rejects_malformed_json():
    response = APIClient().post(
        "/api/billing/topup/yookassa/webhook/", data="not json", content_type="application/json"
    )
    assert response.status_code == 400


def test_webhook_rejects_missing_payment_id():
    response = APIClient().post(
        "/api/billing/topup/yookassa/webhook/",
        data=json.dumps({"type": "notification", "object": {}}),
        content_type="application/json",
    )
    assert response.status_code == 400


def test_webhook_rate_limits_repeated_calls_for_the_same_payment_id(monkeypatch):
    import billing.services as services

    monkeypatch.setattr(services, "get_payment", lambda payment_id: {"status": "pending"})
    client, user = _authed_client("webhook_rate_limited")
    payment = _pending_payment(user)

    responses = [_post_webhook(client, payment.yookassa_payment_id) for _ in range(11)]

    assert [r.status_code for r in responses[:10]] == [200] * 10
    assert responses[10].status_code == 429
