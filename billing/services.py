from decimal import Decimal

from django.conf import settings
from django.db import transaction

from billing.models import CreditAccount, LedgerEntry


class InsufficientCreditsError(Exception):
    pass


def usd_to_credits(cost_usd) -> Decimal:
    return (
        Decimal(str(cost_usd)) * Decimal(str(settings.PROVIDER_MARKUP)) / Decimal(str(settings.CREDIT_USD_VALUE))
    ).quantize(Decimal("0.0001"))


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
