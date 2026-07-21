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
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)
from media_ops.pricing import (
    estimate_document_cost_usd,
    estimate_photo_analysis_cost_usd,
    estimate_speech_cost_usd,
    estimate_transcription_cost_usd,
)
from media_ops.tasks import (
    analyze_photo_task,
    extract_document_task,
    synthesize_speech_task,
    transcribe_audio_task,
)
from progression.services import get_unlocked_keys

# Пока маршруты с одной моделью — у каждой модальности ровно одна
# подобранная вручную модель NVIDIA. Хранится как словарь (не
# как простая константа) по той же причине, что и providers.TASK_ROUTES/
# imagegen.IMAGE_TASK_ROUTES: место для добавления второго подобранного
# кандидата позже без изменения соглашения о вызове.
TRANSCRIPTION_ROUTES = {"voice_to_text": ("nvidia", "nvidia/canary-1b-asr")}
SPEECH_ROUTES = {"text_to_voice": ("nvidia", "nvidia/magpie-tts-multilingual")}
DOCUMENT_ROUTES = {
    "document_to_text": ("nvidia", "nvidia/nemoretriever-parse")
}
PHOTO_ANALYSIS_ROUTES = {
    "photo_to_caption": ("nvidia", "nvidia/llama-3.1-nemotron-nano-vl-8b-v1")
}


@dataclass
class StartMediaOutcome:
    status: Literal[
        "accepted", "insufficient_credits", "enqueue_failed", "task_locked"
    ]
    record: Optional[object] = None


def start_transcription(
    user, audio_file, telegram_chat_id: Optional[int] = None
) -> StartMediaOutcome:
    task = "voice_to_text"
    if task not in get_unlocked_keys(user):
        return StartMediaOutcome(status="task_locked")

    provider_name, model = TRANSCRIPTION_ROUTES[task]
    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_transcription_cost_usd(model))

    try:
        with transaction.atomic():
            charge_credits(
                user,
                hold_credits,
                reason=LedgerEntry.Reason.TRANSCRIPTION_REQUEST,
            )
            record = Transcription.objects.create(
                user=user,
                audio=audio_file,
                provider=provider_name,
                model=model,
                status=Transcription.Status.PENDING,
                credits_charged=hold_credits,
                telegram_chat_id=telegram_chat_id,
            )
    except InsufficientCreditsError:
        return StartMediaOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        transcribe_audio_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue processing",
    ):
        return StartMediaOutcome(status="enqueue_failed", record=record)

    return StartMediaOutcome(status="accepted", record=record)


def start_speech(
    user, text: str, telegram_chat_id: Optional[int] = None
) -> StartMediaOutcome:
    task = "text_to_voice"
    if task not in get_unlocked_keys(user):
        return StartMediaOutcome(status="task_locked")

    provider_name, model = SPEECH_ROUTES[task]
    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_speech_cost_usd(model))

    try:
        with transaction.atomic():
            charge_credits(
                user, hold_credits, reason=LedgerEntry.Reason.SPEECH_REQUEST
            )
            record = SpeechClip.objects.create(
                user=user,
                text=text,
                provider=provider_name,
                model=model,
                status=SpeechClip.Status.PENDING,
                credits_charged=hold_credits,
                telegram_chat_id=telegram_chat_id,
            )
    except InsufficientCreditsError:
        return StartMediaOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        synthesize_speech_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue processing",
    ):
        return StartMediaOutcome(status="enqueue_failed", record=record)

    return StartMediaOutcome(status="accepted", record=record)


def start_document_extraction(
    user, document_file, telegram_chat_id: Optional[int] = None
) -> StartMediaOutcome:
    task = "document_to_text"
    if task not in get_unlocked_keys(user):
        return StartMediaOutcome(status="task_locked")

    provider_name, model = DOCUMENT_ROUTES[task]
    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_document_cost_usd(model))

    try:
        with transaction.atomic():
            charge_credits(
                user, hold_credits, reason=LedgerEntry.Reason.DOCUMENT_REQUEST
            )
            record = DocumentExtraction.objects.create(
                user=user,
                document=document_file,
                provider=provider_name,
                model=model,
                status=DocumentExtraction.Status.PENDING,
                credits_charged=hold_credits,
                telegram_chat_id=telegram_chat_id,
            )
    except InsufficientCreditsError:
        return StartMediaOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        extract_document_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue processing",
    ):
        return StartMediaOutcome(status="enqueue_failed", record=record)

    return StartMediaOutcome(status="accepted", record=record)


def start_photo_analysis(
    user, image_file, telegram_chat_id: Optional[int] = None
) -> StartMediaOutcome:
    task = "photo_to_caption"
    if task not in get_unlocked_keys(user):
        return StartMediaOutcome(status="task_locked")

    provider_name, model = PHOTO_ANALYSIS_ROUTES[task]
    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_photo_analysis_cost_usd(model))

    try:
        with transaction.atomic():
            charge_credits(
                user,
                hold_credits,
                reason=LedgerEntry.Reason.PHOTO_ANALYSIS_REQUEST,
            )
            record = PhotoAnalysis.objects.create(
                user=user,
                image=image_file,
                provider=provider_name,
                model=model,
                status=PhotoAnalysis.Status.PENDING,
                credits_charged=hold_credits,
                telegram_chat_id=telegram_chat_id,
            )
    except InsufficientCreditsError:
        return StartMediaOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        analyze_photo_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue processing",
    ):
        return StartMediaOutcome(status="enqueue_failed", record=record)

    return StartMediaOutcome(status="accepted", record=record)
