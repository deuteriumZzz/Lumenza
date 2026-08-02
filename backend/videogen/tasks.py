from decimal import Decimal

from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import claim_pending_record, grant_credits
from billing.services import refund_hold as _refund_hold
from billing.services import usd_to_credits
from core.constants import ERROR_MESSAGE_MAX_LEN
from core.moderation import ModerationBlocked, check_prompt
from core.translation import translate_prompt_to_english
from progression.services import check_and_unlock
from referrals.services import check_referral_reward
from videogen.models import GeneratedVideo
from videogen.registry import get_video_adapter


def _claim(video_id: int) -> "GeneratedVideo | None":
    return claim_pending_record(GeneratedVideo, video_id)


def _fail_blocked(record: GeneratedVideo, exc: Exception) -> None:
    from core.services import flag_repeated_moderation_blocks

    _refund_hold(record)
    record.status = GeneratedVideo.Status.BLOCKED
    record.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
    record.completed_at = timezone.now()
    record.save(
        update_fields=[
            "status",
            "error_message",
            "credits_charged",
            "completed_at",
        ]
    )
    flag_repeated_moderation_blocks(record.user)


def _fail_provider_error(
    record: GeneratedVideo, exc: Exception, message: str
) -> None:
    _refund_hold(record)
    record.status = GeneratedVideo.Status.ERROR
    record.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
    record.completed_at = timezone.now()
    record.save(
        update_fields=[
            "status",
            "error_message",
            "credits_charged",
            "completed_at",
        ]
    )


def _succeed(record: GeneratedVideo, result) -> None:
    hold_credits = record.credits_charged
    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        grant_credits(record.user, refund, reason=LedgerEntry.Reason.REFUND)

    extension = "gif" if result.mocked else "mp4"
    record.video.save(
        f"{record.id}.{extension}", ContentFile(result.video_bytes), save=False
    )
    record.status = GeneratedVideo.Status.OK
    record.cost_usd = Decimal(str(result.cost_usd))
    record.credits_charged = actual_credits
    record.mocked = result.mocked
    record.completed_at = timezone.now()
    record.save()
    check_and_unlock(record.user)
    check_referral_reward(record.user)


def generate_video(video_id: int) -> None:
    record = _claim(video_id)
    if record is None:
        return

    try:
        check_prompt(record.prompt)
    except ModerationBlocked as exc:
        _fail_blocked(record, exc)
        return

    adapter = get_video_adapter(record.provider)
    try:
        result = adapter.generate(
            translate_prompt_to_english(record.prompt), model=record.model
        )
    except Exception as exc:
        _fail_provider_error(
            record, exc, "Sorry, video generation failed. Credits refunded."
        )
        return

    _succeed(record, result)


def animate_video(video_id: int) -> None:
    record = _claim(video_id)
    if record is None:
        return

    try:
        check_prompt(record.prompt)
    except ModerationBlocked as exc:
        _fail_blocked(record, exc)
        return

    adapter = get_video_adapter(record.provider)
    try:
        with record.source_image.open("rb") as source_file:
            source_bytes = source_file.read()
        result = adapter.generate_from_image(
            translate_prompt_to_english(record.prompt),
            source_bytes,
            model=record.model,
        )
    except Exception as exc:
        _fail_provider_error(
            record, exc, "Sorry, video animation failed. Credits refunded."
        )
        return

    _succeed(record, result)


generate_video_task = shared_task(name="videogen.generate_video")(
    generate_video
)
animate_video_task = shared_task(name="videogen.animate_video")(
    animate_video
)
