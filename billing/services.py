from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Optional

from django.conf import settings
from django.db import transaction

from billing.models import CreditAccount, LedgerEntry, Payment
from billing.yookassa_client import YooKassaError, create_payment, get_payment


class InsufficientCreditsError(Exception):
    pass


def usd_to_credits(cost_usd) -> Decimal:
    return (
        Decimal(str(cost_usd)) * Decimal(str(settings.PROVIDER_MARKUP)) / Decimal(str(settings.CREDIT_USD_VALUE))
    ).quantize(Decimal("0.0001"))


def rub_to_credits(amount_rub) -> Decimal:
    return (Decimal(str(amount_rub)) / Decimal(str(settings.CREDIT_RUB_VALUE))).quantize(Decimal("0.0001"))


@transaction.atomic
def get_or_create_account(user) -> CreditAccount:
    account, _ = CreditAccount.objects.select_for_update().get_or_create(user=user)
    return account


@transaction.atomic
def grant_credits(user, amount: Decimal, reason: str) -> CreditAccount:
    account = get_or_create_account(user)
    account.balance += amount
    account.save(update_fields=["balance", "updated_at"])
    LedgerEntry.objects.create(
        account=account, amount=amount, reason=reason, balance_after=account.balance
    )
    return account


@transaction.atomic
def charge_credits(user, amount: Decimal, reason: str) -> CreditAccount:
    account = get_or_create_account(user)
    if account.balance < amount:
        raise InsufficientCreditsError(f"balance {account.balance} < required {amount}")
    account.balance -= amount
    account.save(update_fields=["balance", "updated_at"])
    LedgerEntry.objects.create(
        account=account, amount=-amount, reason=reason, balance_after=account.balance
    )
    return account


@dataclass
class StartTopupOutcome:
    status: Literal["created", "unavailable"]
    payment: Optional[Payment] = None
    confirmation_url: Optional[str] = None


def start_topup(user, amount_rub: Decimal) -> StartTopupOutcome:
    if not settings.YOOKASSA_SHOP_ID or not settings.YOOKASSA_SECRET_KEY:
        return StartTopupOutcome(status="unavailable")

    return_url = f"{settings.PUBLIC_BASE_URL}/billing"
    try:
        response = create_payment(amount_rub, return_url, description=f"Lumenza top-up: {amount_rub} RUB")
    except YooKassaError:
        return StartTopupOutcome(status="unavailable")

    payment = Payment.objects.create(
        user=user,
        yookassa_payment_id=response["id"],
        amount_rub=amount_rub,
        credits_amount=rub_to_credits(amount_rub),
    )
    return StartTopupOutcome(
        status="created",
        payment=payment,
        confirmation_url=response["confirmation"]["confirmation_url"],
    )


@dataclass
class ConfirmTopupOutcome:
    status: Literal["credited", "already_processed", "not_succeeded", "unknown_payment", "provider_error"]
    payment: Optional[Payment] = None


def confirm_topup(yookassa_payment_id: str) -> ConfirmTopupOutcome:
    """Called from the webhook view. Never trusts the webhook body's own
    claimed status — always re-fetches the payment from YooKassa first, so
    the credit decision is based on what YooKassa itself confirms."""
    try:
        payment = Payment.objects.get(yookassa_payment_id=yookassa_payment_id)
    except Payment.DoesNotExist:
        return ConfirmTopupOutcome(status="unknown_payment")

    try:
        remote = get_payment(yookassa_payment_id)
    except YooKassaError:
        return ConfirmTopupOutcome(status="provider_error", payment=payment)

    remote_status = remote.get("status")

    # The row lock (rather than locking around the get_payment() call above
    # too) keeps a slow outbound HTTP call from holding a DB lock — the
    # network round-trip happens first, and only the local read-check-write
    # is done under the lock.
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment.pk)

        if payment.status == Payment.Status.SUCCEEDED:
            # A duplicate delivery of a notification already processed —
            # this is the idempotency guard: never grant credits twice for
            # the same payment.
            return ConfirmTopupOutcome(status="already_processed", payment=payment)

        if remote_status != "succeeded":
            if remote_status == "canceled":
                payment.status = Payment.Status.CANCELED
                payment.save(update_fields=["status", "updated_at"])
            return ConfirmTopupOutcome(status="not_succeeded", payment=payment)

        grant_credits(payment.user, payment.credits_amount, reason=LedgerEntry.Reason.TOPUP)
        payment.status = Payment.Status.SUCCEEDED
        payment.save(update_fields=["status", "updated_at"])
        return ConfirmTopupOutcome(status="credited", payment=payment)
