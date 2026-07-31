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
from code_interpreter.models import CodeExecution
from code_interpreter.pricing import estimate_code_execution_cost_usd
from code_interpreter.tasks import execute_code_task
from core.enqueue import try_enqueue_or_refund
from progression.services import get_unlocked_keys

TASK_KEY = "code_execution"


@dataclass
class StartCodeExecutionOutcome:
    status: Literal[
        "accepted", "insufficient_credits", "enqueue_failed", "task_locked"
    ]
    record: Optional[CodeExecution] = None


def start_code_execution(user, code: str) -> StartCodeExecutionOutcome:
    if TASK_KEY not in get_unlocked_keys(user):
        return StartCodeExecutionOutcome(status="task_locked")

    get_or_create_account(user)
    hold_credits = usd_to_credits(estimate_code_execution_cost_usd())

    try:
        with transaction.atomic():
            charge_credits(
                user,
                hold_credits,
                reason=LedgerEntry.Reason.CODE_EXECUTION_REQUEST,
            )
            record = CodeExecution.objects.create(
                user=user,
                code=code,
                status=CodeExecution.Status.PENDING,
                credits_charged=hold_credits,
            )
    except InsufficientCreditsError:
        return StartCodeExecutionOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        execute_code_task,
        record,
        user,
        hold_credits,
        "Failed to enqueue processing",
    ):
        return StartCodeExecutionOutcome(
            status="enqueue_failed", record=record
        )

    return StartCodeExecutionOutcome(status="accepted", record=record)
