import re
from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import claim_pending_record, grant_credits
from billing.services import refund_hold as _refund_hold
from billing.services import usd_to_credits
from core.constants import ERROR_MESSAGE_MAX_LEN
from imagegen.models import GeneratedImage
from imagegen.moderation import ModerationBlocked, check_prompt
from imagegen.registry import get_image_adapter
from imagegen.telegram_notify import notify_image_failed, notify_image_ready
from progression.services import check_and_unlock
from referrals.services import check_referral_reward


_CYRILLIC_RE = re.compile(r"[а-яА-ЯёЁ]")


def _translate_prompt_to_english(prompt: str) -> str:
    """Картиночные адаптеры (DALL-E 3, Replicate flux-schnell, NVIDIA
    flux.1-dev) обучены почти целиком на английских подписях и дают
    плохой/нерелевантный результат на русских промптах, хотя сам продукт
    русскоязычный — переводим перед генерацией, но `record.prompt`
    остаётся на языке пользователя для его собственной истории."""
    if not _CYRILLIC_RE.search(prompt):
        return prompt
    try:
        from providers.registry import get_adapter

        result = get_adapter("nvidia").complete(
            "Translate the following image generation prompt to English. "
            f"Reply with ONLY the translated prompt, no commentary:\n\n{prompt}",
            model="nvidia/nvidia-nemotron-nano-9b-v2",
        )
        return result.text.strip() or prompt
    except Exception:
        # Перевод — это удобство, а не обязательное условие: сбой
        # перевода не должен блокировать саму генерацию картинки.
        return prompt


def _claim(image_id: int) -> "GeneratedImage | None":
    return claim_pending_record(GeneratedImage, image_id)


def _fail_blocked(record: GeneratedImage, exc: Exception) -> None:
    from core.services import flag_repeated_moderation_blocks

    _refund_hold(record)
    record.status = GeneratedImage.Status.BLOCKED
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
    if record.telegram_chat_id:
        notify_image_failed(
            record.telegram_chat_id, "That prompt was blocked by moderation."
        )


def _fail_provider_error(
    record: GeneratedImage, exc: Exception, message: str
) -> None:
    _refund_hold(record)
    record.status = GeneratedImage.Status.ERROR
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
        notify_image_failed(record.telegram_chat_id, message)


def _succeed(record: GeneratedImage, result) -> None:
    hold_credits = record.credits_charged
    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        grant_credits(record.user, refund, reason=LedgerEntry.Reason.REFUND)

    record.image.save(
        f"{record.id}.png", ContentFile(result.image_bytes), save=False
    )
    record.status = GeneratedImage.Status.OK
    record.cost_usd = Decimal(str(result.cost_usd))
    record.credits_charged = actual_credits
    record.mocked = result.mocked
    record.completed_at = timezone.now()
    record.save()
    check_and_unlock(record.user)
    check_referral_reward(record.user)

    if record.telegram_chat_id:
        image_url = f"{settings.PUBLIC_BASE_URL}{record.image.url}"
        notify_image_ready(record.telegram_chat_id, image_url, record.prompt)


def generate_image(image_id: int) -> None:
    record = _claim(image_id)
    if record is None:
        return

    try:
        check_prompt(record.prompt)
    except ModerationBlocked as exc:
        _fail_blocked(record, exc)
        return

    adapter = get_image_adapter(record.provider)
    try:
        result = adapter.generate(
            _translate_prompt_to_english(record.prompt), model=record.model
        )
    except Exception as exc:
        _fail_provider_error(
            record, exc, "Sorry, image generation failed. Credits refunded."
        )
        return

    _succeed(record, result)


def edit_image(image_id: int) -> None:
    record = _claim(image_id)
    if record is None:
        return

    try:
        check_prompt(record.prompt)
    except ModerationBlocked as exc:
        _fail_blocked(record, exc)
        return

    adapter = get_image_adapter(record.provider)
    try:
        with record.source_image.open("rb") as source_file:
            source_bytes = source_file.read()
        result = adapter.edit(
            _translate_prompt_to_english(record.prompt),
            source_bytes,
            model=record.model,
        )
    except Exception as exc:
        _fail_provider_error(
            record, exc, "Sorry, image editing failed. Credits refunded."
        )
        return

    _succeed(record, result)


generate_image_task = shared_task(name="imagegen.generate_image")(
    generate_image
)
edit_image_task = shared_task(name="imagegen.edit_image")(edit_image)
