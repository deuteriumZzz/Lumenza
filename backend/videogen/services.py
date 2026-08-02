from dataclasses import dataclass
from typing import Literal, Optional

from django.db import transaction

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    usd_to_credits,
)
from core.enqueue import try_enqueue_or_refund
from progression.services import get_unlocked_keys
from videogen.models import GeneratedVideo
from videogen.pricing import estimate_video_cost_usd
from videogen.replicate_video_adapter import (
    IMAGE_TO_VIDEO_MODEL,
    TEXT_TO_VIDEO_MODEL,
)
from videogen.tasks import animate_video_task, generate_video_task

PROVIDER = "replicate"


@dataclass
class StartVideoOutcome:
    status: Literal[
        "accepted", "insufficient_credits", "enqueue_failed", "task_locked"
    ]
    record: Optional[GeneratedVideo] = None


def start_video_generation(user, prompt: str) -> StartVideoOutcome:
    """Текст-в-видео (карточка "Text to video"). Та же схема резерв/сверка,
    что и imagegen.services.start_image_generation."""
    task = "video"
    if task not in get_unlocked_keys(user):
        return StartVideoOutcome(status="task_locked")

    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_video_cost_usd(TEXT_TO_VIDEO_MODEL))

    try:
        with transaction.atomic():
            charge_credits(
                user, hold_credits, reason=LedgerEntry.Reason.VIDEO_REQUEST
            )
            record = GeneratedVideo.objects.create(
                user=user,
                prompt=prompt,
                provider=PROVIDER,
                model=TEXT_TO_VIDEO_MODEL,
                status=GeneratedVideo.Status.PENDING,
                credits_charged=hold_credits,
            )
    except InsufficientCreditsError:
        return StartVideoOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        generate_video_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue video generation",
    ):
        return StartVideoOutcome(status="enqueue_failed", record=record)

    return StartVideoOutcome(status="accepted", record=record)


def start_video_animation(
    user, prompt: str, source_image_file
) -> StartVideoOutcome:
    """Картинка-в-видео (карточка "Starting frame")."""
    task = "video_i2v"
    if task not in get_unlocked_keys(user):
        return StartVideoOutcome(status="task_locked")

    get_or_create_account(user)
    hold_credits = usd_to_credits(
        estimate_video_cost_usd(IMAGE_TO_VIDEO_MODEL)
    )

    try:
        with transaction.atomic():
            charge_credits(
                user, hold_credits, reason=LedgerEntry.Reason.VIDEO_REQUEST
            )
            record = GeneratedVideo.objects.create(
                user=user,
                prompt=prompt,
                provider=PROVIDER,
                model=IMAGE_TO_VIDEO_MODEL,
                status=GeneratedVideo.Status.PENDING,
                credits_charged=hold_credits,
                source_image=source_image_file,
            )
    except InsufficientCreditsError:
        return StartVideoOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        animate_video_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue video animation",
    ):
        return StartVideoOutcome(status="enqueue_failed", record=record)

    return StartVideoOutcome(status="accepted", record=record)
