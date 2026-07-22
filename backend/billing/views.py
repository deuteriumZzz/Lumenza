import json
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billing.models import LedgerEntry, Subscription
from billing.serializers import (
    CreditAccountSerializer,
    PaymentSerializer,
    SandboxTopupSerializer,
    SubscriptionSerializer,
    TopupRequestSerializer,
)
from billing.services import (
    cancel_subscription,
    confirm_payment,
    get_or_create_account,
    grant_credits,
    start_subscription,
    start_topup,
)
from billing.throttling import (
    SandboxTopupRateThrottle,
    SubscriptionRateThrottle,
    TopupRateThrottle,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def balance(request):
    account = get_or_create_account(request.user)
    return Response(CreditAccountSerializer(account).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([SandboxTopupRateThrottle])
def sandbox_topup(request):
    # Заглушка пополнения только для локальной разработки, до реальной
    # интеграции с YooKassa. Никогда не включать вне DEBUG — это
    # начисляет кредиты без реальной оплаты за ними. Ограничение частоты
    # действует независимо от флага включения: даже намеренно включённый
    # sandbox не должен позволять одному аккаунту начислять
    # неограниченные кредиты в тесном цикле.
    if not settings.SANDBOX_TOPUP_ENABLED:
        return Response(
            {"detail": "Не найдено"}, status=status.HTTP_404_NOT_FOUND
        )

    serializer = SandboxTopupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    account = grant_credits(
        request.user,
        serializer.validated_data["amount"],
        reason=LedgerEntry.Reason.TOPUP,
    )
    return Response(
        CreditAccountSerializer(account).data, status=status.HTTP_201_CREATED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([TopupRateThrottle])
def topup(request):
    serializer = TopupRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_topup(
        request.user, serializer.validated_data["amount_rub"]
    )

    if outcome.status == "unavailable":
        return Response(
            {"detail": "Реальное пополнение сейчас недоступно"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    body = PaymentSerializer(outcome.payment).data
    body["confirmation_url"] = outcome.confirmation_url
    return Response(body, status=status.HTTP_201_CREATED)


WEBHOOK_RATE_LIMIT_PER_PAYMENT = 10
WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60


@csrf_exempt
@require_POST
def yookassa_webhook(request):
    # Здесь нет пути URL с общим секретом (в отличие от вебхука Telegram
    # в bot/views.py): confirm_payment() заново запрашивает платёж
    # непосредственно у YooKassa, используя наш собственный секретный
    # ключ, а не доверяет телу этого запроса — так что поддельный POST
    # не может сфабриковать фальшивый статус "succeeded" — см. докстринг
    # у billing/yookassa_client.get_payment. Обрабатывает и пополнения,
    # и платежи по подписке (внутри ветвится по Payment.kind) — YooKassa
    # в обоих случаях присылает уведомление одной и той же формы, просто
    # из разных пространств id платежей.
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    payment_id = payload.get("object", {}).get("id")
    if not payment_id:
        return HttpResponse(status=400)

    # Идемпотентность уже делает повторные доставки безопасными с точки
    # зрения биллинга, но ничто не ограничивало, сколько раз вызывающий,
    # знающий валидный id платежа, мог заставить систему делать
    # исходящий вызов к YooKassa на каждый хит — это ограничивает такую
    # утечку ресурса/квоты без необходимости отличать настоящие повторы
    # от злоупотребления.
    cache_key = f"yookassa_webhook_rl:{payment_id}"
    attempts = cache.get(cache_key, 0) + 1
    cache.set(cache_key, attempts, timeout=WEBHOOK_RATE_LIMIT_WINDOW_SECONDS)
    if attempts > WEBHOOK_RATE_LIMIT_PER_PAYMENT:
        return HttpResponse(status=429)

    outcome = confirm_payment(payment_id)
    if outcome.status == "provider_error":
        # Временный сбой при обращении к самой YooKassa — просим
        # повторить уведомление позже, а не молча его проглатываем.
        return HttpResponse(status=502)

    return HttpResponse(status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def subscription_status(request):
    try:
        subscription = request.user.subscription
    except Subscription.DoesNotExist:
        return Response(None)
    return Response(SubscriptionSerializer(subscription).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([SubscriptionRateThrottle])
def subscribe(request):
    outcome = start_subscription(
        request.user, Decimal(str(settings.PRO_SUBSCRIPTION_PRICE_RUB))
    )

    if outcome.status == "already_subscribed":
        return Response(
            {"detail": "Подписка уже оформлена"}, status=status.HTTP_409_CONFLICT
        )
    if outcome.status == "unavailable":
        return Response(
            {"detail": "Подписки сейчас недоступны"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    body = PaymentSerializer(outcome.payment).data
    body["confirmation_url"] = outcome.confirmation_url
    return Response(body, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def unsubscribe(request):
    canceled = cancel_subscription(request.user)
    if not canceled:
        return Response(
            {"detail": "Нет активной подписки"},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)
