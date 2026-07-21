from decimal import Decimal

from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import grant_credits


def try_enqueue_or_refund(
    task, record, user, hold_credits, error_message: str
) -> bool:
    """Общая для imagegen/media_ops постановка celery-задачи после того, как
    кредиты уже списаны и запись создана. Если постановка в очередь не
    удастся (брокер недоступен и т.п.), запись иначе осталась бы списанной и
    вечно PENDING без единого шанса быть обработанной — вместо этого сразу
    же синхронно возвращаем кредиты и помечаем запись как ошибку.

    Возвращает True при успешной постановке в очередь, False при сбое
    (запись уже обновлена и сохранена в этом случае)."""
    try:
        task.delay(record.id)
        return True
    except Exception:
        grant_credits(user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        record.status = record.Status.ERROR
        record.credits_charged = Decimal("0")
        record.error_message = error_message
        record.completed_at = timezone.now()
        record.save(
            update_fields=[
                "status",
                "credits_charged",
                "error_message",
                "completed_at",
            ]
        )
        return False
