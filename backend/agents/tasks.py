from decimal import Decimal

from celery import shared_task
from django.utils import timezone

from accounts.models import UserContext
from agents.models import AgentRun
from agents.services import parse_final_result, render_step_prompt
from billing.services import claim_pending_record
from knowledge.services import search as search_workspace
from providers.services import RAG_TOP_K, TASK_ROUTES, run_chat

_STATUS_FOR_CHAT_OUTCOME = {
    "insufficient_credits": AgentRun.Status.INSUFFICIENT_CREDITS,
    "blocked": AgentRun.Status.BLOCKED,
}

_STEP_ERROR_MESSAGES = {
    "insufficient_credits": "Недостаточно кредитов для этого шага",
    "blocked": "Запрос заблокирован модерацией",
    "provider_error": "Ошибка провайдера модели",
    "invalid_model": "Выбранная модель не поддерживается для этого шага",
    "model_requires_pro": "Выбранная premium-модель доступна только в тарифе Pro",
    "invalid_workspace": "Подключённая база знаний недоступна",
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

    # Same "once per run, not once per step" reasoning as user_context
    # above. Ownership of run.workspace_id was already checked at run
    # creation (agents.services.start_agent_run), so no None/not-owned
    # branch is needed here.
    knowledge_context: list[str] | None = None
    if run.workspace_id:
        query = " ".join(str(value) for value in run.input_payload.values())
        matches = search_workspace(run.user, run.workspace_id, query, top_k=RAG_TOP_K)
        if matches:
            knowledge_context = [chunk.text for chunk, _score in matches]

    for step in agent.workflow_steps:
        _update_step(
            run,
            step["key"],
            status="running",
            started_at=timezone.now().isoformat(),
        )
        run.save(update_fields=["steps"])

        prompt = render_step_prompt(
            agent,
            step,
            run.input_payload,
            context,
            user_context,
            knowledge_context,
        )
        preferred_model = run.preferred_model or None
        if preferred_model and not any(
            model == preferred_model for _provider, model in TASK_ROUTES[step["task"]]
        ):
            preferred_model = None
        outcome = run_chat(
            run.user,
            prompt,
            task=step["task"],
            model=preferred_model,
        )

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
