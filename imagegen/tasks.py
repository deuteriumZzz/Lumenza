from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import grant_credits, usd_to_credits
from imagegen.models import GeneratedImage
from imagegen.moderation import ModerationBlocked, check_prompt
from imagegen.registry import get_image_adapter
from imagegen.telegram_notify import notify_image_failed, notify_image_ready

ERROR_MESSAGE_MAX_LEN = 500


def _refund_hold(record: GeneratedImage) -> None:
    if record.credits_charged > 0:
        grant_credits(record.user, record.credits_charged, reason=LedgerEntry.Reason.REFUND)
        record.credits_charged = Decimal("0")


def _claim(image_id: int) -> "GeneratedImage | None":
    # Celery's default acks_late=False already means a crashed worker just
    # loses the message rather than redelivering it, but that default is
    # exactly the kind of thing that gets flipped for a paid workload later.
    # Claim the row (PENDING -> PROCESSING) under a row lock so a duplicate
    # delivery of this task is a safe no-op instead of a double refund /
    # double charge: whichever delivery loses the race sees a non-PENDING
    # status and returns immediately. The lock is held only for this quick
    # claim, not for the slow provider call below.
    with transaction.atomic():
        record = (
            GeneratedImage.objects.select_for_update().select_related("user").get(id=image_id)
        )
        if record.status != GeneratedImage.Status.PENDING:
            return None
        record.status = GeneratedImage.Status.PROCESSING
        record.save(update_fields=["status"])
    return record


def generate_image(image_id: int) -> None:
    record = _claim(image_id)
    if record is None:
        return

    try:
        check_prompt(record.prompt)
    except ModerationBlocked as exc:
        _refund_hold(record)
        record.status = GeneratedImage.Status.BLOCKED
        record.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "error_message", "credits_charged", "completed_at"])
        if record.telegram_chat_id:
            notify_image_failed(record.telegram_chat_id, "That prompt was blocked by moderation.")
        return

    adapter = get_image_adapter(record.provider)
    try:
        result = adapter.generate(record.prompt, model=record.model)
    except Exception as exc:
        _refund_hold(record)
        record.status = GeneratedImage.Status.ERROR
        record.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "error_message", "credits_charged", "completed_at"])
        if record.telegram_chat_id:
            notify_image_failed(record.telegram_chat_id, "Sorry, image generation failed. Credits refunded.")
        return

    hold_credits = record.credits_charged
    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        grant_credits(record.user, refund, reason=LedgerEntry.Reason.REFUND)

    record.image.save(f"{record.id}.png", ContentFile(result.image_bytes), save=False)
    record.status = GeneratedImage.Status.OK
    record.cost_usd = Decimal(str(result.cost_usd))
    record.credits_charged = actual_credits
    record.mocked = result.mocked
    record.completed_at = timezone.now()
    record.save()

    if record.telegram_chat_id:
        image_url = f"{settings.PUBLIC_BASE_URL}{record.image.url}"
        notify_image_ready(record.telegram_chat_id, image_url, record.prompt)


generate_image_task = shared_task(name="imagegen.generate_image")(generate_image)
