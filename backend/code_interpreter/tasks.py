from decimal import Decimal

from celery import shared_task
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import claim_pending_record as _claim
from billing.services import grant_credits
from billing.services import refund_hold as _refund_hold
from billing.services import usd_to_credits
from code_interpreter.models import CodeExecution
from code_interpreter.piston_adapter import PistonAdapter
from core.constants import ERROR_MESSAGE_MAX_LEN
from core.moderation import ModerationBlocked, check_prompt
from referrals.services import check_referral_reward


def execute_code(code_execution_id: int) -> None:
    record = _claim(CodeExecution, code_execution_id)
    if record is None:
        return

    # Code isn't natural-language content, but its stdout is still shown
    # back to the user — print() is a plausible way to route disallowed
    # text through this feature, so it's worth the same moderation check
    # media_ops.tasks.synthesize_speech applies to its own direct
    # user-authored text input.
    try:
        check_prompt(record.code)
    except ModerationBlocked as exc:
        _refund_hold(record)
        record.status = CodeExecution.Status.BLOCKED
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
        return

    try:
        result = PistonAdapter().execute(record.code)
    except Exception as exc:
        _refund_hold(record)
        record.status = CodeExecution.Status.ERROR
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
        return

    _reconcile(record, result.cost_usd)
    record.stdout = result.stdout
    record.stderr = result.stderr
    record.exit_code = result.exit_code
    record.language = result.language
    record.version = result.version
    record.mocked = result.mocked
    record.status = CodeExecution.Status.OK
    record.completed_at = timezone.now()
    record.save()
    check_referral_reward(record.user)


def _reconcile(record, cost_usd: float) -> None:
    actual_credits = usd_to_credits(cost_usd)
    refund = record.credits_charged - actual_credits
    if refund > 0:
        grant_credits(record.user, refund, reason=LedgerEntry.Reason.REFUND)
    record.cost_usd = Decimal(str(cost_usd))
    record.credits_charged = actual_credits


execute_code_task = shared_task(name="code_interpreter.execute_code")(
    execute_code
)
