import time
from decimal import Decimal

from celery import shared_task
from django.db import transaction

from core.constants import ERROR_MESSAGE_MAX_LEN
from providers.models import Message, Thread
from providers.registry import get_adapter
from providers.services import (
    FALLBACK_BUDGET_SECONDS,
    _finalize_provider_failure,
    _finalize_provider_success,
)
from providers.streaming import append_delta, mark_done, mark_error


def stream_chat_task(
    generation_id: str,
    user_id: int,
    prompt: str,
    task: str,
    system: str | None,
    temperature: float | None,
    routes: list,
    hold_credits_str: str,
    thread_id: int | None = None,
) -> None:
    """Runs the same provider fallback loop as providers.services.run_chat,
    but through adapter.stream_complete() instead of complete(), writing
    each delta into the generation buffer as it arrives — reused
    unmodified: routing/credit hold already happened synchronously in
    start_chat_stream() before this task was even enqueued, and the
    refund/RequestLog finalize logic below is the exact same code run_chat
    itself uses. Only persists Message rows on success, matching
    thread_message()'s existing behavior."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.get(pk=user_id)
    hold_credits = Decimal(hold_credits_str)

    result = None
    provider_name = matched_model = None
    errors = []
    attempt_index = 0
    fallback_started_at = time.monotonic()
    for attempt_index, (provider_name, matched_model) in enumerate(routes):
        if (
            attempt_index > 0
            and time.monotonic() - fallback_started_at
            > FALLBACK_BUDGET_SECONDS
        ):
            remaining = len(routes) - attempt_index
            errors.append(
                f"fallback budget of {FALLBACK_BUDGET_SECONDS}s "
                f"exceeded, {remaining} route(s) not attempted"
            )
            break
        adapter = get_adapter(provider_name)
        try:
            result = adapter.stream_complete(
                prompt,
                on_delta=lambda delta: append_delta(generation_id, delta),
                model=matched_model,
                system=system,
                temperature=temperature,
            )
            break
        except Exception as exc:
            errors.append(f"{provider_name}/{matched_model}: {exc}")

    error_message = " | ".join(errors)[:ERROR_MESSAGE_MAX_LEN]

    if result is None:
        _finalize_provider_failure(
            user, task, routes, hold_credits, error_message, attempt_index > 0
        )
        if thread_id is not None:
            Thread.objects.filter(id=thread_id).update(
                active_generation_id=None
            )
        mark_error(
            generation_id,
            {"code": "provider_error", "detail": error_message},
        )
        return

    actual_credits, account = _finalize_provider_success(
        user,
        task,
        provider_name,
        matched_model,
        result,
        hold_credits,
        attempt_index > 0,
        error_message,
    )

    if thread_id is not None:
        from providers.views import THREAD_TITLE_LENGTH

        with transaction.atomic():
            Message.objects.create(
                thread_id=thread_id, role=Message.Role.USER, text=prompt
            )
            Message.objects.create(
                thread_id=thread_id,
                role=Message.Role.ASSISTANT,
                text=result.text,
                provider=provider_name,
                model=matched_model,
                task=task or "",
                mocked=result.mocked,
                used_fallback=attempt_index > 0,
                credits_charged=actual_credits,
            )
            thread = Thread.objects.get(id=thread_id)
            if not thread.title:
                thread.title = prompt[:THREAD_TITLE_LENGTH]
            thread.active_generation_id = None
            thread.save()

    mark_done(
        generation_id,
        {
            "text": result.text,
            "provider": provider_name,
            "model": matched_model,
            "task": task,
            "mocked": result.mocked,
            "used_fallback": attempt_index > 0,
            "credits_charged": str(actual_credits),
            "balance": str(account.balance),
        },
    )


stream_chat_task = shared_task(name="providers.stream_chat")(stream_chat_task)
