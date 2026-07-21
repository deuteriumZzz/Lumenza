from rest_framework import status
from rest_framework.response import Response

TASK_LOCKED_DETAIL = "This task isn't unlocked on your plan yet"
INSUFFICIENT_CREDITS_DETAIL = "Insufficient credits"
DEFAULT_ENQUEUE_FAILED_DETAIL = "Processing is temporarily unavailable"


def locked_or(
    outcome, ok_response, enqueue_failed_detail=DEFAULT_ENQUEUE_FAILED_DETAIL
):
    """Общий для imagegen и media_ops результат start_*(): маппинг
    outcome.status в готовый Response. Отдельная функция вместо
    исключений — start_*() возвращает Outcome, а не бросает, так что
    перехватывать здесь нечего; это просто общая точка, а не подмена
    архитектуры."""
    if outcome.status == "task_locked":
        return Response(
            {"detail": TASK_LOCKED_DETAIL, "code": "task_locked"},
            status=status.HTTP_403_FORBIDDEN,
        )
    if outcome.status == "insufficient_credits":
        return Response(
            {"detail": INSUFFICIENT_CREDITS_DETAIL},
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )
    if outcome.status == "enqueue_failed":
        return Response(
            {"detail": enqueue_failed_detail},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return ok_response
