from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Literal, Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from billing.models import CreditAccount, LedgerEntry, Payment, Subscription
from billing.yookassa_client import (
    YooKassaError,
    charge_saved_payment_method,
    create_payment,
    get_payment,
)

SUBSCRIPTION_PERIOD = timedelta(days=30)


class InsufficientCreditsError(Exception):
    pass


def usd_to_credits(cost_usd) -> Decimal:
    return (
        Decimal(str(cost_usd))
        * Decimal(str(settings.PROVIDER_MARKUP))
        / Decimal(str(settings.CREDIT_USD_VALUE))
    ).quantize(Decimal("0.0001"))


def rub_to_credits(amount_rub) -> Decimal:
    return (
        Decimal(str(amount_rub)) / Decimal(str(settings.CREDIT_RUB_VALUE))
    ).quantize(Decimal("0.0001"))


@transaction.atomic
def get_or_create_account(user) -> CreditAccount:
    account, _ = CreditAccount.objects.select_for_update().get_or_create(
        user=user
    )
    return account


@transaction.atomic
def grant_credits(user, amount: Decimal, reason: str) -> CreditAccount:
    account = get_or_create_account(user)
    account.balance += amount
    account.save(update_fields=["balance", "updated_at"])
    LedgerEntry.objects.create(
        account=account,
        amount=amount,
        reason=reason,
        balance_after=account.balance,
    )
    return account


@transaction.atomic
def charge_credits(user, amount: Decimal, reason: str) -> CreditAccount:
    account = get_or_create_account(user)
    if account.balance < amount:
        raise InsufficientCreditsError(
            f"balance {account.balance} < required {amount}"
        )
    account.balance -= amount
    account.save(update_fields=["balance", "updated_at"])
    LedgerEntry.objects.create(
        account=account,
        amount=-amount,
        reason=reason,
        balance_after=account.balance,
    )
    return account


def claim_pending_record(model, record_id: int):
    """Блокирует строку и захватывает запись асинхронной задачи
    (PENDING -> PROCESSING), чтобы повторная доставка задачи Celery была
    безопасным no-op вместо двойного возврата/двойного списания. Общая для
    media_ops.tasks и imagegen.tasks — каждая модель записи там следует
    одной и той же форме статусов PENDING/PROCESSING/OK/ERROR и имеет FK
    `user` плюс поле `credits_charged`. Возвращает None, если запись уже
    захвачена (или уже в терминальном статусе)."""
    with transaction.atomic():
        record = (
            model.objects.select_for_update()
            .select_related("user")
            .get(id=record_id)
        )
        if record.status != model.Status.PENDING:
            return None
        record.status = model.Status.PROCESSING
        record.save(update_fields=["status"])
    return record


def refund_hold(record) -> None:
    """Возвращает пользователю зарезервированные кредиты записи (списанные
    в момент запроса) — вызывается на любом пути отказа (ошибка провайдера,
    блокировка модерацией) в media_ops.tasks и imagegen.tasks."""
    if record.credits_charged > 0:
        grant_credits(
            record.user,
            record.credits_charged,
            reason=LedgerEntry.Reason.REFUND,
        )
        record.credits_charged = Decimal("0")


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
        response = create_payment(
            amount_rub,
            return_url,
            description=f"Lumenza top-up: {amount_rub} RUB",
        )
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
    status: Literal[
        "credited",
        "already_processed",
        "not_succeeded",
        "unknown_payment",
        "provider_error",
    ]
    payment: Optional[Payment] = None


def confirm_payment(yookassa_payment_id: str) -> ConfirmTopupOutcome:
    """Вызывается из view вебхука и для разовых пополнений, и для платежей
    подписки — общая форма "найти-затем-разветвиться" (никогда
    не доверять статусу, заявленному в теле вебхука; всегда сначала
    перезапросить у YooKassa) у них одинаковая, различается только то, что
    именно даёт "успех".
    """
    try:
        payment = Payment.objects.get(yookassa_payment_id=yookassa_payment_id)
    except Payment.DoesNotExist:
        return ConfirmTopupOutcome(status="unknown_payment")

    try:
        remote = get_payment(yookassa_payment_id)
    except YooKassaError:
        return ConfirmTopupOutcome(status="provider_error", payment=payment)

    remote_status = remote.get("status")

    # Блокировка строки (а не блокировка ещё и вокруг вызова
    # get_payment() выше) не даёт медленному исходящему HTTP-вызову
    # удерживать блокировку БД — сначала происходит сетевой round-trip,
    # и только локальные чтение-проверка-запись выполняются под
    # блокировкой.
    with transaction.atomic():
        # Keep the same User -> Payment lock order as start_subscription().
        # A delayed YooKassa webhook can race a user's subscribe retry, so
        # reversing these locks would allow the two transactions to deadlock.
        locked_user = User.objects.select_for_update().get(
            pk=payment.user_id
        )
        payment = Payment.objects.select_for_update().get(pk=payment.pk)

        if payment.status == Payment.Status.SUCCEEDED:
            # Повторная доставка уже обработанного уведомления — это и
            # есть защита от повторов: никогда не начислять
            # кредиты/активировать подписку дважды для одного и того же
            # платежа.
            return ConfirmTopupOutcome(
                status="already_processed", payment=payment
            )

        if remote_status != "succeeded":
            if remote_status == "canceled":
                payment.status = Payment.Status.CANCELED
                payment.save(update_fields=["status", "updated_at"])
            return ConfirmTopupOutcome(status="not_succeeded", payment=payment)

        payment.status = Payment.Status.SUCCEEDED
        payment.save(update_fields=["status", "updated_at"])

        if payment.kind == Payment.Kind.TOPUP:
            grant_credits(
                locked_user,
                payment.credits_amount,
                reason=LedgerEntry.Reason.TOPUP,
            )
        else:
            _activate_subscription(locked_user, payment.amount_rub, remote)

        return ConfirmTopupOutcome(status="credited", payment=payment)


def _activate_subscription(
    user, price_rub: Decimal, remote_payment: dict
) -> None:
    payment_method_id = remote_payment.get("payment_method", {}).get("id", "")
    Subscription.objects.update_or_create(
        user=user,
        defaults={
            "yookassa_payment_method_id": payment_method_id,
            "status": (
                Subscription.Status.ACTIVE
                if payment_method_id
                else Subscription.Status.NON_RENEWING
            ),
            "price_rub": price_rub,
            "current_period_end": timezone.now() + SUBSCRIPTION_PERIOD,
            "canceled_at": None,
        },
    )
    user.tier = User.Tier.PAID
    user.save(update_fields=["tier"])


@dataclass
class StartSubscriptionOutcome:
    status: Literal["created", "unavailable", "already_subscribed"]
    payment: Optional[Payment] = None
    confirmation_url: Optional[str] = None


@transaction.atomic
def start_subscription(user, price_rub: Decimal) -> StartSubscriptionOutcome:
    if not settings.YOOKASSA_SHOP_ID or not settings.YOOKASSA_SECRET_KEY:
        return StartSubscriptionOutcome(status="unavailable")

    locked_user = User.objects.select_for_update().get(pk=user.pk)
    if Subscription.objects.filter(
        user=locked_user,
        status__in=(
            Subscription.Status.ACTIVE,
            Subscription.Status.NON_RENEWING,
        ),
    ).exists():
        return StartSubscriptionOutcome(status="already_subscribed")

    pending_payment = (
        Payment.objects.filter(
            user=locked_user,
            kind=Payment.Kind.SUBSCRIPTION,
            status=Payment.Status.PENDING,
        )
        .order_by("-created_at")
        .first()
    )
    if pending_payment is not None:
        try:
            remote = get_payment(pending_payment.yookassa_payment_id)
        except YooKassaError:
            return StartSubscriptionOutcome(status="unavailable")

        remote_status = remote.get("status")
        if remote_status == "canceled":
            pending_payment.status = Payment.Status.CANCELED
            pending_payment.save(update_fields=["status", "updated_at"])
        elif remote_status == "succeeded":
            pending_payment.status = Payment.Status.SUCCEEDED
            pending_payment.save(update_fields=["status", "updated_at"])
            _activate_subscription(
                locked_user, pending_payment.amount_rub, remote
            )
            return StartSubscriptionOutcome(status="already_subscribed")
        else:
            confirmation_url = remote.get("confirmation", {}).get(
                "confirmation_url"
            )
            if not confirmation_url:
                return StartSubscriptionOutcome(status="unavailable")
            return StartSubscriptionOutcome(
                status="created",
                payment=pending_payment,
                confirmation_url=confirmation_url,
            )

    return_url = f"{settings.PUBLIC_BASE_URL}/billing"
    try:
        response = create_payment(
            price_rub,
            return_url,
            description="Lumenza Pro subscription",
            save_payment_method=True,
        )
    except YooKassaError:
        return StartSubscriptionOutcome(status="unavailable")

    payment = Payment.objects.create(
        user=locked_user,
        yookassa_payment_id=response["id"],
        amount_rub=price_rub,
        kind=Payment.Kind.SUBSCRIPTION,
    )
    return StartSubscriptionOutcome(
        status="created",
        payment=payment,
        confirmation_url=response["confirmation"]["confirmation_url"],
    )


def cancel_subscription(user) -> bool:
    """Отмена по инициативе пользователя. Сразу понижает до FREE, вместо
    того чтобы отслеживать льготный период до current_period_end — проще, и
    согласуется с тем, что геймифицированный FREE-тариф этого проекта и так
    даёт FREE-пользователям настоящий, пригодный к использованию продукт, а
    не урезанный."""
    updated = Subscription.objects.filter(
        user=user,
        status__in=(
            Subscription.Status.ACTIVE,
            Subscription.Status.NON_RENEWING,
        ),
    ).update(status=Subscription.Status.CANCELED, canceled_at=timezone.now())
    if not updated:
        return False
    user.tier = User.Tier.FREE
    user.save(update_fields=["tier"])
    return True


@transaction.atomic
def expire_nonrenewing_subscription(subscription: Subscription) -> bool:
    """End a paid first period that could not be made recurring.

    YooKassa can confirm the initial charge without returning a reusable
    payment method. The user still receives the period they paid for, but the
    subscription is marked NON_RENEWING and this guarded transition downgrades
    it exactly once after that period ends.
    """
    locked = (
        Subscription.objects.select_for_update()
        .select_related("user")
        .get(pk=subscription.pk)
    )
    if (
        locked.status != Subscription.Status.NON_RENEWING
        or locked.current_period_end > timezone.now()
    ):
        return False
    locked.status = Subscription.Status.CANCELED
    locked.canceled_at = timezone.now()
    locked.save(
        update_fields=["status", "canceled_at", "updated_at"]
    )
    locked.user.tier = User.Tier.FREE
    locked.user.save(update_fields=["tier"])
    return True


def _renewal_idempotency_key(subscription: Subscription) -> str:
    period_timestamp = int(subscription.current_period_end.timestamp())
    return f"lumenza-sub-{subscription.pk}-{period_timestamp}"


def renew_subscription(subscription: Subscription) -> bool:
    """Списывает средства за следующий период подписки с сохранённого
    способа оплаты. Вызывается из billing.tasks.renew_subscriptions (Celery
    Beat, ежедневно) для каждой ACTIVE-подписки, у которой current_period_end
    уже прошёл — без участия пользователя, в этом весь смысл
    save_payment_method. Возвращает, удалось ли списание."""
    with transaction.atomic():
        locked = (
            Subscription.objects.select_for_update()
            .select_related("user")
            .get(pk=subscription.pk)
        )
        if (
            locked.status != Subscription.Status.ACTIVE
            or locked.current_period_end > timezone.now()
        ):
            return False

        try:
            remote = charge_saved_payment_method(
                locked.yookassa_payment_method_id,
                locked.price_rub,
                description="Lumenza Pro subscription renewal",
                idempotency_key=_renewal_idempotency_key(locked),
            )
        except YooKassaError:
            _mark_past_due(locked)
            return False

        remote_status = remote.get("status")
        Payment.objects.create(
            user=locked.user,
            yookassa_payment_id=remote["id"],
            amount_rub=locked.price_rub,
            kind=Payment.Kind.SUBSCRIPTION,
            status=(
                Payment.Status.SUCCEEDED
                if remote_status == "succeeded"
                else Payment.Status.CANCELED
            ),
        )

        if remote_status != "succeeded":
            _mark_past_due(locked)
            return False

        locked.current_period_end += SUBSCRIPTION_PERIOD
        locked.status = Subscription.Status.ACTIVE
        locked.save(
            update_fields=["current_period_end", "status", "updated_at"]
        )
        return True


def _mark_past_due(subscription: Subscription) -> None:
    subscription.status = Subscription.Status.PAST_DUE
    subscription.save(update_fields=["status", "updated_at"])
    subscription.user.tier = User.Tier.FREE
    subscription.user.save(update_fields=["tier"])
