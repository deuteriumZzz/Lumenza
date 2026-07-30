from decimal import Decimal

from celery import shared_task
from django.utils import timezone

from accounts.models import UserContext
from agents.models import AgentRun
from agents.services import parse_final_result, render_step_prompt
from billing.services import claim_pending_record
from providers.services import run_chat

_STATUS_FOR_CHAT_OUTCOME = {
    "insufficient_credits": AgentRun.Status.INSUFFICIENT_CREDITS,
    "blocked": AgentRun.Status.BLOCKED,
}

_STEP_ERROR_MESSAGES = {
    "insufficient_credits": "Недостаточно кредитов для этого шага",
    "blocked": "Запрос заблокирован модерацией",
    "provider_error": "Ошибка провайдера модели",
}


def _step_index(run: AgentRun, key: str) -> int:
    for index, step in enumerate(run.steps):
        if step["key"] == key:
            return index
    raise KeyError(key)


def _update_step(run: AgentRun, key: str, **fields) -> None:
    index = _step_index(run, key)
    run.steps[index] = {**run.steps[index], **fields}


def run_agent(run_id: int) -> None:
    """Runs every workflow step of an Agent in order, each as its own
    run_chat() call — reused completely unmodified, so moderation,
    provider fallback, and credit charging all happen exactly as they do
    for /api/chat/. Checkpoints `steps` into the DB after each call so
    polling clients see real progress, not just a final result."""
    run = claim_pending_record(AgentRun, run_id)
    if run is None:
        return

    agent = run.agent
    context: dict[str, str] = {}
    # Fetched once per run, not once per step — the profile doesn't
    # change mid-run, and this keeps the loop below to one query total
    # instead of one per workflow step.
    user_context = (
        UserContext.objects.filter(user=run.user)
        .values_list("data", flat=True)
        .first()
    )

    for step in agent.workflow_steps:
        _update_step(
            run,
            step["key"],
            status="running",
            started_at=timezone.now().isoformat(),
        )
        run.save(update_fields=["steps"])

        prompt = render_step_prompt(
            agent, step, run.input_payload, context, user_context
        )
        outcome = run_chat(run.user, prompt, task=step["task"])

        if outcome.status != "ok":
            _update_step(
                run,
                step["key"],
                status="error",
                error_message=_STEP_ERROR_MESSAGES.get(
                    outcome.status, outcome.status
                ),
                completed_at=timezone.now().isoformat(),
            )
            run.status = _STATUS_FOR_CHAT_OUTCOME.get(
                outcome.status, AgentRun.Status.ERROR
            )
            run.error_message = (
                f"Шаг «{step['label']}» не выполнен: "
                f"{_STEP_ERROR_MESSAGES.get(outcome.status, outcome.status)}"
            )
            run.completed_at = timezone.now()
            run.save(
                update_fields=[
                    "steps",
                    "status",
                    "error_message",
                    "completed_at",
                ]
            )
            return

        context[step["key"]] = outcome.text or ""
        run.credits_charged += outcome.credits_charged or Decimal("0")
        _update_step(
            run,
            step["key"],
            status="ok",
            provider=outcome.provider,
            model=outcome.model,
            used_fallback=outcome.used_fallback,
            credits_charged=str(outcome.credits_charged or Decimal("0")),
            completed_at=timezone.now().isoformat(),
        )
        run.save(update_fields=["steps", "credits_charged"])

    final_step_key = agent.workflow_steps[-1]["key"]
    parsed, error = parse_final_result(
        context[final_step_key], agent.output_schema
    )
    if error:
        run.status = AgentRun.Status.ERROR
        run.error_message = error
    else:
        run.status = AgentRun.Status.OK
        run.result = parsed
    run.completed_at = timezone.now()
    run.save(
        update_fields=["status", "result", "error_message", "completed_at"]
    )


run_agent_task = shared_task(name="agents.run_agent")(run_agent)
