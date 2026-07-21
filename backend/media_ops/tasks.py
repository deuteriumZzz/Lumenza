from decimal import Decimal

from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import claim_pending_record as _claim
from billing.services import grant_credits
from billing.services import refund_hold as _refund_hold
from billing.services import usd_to_credits
from core.constants import ERROR_MESSAGE_MAX_LEN
from core.moderation import ModerationBlocked, check_prompt
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)
from media_ops.nvidia_asr_adapter import NvidiaAsrAdapter
from media_ops.nvidia_ocr_adapter import NvidiaOcrAdapter
from media_ops.nvidia_tts_adapter import NvidiaTtsAdapter
from media_ops.nvidia_vision_adapter import NvidiaVisionAdapter
from media_ops.telegram_notify import (
    notify_document_ready,
    notify_media_failed,
    notify_photo_analysis_ready,
    notify_speech_ready,
    notify_transcription_ready,
)
from referrals.services import check_referral_reward


def transcribe_audio(transcription_id: int) -> None:
    record = _claim(Transcription, transcription_id)
    if record is None:
        return

    try:
        audio_bytes = record.audio.read()
        result = NvidiaAsrAdapter().transcribe(audio_bytes, model=record.model)
    except Exception as exc:
        _refund_hold(record)
        record.status = Transcription.Status.ERROR
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
        if record.telegram_chat_id:
            notify_media_failed(
                record.telegram_chat_id,
                "Sorry, transcription failed. Credits refunded.",
            )
        return

    _reconcile(record, result.cost_usd)
    record.text = result.text
    record.mocked = result.mocked
    record.status = Transcription.Status.OK
    record.completed_at = timezone.now()
    record.save()
    check_referral_reward(record.user)
    if record.telegram_chat_id:
        notify_transcription_ready(record.telegram_chat_id, record.text)


def synthesize_speech(speech_clip_id: int) -> None:
    record = _claim(SpeechClip, speech_clip_id)
    if record is None:
        return

    try:
        check_prompt(record.text)
    except ModerationBlocked as exc:
        _refund_hold(record)
        record.status = SpeechClip.Status.BLOCKED
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
        if record.telegram_chat_id:
            notify_media_failed(
                record.telegram_chat_id, "That text was blocked by moderation."
            )
        return

    try:
        result = NvidiaTtsAdapter().synthesize(record.text, model=record.model)
    except Exception as exc:
        _refund_hold(record)
        record.status = SpeechClip.Status.ERROR
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
        if record.telegram_chat_id:
            notify_media_failed(
                record.telegram_chat_id,
                "Sorry, speech synthesis failed. Credits refunded.",
            )
        return

    _reconcile(record, result.cost_usd)
    record.audio.save(
        f"{record.id}.mp3", ContentFile(result.audio_bytes), save=False
    )
    record.mocked = result.mocked
    record.status = SpeechClip.Status.OK
    record.completed_at = timezone.now()
    record.save()
    check_referral_reward(record.user)
    if record.telegram_chat_id:
        from django.conf import settings

        audio_url = f"{settings.PUBLIC_BASE_URL}{record.audio.url}"
        notify_speech_ready(record.telegram_chat_id, audio_url)


def extract_document(document_extraction_id: int) -> None:
    record = _claim(DocumentExtraction, document_extraction_id)
    if record is None:
        return

    try:
        document_bytes = record.document.read()
        result = NvidiaOcrAdapter().extract(document_bytes, model=record.model)
    except Exception as exc:
        _refund_hold(record)
        record.status = DocumentExtraction.Status.ERROR
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
        if record.telegram_chat_id:
            notify_media_failed(
                record.telegram_chat_id,
                "Sorry, document extraction failed. Credits refunded.",
            )
        return

    _reconcile(record, result.cost_usd)
    record.text = result.text
    record.mocked = result.mocked
    record.status = DocumentExtraction.Status.OK
    record.completed_at = timezone.now()
    record.save()
    check_referral_reward(record.user)
    if record.telegram_chat_id:
        notify_document_ready(record.telegram_chat_id, record.text)


def analyze_photo(photo_analysis_id: int) -> None:
    record = _claim(PhotoAnalysis, photo_analysis_id)
    if record is None:
        return

    try:
        image_bytes = record.image.read()
        result = NvidiaVisionAdapter().analyze(image_bytes, model=record.model)
    except Exception as exc:
        _refund_hold(record)
        record.status = PhotoAnalysis.Status.ERROR
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
        if record.telegram_chat_id:
            notify_media_failed(
                record.telegram_chat_id,
                "Sorry, photo analysis failed. Credits refunded.",
            )
        return

    _reconcile(record, result.cost_usd)
    record.text = result.text
    record.mocked = result.mocked
    record.status = PhotoAnalysis.Status.OK
    record.completed_at = timezone.now()
    record.save()
    check_referral_reward(record.user)
    if record.telegram_chat_id:
        notify_photo_analysis_ready(record.telegram_chat_id, record.text)


def _reconcile(record, cost_usd: float) -> None:
    actual_credits = usd_to_credits(cost_usd)
    refund = record.credits_charged - actual_credits
    if refund > 0:
        grant_credits(record.user, refund, reason=LedgerEntry.Reason.REFUND)
    record.cost_usd = Decimal(str(cost_usd))
    record.credits_charged = actual_credits


transcribe_audio_task = shared_task(name="media_ops.transcribe_audio")(
    transcribe_audio
)
synthesize_speech_task = shared_task(name="media_ops.synthesize_speech")(
    synthesize_speech
)
extract_document_task = shared_task(name="media_ops.extract_document")(
    extract_document
)
analyze_photo_task = shared_task(name="media_ops.analyze_photo")(analyze_photo)
