import json

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billing.models import LedgerEntry
from billing.serializers import (
    CreditAccountSerializer,
    PaymentSerializer,
    SandboxTopupSerializer,
    TopupRequestSerializer,
)
from billing.services import confirm_topup, get_or_create_account, grant_credits, start_topup
from billing.throttling import SandboxTopupRateThrottle, TopupRateThrottle


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def balance(request):
    account = get_or_create_account(request.user)
    return Response(CreditAccountSerializer(account).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([SandboxTopupRateThrottle])
def sandbox_topup(request):
    # Stub top-up for local/dev use only, ahead of the real YooKassa
    # integration (Phase 6). Never enable outside DEBUG — this mints
    # credits with no payment behind them. Throttled independently of the
    # enable flag: even an intentionally-enabled sandbox shouldn't let one
    # account mint unlimited credits in a tight loop.
    if not settings.SANDBOX_TOPUP_ENABLED:
        return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = SandboxTopupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    account = grant_credits(
        request.user, serializer.validated_data["amount"], reason=LedgerEntry.Reason.TOPUP
    )
    return Response(CreditAccountSerializer(account).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([TopupRateThrottle])
def topup(request):
    serializer = TopupRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_topup(request.user, serializer.validated_data["amount_rub"])

    if outcome.status == "unavailable":
        return Response(
            {"detail": "Real top-up is not available right now"},
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
    # No shared-secret URL path here (contrast bot/views.py's Telegram
    # webhook): confirm_topup() re-fetches the payment straight from
    # YooKassa using our own secret key rather than trusting this request's
    # body, so a forged POST can't fabricate a fake "succeeded" status —
    # see the docstring on billing/yookassa_client.get_payment.
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    payment_id = payload.get("object", {}).get("id")
    if not payment_id:
        return HttpResponse(status=400)

    # Idempotency already makes repeat deliveries free of billing risk, but
    # nothing capped how many times a caller who knows a valid payment id
    # could force an outbound API call to YooKassa on every hit — this
    # bounds that resource/quota drain without needing to distinguish real
    # retries from abuse.
    cache_key = f"yookassa_webhook_rl:{payment_id}"
    attempts = cache.get(cache_key, 0) + 1
    cache.set(cache_key, attempts, timeout=WEBHOOK_RATE_LIMIT_WINDOW_SECONDS)
    if attempts > WEBHOOK_RATE_LIMIT_PER_PAYMENT:
        return HttpResponse(status=429)

    outcome = confirm_topup(payment_id)
    if outcome.status == "provider_error":
        # Transient failure reaching YooKassa ourselves — ask it to retry
        # the notification later rather than silently swallowing it.
        return HttpResponse(status=502)

    return HttpResponse(status=200)
