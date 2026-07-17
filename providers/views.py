from decimal import Decimal

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billing.models import LedgerEntry
from billing.services import InsufficientCreditsError, charge_credits, get_or_create_account, grant_credits, usd_to_credits
from providers.models import RequestLog
from providers.pricing import estimate_max_cost_usd
from providers.registry import get_adapter
from providers.serializers import ChatRequestSerializer, RequestLogSerializer

# Each mode routes to a primary (provider, model) and an ordered list of
# fallbacks, tried in turn if the primary (or an earlier fallback) raises.
# fast: quickest turnaround. smart: most capable. cheap: lowest cost per token.
MODE_ROUTES = {
    "fast": [("openai", "gpt-4o-mini"), ("anthropic", "claude-3-5-sonnet-latest")],
    "smart": [("anthropic", "claude-3-5-sonnet-latest"), ("openai", "gpt-4o-mini")],
    "cheap": [("google", "gemini-1.5-flash"), ("openai", "gpt-4o-mini")],
}

# Cap on persisted third-party error text: keeps RequestLog rows bounded and
# reduces the chance of an unusually verbose SDK exception (e.g. one that
# echoes request details) ending up stored and shown in the admin verbatim.
ERROR_MESSAGE_MAX_LEN = 500


def _route_hold_credits(routes, prompt):
    # A hold sized only for the primary route could fall short if a pricier
    # fallback ends up being the one that actually succeeds, so size it for
    # the most expensive candidate in the whole route instead.
    max_cost_usd = max(
        estimate_max_cost_usd(model, len(prompt), get_adapter(provider_name).max_completion_tokens)
        for provider_name, model in routes
    )
    return usd_to_credits(max_cost_usd)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    prompt = serializer.validated_data["prompt"]
    mode = serializer.validated_data["mode"]
    routes = MODE_ROUTES[mode]

    get_or_create_account(request.user)
    hold_credits = _route_hold_credits(routes, prompt)

    try:
        account = charge_credits(request.user, hold_credits, reason=LedgerEntry.Reason.CHAT_REQUEST)
    except InsufficientCreditsError:
        RequestLog.objects.create(
            user=request.user,
            provider=routes[0][0],
            model=routes[0][1],
            mode=mode,
            status=RequestLog.Status.INSUFFICIENT_CREDITS,
        )
        return Response({"detail": "Insufficient credits"}, status=status.HTTP_402_PAYMENT_REQUIRED)

    result = None
    provider_name = model = None
    errors = []
    for attempt_index, (provider_name, model) in enumerate(routes):
        adapter = get_adapter(provider_name)
        try:
            result = adapter.complete(prompt, model=model)
            break
        except Exception as exc:
            errors.append(f"{provider_name}/{model}: {exc}")

    error_message = " | ".join(errors)[:ERROR_MESSAGE_MAX_LEN]

    if result is None:
        account = grant_credits(request.user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        # Attribute the failure to the route's primary (not whichever
        # candidate happened to run last) so provider-reliability reporting
        # groups by "which route failed" rather than "which fallback also
        # failed" — error_message still has every attempt's detail.
        RequestLog.objects.create(
            user=request.user,
            provider=routes[0][0],
            model=routes[0][1],
            mode=mode,
            status=RequestLog.Status.ERROR,
            error_message=error_message,
            used_fallback=attempt_index > 0,
        )
        return Response({"detail": "Provider error"}, status=status.HTTP_502_BAD_GATEWAY)

    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        account = grant_credits(request.user, refund, reason=LedgerEntry.Reason.REFUND)

    used_fallback = attempt_index > 0
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
        used_fallback=used_fallback,
        error_message=error_message,
    )

    return Response(
        {
            "text": result.text,
            "provider": provider_name,
            "model": model,
            "mocked": result.mocked,
            "used_fallback": used_fallback,
            "credits_charged": str(actual_credits),
            "balance": str(account.balance),
        }
    )


class HistoryPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class ChatHistoryView(generics.ListAPIView):
    serializer_class = RequestLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = HistoryPagination

    def get_queryset(self):
        return RequestLog.objects.filter(user=self.request.user)
