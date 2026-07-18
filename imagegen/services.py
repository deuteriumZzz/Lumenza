from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Optional

from django.db import transaction
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    grant_credits,
    usd_to_credits,
)
from imagegen.models import GeneratedImage
from imagegen.pricing import estimate_image_cost_usd
from imagegen.tasks import generate_image_task

# Public provider key (from ImageRequestSerializer, and the Telegram bot's
# own provider choice) -> (adapter registry key, model).
IMAGE_ROUTES = {
    "openai": ("openai", "dall-e-3"),
    "flux": ("replicate", "flux-schnell"),
}


@dataclass
class StartImageOutcome:
    status: Literal["accepted", "insufficient_credits", "enqueue_failed"]
    record: Optional[GeneratedImage] = None


def start_image_generation(
    user, prompt: str, provider_key: str, telegram_chat_id: Optional[int] = None
) -> StartImageOutcome:
    """Shared by the /api/images/ view and the Telegram bot. Reserves the
    credit hold and enqueues the Celery task; the task itself (imagegen/
    tasks.py) does moderation + generation + reconciliation out of band."""
    provider_name, model = IMAGE_ROUTES[provider_key]

    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_image_cost_usd(model))

    # Charge the hold and create the record as one unit: if either the
    # charge or the row creation raises, nothing is left half-done.
    try:
        with transaction.atomic():
            charge_credits(user, hold_credits, reason=LedgerEntry.Reason.IMAGE_REQUEST)
            record = GeneratedImage.objects.create(
                user=user,
                prompt=prompt,
                provider=provider_name,
                model=model,
                status=GeneratedImage.Status.PENDING,
                credits_charged=hold_credits,
                telegram_chat_id=telegram_chat_id,
            )
    except InsufficientCreditsError:
        return StartImageOutcome(status="insufficient_credits")

    # The charge+create transaction above has already committed by this
    # point, so the worker can safely see the row. If enqueueing itself
    # fails (broker down, etc.), the record would otherwise sit charged
    # and PENDING forever with nothing to ever process it — refund and
    # mark it failed synchronously instead of leaving that behind.
    try:
        generate_image_task.delay(record.id)
    except Exception:
        grant_credits(user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        record.status = GeneratedImage.Status.ERROR
        record.credits_charged = Decimal("0")
        record.error_message = "Failed to enqueue image generation"
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "credits_charged", "error_message", "completed_at"])
        return StartImageOutcome(status="enqueue_failed", record=record)

    return StartImageOutcome(status="accepted", record=record)
