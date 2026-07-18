from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Optional

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    grant_credits,
    usd_to_credits,
)
from core.moderation import ModerationBlocked, check_prompt
from providers.models import RequestLog
from providers.pricing import estimate_max_cost_usd
from providers.registry import get_adapter

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


@dataclass
class ChatOutcome:
    status: Literal["ok", "insufficient_credits", "provider_error", "blocked"]
    text: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    mocked: bool = False
    used_fallback: bool = False
    credits_charged: Optional[Decimal] = None
    balance: Optional[Decimal] = None


def _route_hold_credits(routes, prompt):
    # A hold sized only for the primary route could fall short if a pricier
    # fallback ends up being the one that actually succeeds, so size it for
    # the most expensive candidate in the whole route instead.
    max_cost_usd = max(
        estimate_max_cost_usd(model, len(prompt), get_adapter(provider_name).max_completion_tokens)
        for provider_name, model in routes
    )
    return usd_to_credits(max_cost_usd)


def run_chat(user, prompt: str, mode: str) -> ChatOutcome:
    """Shared by the /api/chat/ view and the Telegram bot — the only two
    callers of the provider layer — so the hold/reconcile billing logic
    exists in exactly one place."""
    routes = MODE_ROUTES[mode]

    # Checked before touching credits at all, and before any provider is
    # called — a blocked prompt never costs the user a hold/refund cycle
    # and never costs us a paid provider call.
    try:
        check_prompt(prompt)
    except ModerationBlocked as exc:
        from core.services import flag_repeated_moderation_blocks

        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            mode=mode,
            status=RequestLog.Status.BLOCKED,
            error_message=str(exc)[:ERROR_MESSAGE_MAX_LEN],
        )
        flag_repeated_moderation_blocks(user)
        return ChatOutcome(status="blocked")

    get_or_create_account(user)
    hold_credits = _route_hold_credits(routes, prompt)

    try:
        account = charge_credits(user, hold_credits, reason=LedgerEntry.Reason.CHAT_REQUEST)
    except InsufficientCreditsError:
        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            mode=mode,
            status=RequestLog.Status.INSUFFICIENT_CREDITS,
        )
        return ChatOutcome(status="insufficient_credits")

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
        grant_credits(user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        # Attribute the failure to the route's primary (not whichever
        # candidate happened to run last) so provider-reliability reporting
        # groups by "which route failed" rather than "which fallback also
        # failed" — error_message still has every attempt's detail.
        RequestLog.objects.create(
            user=user,
            provider=routes[0][0],
            model=routes[0][1],
            mode=mode,
            status=RequestLog.Status.ERROR,
            error_message=error_message,
            used_fallback=attempt_index > 0,
        )
        return ChatOutcome(status="provider_error")

    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        account = grant_credits(user, refund, reason=LedgerEntry.Reason.REFUND)

    used_fallback = attempt_index > 0
    RequestLog.objects.create(
        user=user,
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

    return ChatOutcome(
        status="ok",
        text=result.text,
        provider=provider_name,
        model=model,
        mocked=result.mocked,
        used_fallback=used_fallback,
        credits_charged=actual_credits,
        balance=account.balance,
    )
