from decimal import Decimal

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billing.models import LedgerEntry
from billing.services import InsufficientCreditsError, charge_credits, get_or_create_account, grant_credits, usd_to_credits
from providers.models import RequestLog
from providers.pricing import estimate_max_cost_usd
from providers.registry import get_adapter
from providers.serializers import ChatRequestSerializer

# Phase 1: single provider behind all three modes. Phase 2 wires distinct
# provider/model choices per mode plus fallback on provider failure.
MODE_MODEL_MAP = {
    "fast": ("openai", "gpt-4o-mini"),
    "smart": ("openai", "gpt-4o-mini"),
    "cheap": ("openai", "gpt-4o-mini"),
}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    prompt = serializer.validated_data["prompt"]
    mode = serializer.validated_data["mode"]
    provider_name, model = MODE_MODEL_MAP[mode]

    get_or_create_account(request.user)
    adapter = get_adapter(provider_name)

    # Reserve a conservative worst-case charge *before* calling the (paid)
    # provider. This closes two gaps a post-hoc-only charge leaves open: a
    # request whose real cost the account can never cover would otherwise
    # reach the provider on every single call (charge always fails, balance
    # never moves, spend is unbounded); and without a committed hold here,
    # two concurrent requests on a near-empty account could both pass a
    # simple balance check before either one charges.
    max_cost_usd = estimate_max_cost_usd(model, len(prompt), adapter.max_completion_tokens)
    hold_credits = usd_to_credits(max_cost_usd)

    try:
        account = charge_credits(request.user, hold_credits, reason=LedgerEntry.Reason.CHAT_REQUEST)
    except InsufficientCreditsError:
        RequestLog.objects.create(
            user=request.user,
            provider=provider_name,
            model=model,
            mode=mode,
            status=RequestLog.Status.INSUFFICIENT_CREDITS,
        )
        return Response({"detail": "Insufficient credits"}, status=status.HTTP_402_PAYMENT_REQUIRED)

    try:
        result = adapter.complete(prompt, model=model)
    except Exception as exc:
        account = grant_credits(request.user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        RequestLog.objects.create(
            user=request.user,
            provider=provider_name,
            model=model,
            mode=mode,
            status=RequestLog.Status.ERROR,
            error_message=str(exc),
        )
        return Response({"detail": "Provider error"}, status=status.HTTP_502_BAD_GATEWAY)

    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        account = grant_credits(request.user, refund, reason=LedgerEntry.Reason.REFUND)

    RequestLog.objects.create(
        user=request.user,
        provider=provider_name,
        model=model,
        mode=mode,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        cost_usd=Decimal(str(result.cost_usd)),
        credits_charged=actual_credits,
        latency_ms=result.latency_ms,
        status=RequestLog.Status.OK,
        mocked=result.mocked,
    )

    return Response(
        {
            "text": result.text,
            "provider": provider_name,
            "model": model,
            "mocked": result.mocked,
            "credits_charged": str(actual_credits),
            "balance": str(account.balance),
        }
    )
