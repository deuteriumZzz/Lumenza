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
from imagegen.models import GeneratedImage
from imagegen.pricing import estimate_image_cost_usd
from imagegen.tasks import edit_image_task, generate_image_task
from progression.services import get_unlocked_keys

# Публичная категория задачи (из ImageRequestSerializer, и собственного
# выбора Telegram-бота) -> (ключ реестра адаптеров, модель).
IMAGE_TASK_ROUTES = {
    "realistic": ("openai", "dall-e-3"),
    "illustration": ("replicate", "flux-schnell"),
    # flux.1-dev от NVIDIA — протестирован вживую, недистиллированная
    # "dev"-версия FLUX: выше качество / медленнее, чем flux-schnell,
    # достаточно универсальная, что не вписалась чётко ни в "realistic",
    # ни в "illustration" конкретно, отсюда собственная категория, а не
    # слот запасного варианта у одной из них (сравнение качества бок о
    # бок пока не проводилось).
    "premium": ("nvidia", "flux.1-dev"),
    # flux.1-kontext-dev — единственная модель изображений NVIDIA,
    # которая принимает входное изображение (редактирование, а не чистая
    # генерация), отсюда собственная задача/точка входа
    # (start_image_edit ниже), а не слот запасного варианта. Про
    # оговорку по схеме запроса см. докстринг в nvidia_image_adapter.py.
    "edit": ("nvidia", "flux.1-kontext-dev"),
}


@dataclass
class StartImageOutcome:
    status: Literal[
        "accepted", "insufficient_credits", "enqueue_failed", "task_locked"
    ]
    record: Optional[GeneratedImage] = None


def start_image_generation(
    user, prompt: str, task: str, telegram_chat_id: Optional[int] = None
) -> StartImageOutcome:
    """Общая функция для /api/images/ и для Telegram-бота. Резервирует
    кредиты и ставит задачу Celery в очередь; сама задача (imagegen/tasks.py)
    делает модерацию + генерацию + сверку отдельно, асинхронно."""
    # Для заблокированной попытки запись не создаётся — так же, как и
    # ниже для insufficient_credits, которая тоже никогда не трогает
    # GeneratedImage.
    if task not in get_unlocked_keys(user):
        return StartImageOutcome(status="task_locked")

    provider_name, model = IMAGE_TASK_ROUTES[task]

    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_image_cost_usd(model))

    # Списание резерва и создание записи — одной операцией: если
    # исключение выбросит списание или создание строки, ничего не
    # остаётся в промежуточном состоянии.
    try:
        with transaction.atomic():
            charge_credits(
                user, hold_credits, reason=LedgerEntry.Reason.IMAGE_REQUEST
            )
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

    # Транзакция списания+создания выше уже зафиксирована к этому
    # моменту, так что воркер может безопасно увидеть строку. Если сама
    # постановка в очередь не удастся (брокер недоступен и т.п.), запись
    # иначе осталась бы списанной и вечно PENDING без единого шанса быть
    # обработанной — вместо этого сразу же синхронно возвращаем кредиты
    # и помечаем как неудачную.
    if not try_enqueue_or_refund(
        generate_image_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue image generation",
    ):
        return StartImageOutcome(status="enqueue_failed", record=record)

    return StartImageOutcome(status="accepted", record=record)


def start_image_edit(
    user,
    prompt: str,
    source_image_file,
    telegram_chat_id: Optional[int] = None,
) -> StartImageOutcome:
    """Та же схема резерв/сверка, что и у start_image_generation, но
    сохраняет входное фото пользователя в записи и ставит в очередь
    edit_image_task вместо обычной — единственный маршрут изображений
    NVIDIA, который принимает изображение, а не только промпт."""
    task = "edit"
    if task not in get_unlocked_keys(user):
        return StartImageOutcome(status="task_locked")

    provider_name, model = IMAGE_TASK_ROUTES[task]

    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_image_cost_usd(model))

    try:
        with transaction.atomic():
            charge_credits(
                user, hold_credits, reason=LedgerEntry.Reason.IMAGE_REQUEST
            )
            record = GeneratedImage.objects.create(
                user=user,
                prompt=prompt,
                provider=provider_name,
                model=model,
                status=GeneratedImage.Status.PENDING,
                credits_charged=hold_credits,
                source_image=source_image_file,
                telegram_chat_id=telegram_chat_id,
            )
    except InsufficientCreditsError:
        return StartImageOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        edit_image_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue image edit",
    ):
        return StartImageOutcome(status="enqueue_failed", record=record)

    return StartImageOutcome(status="accepted", record=record)
