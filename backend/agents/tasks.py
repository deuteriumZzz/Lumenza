from dataclasses import dataclass, field
from decimal import Decimal

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.core.files.base import ContentFile
from django.utils import timezone

from accounts.models import UserContext
from agents.models import AgentRun
from agents.services import (
    CODE_EXECUTION_TASK,
    VIDEO_GENERATION_TASK,
    parse_final_result,
    render_step_prompt,
)
from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    claim_pending_record,
    grant_credits,
    usd_to_credits,
)
from code_interpreter.piston_adapter import PistonAdapter
from code_interpreter.pricing import estimate_code_execution_cost_usd
from core.moderation import ModerationBlocked, check_prompt
from core.translation import translate_prompt_to_english
from knowledge.services import search as search_workspace
from providers.services import RAG_TOP_K, TASK_ROUTES, run_chat
from videogen.models import GeneratedVideo
from videogen.pricing import estimate_video_cost_usd
from videogen.registry import get_video_adapter
from videogen.replicate_video_adapter import TEXT_TO_VIDEO_MODEL

_STATUS_FOR_CHAT_OUTCOME = {
    "insufficient_credits": AgentRun.Status.INSUFFICIENT_CREDITS,
    "blocked": AgentRun.Status.BLOCKED,
}

# parse_final_result only checks that a required output key is present, not
# that its content is non-empty/correct — an LLM returning `"disclaimer": ""`
# would pass silently. This field exists for a liability/compliance reason
# (informational digest, not personalized advice), so it isn't trusted to
# the model: overwritten unconditionally after a successful parse, below.
_FIXED_DISCLAIMERS = {
    "finance-digest": (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    ),
    "market-research": (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    ),
    "financial-report-analyzer": (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    ),
    "investment-research": (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    ),
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


@dataclass
class _StepOutcome:
    """Unifies a run_chat() ChatOutcome and the two sentinel step types
    (code_execution/video_generation) behind one shape, so run_agent's
    success/failure handling stays a single code path regardless of which
    kind of step just ran."""

    status: str
    text: str = ""
    credits_charged: Decimal = Decimal("0")
    extra_fields: dict = field(default_factory=dict)


def _run_code_execution_step(run: AgentRun, code: str) -> _StepOutcome:
    """Runs `code` (the immediately preceding step's raw output) through
    the self-hosted Piston backend — PistonAdapter().execute() is a plain,
    synchronous, DB-free primitive (confirmed via code_interpreter's own
    source), unlike code_interpreter.services.start_code_execution/tasks.py
    which are built around a standalone CodeExecution row + its own Celery
    dispatch and would reintroduce async/poll semantics inside what's meant
    to be one synchronous agent step."""
    try:
        check_prompt(code)
    except ModerationBlocked:
        return _StepOutcome(status="blocked")

    hold_credits = usd_to_credits(estimate_code_execution_cost_usd())
    try:
        charge_credits(
            run.user, hold_credits, reason=LedgerEntry.Reason.CODE_EXECUTION_REQUEST
        )
    except InsufficientCreditsError:
        return _StepOutcome(status="insufficient_credits")

    try:
        result = PistonAdapter().execute(code)
    except Exception:
        grant_credits(run.user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        return _StepOutcome(status="provider_error")

    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        grant_credits(run.user, refund, reason=LedgerEntry.Reason.REFUND)

    stdout = result.stdout or ""
    stderr = result.stderr or ""
    return _StepOutcome(
        status="ok",
        text=f"stdout:\n{stdout}\nstderr:\n{stderr}",
        credits_charged=actual_credits,
        extra_fields={
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": result.exit_code,
        },
    )


def _run_video_generation_step(run: AgentRun, prompt_text: str) -> _StepOutcome:
    """Generates a video from `prompt_text` (the immediately preceding
    step's raw output) via the same ReplicateVideoAdapter the standalone
    Studio video feature uses — called directly rather than through
    videogen.services.start_video_generation's async-enqueue path, for the
    same reason as the code step above. Persists a GeneratedVideo row
    directly as status=OK (skipping the PENDING/claim dance, since nothing
    needs to poll it) purely to reuse its FileField/upload_to/media-serving
    machinery for the produced video bytes."""
    try:
        check_prompt(prompt_text)
    except ModerationBlocked:
        return _StepOutcome(status="blocked")

    hold_credits = usd_to_credits(estimate_video_cost_usd(TEXT_TO_VIDEO_MODEL))
    try:
        charge_credits(
            run.user, hold_credits, reason=LedgerEntry.Reason.VIDEO_REQUEST
        )
    except InsufficientCreditsError:
        return _StepOutcome(status="insufficient_credits")

    try:
        result = get_video_adapter("replicate").generate(
            translate_prompt_to_english(prompt_text), model=TEXT_TO_VIDEO_MODEL
        )
    except Exception:
        grant_credits(run.user, hold_credits, reason=LedgerEntry.Reason.REFUND)
        return _StepOutcome(status="provider_error")

    actual_credits = usd_to_credits(result.cost_usd)
    refund = hold_credits - actual_credits
    if refund > 0:
        grant_credits(run.user, refund, reason=LedgerEntry.Reason.REFUND)

    extension = "gif" if result.mocked else "mp4"
    video_record = GeneratedVideo.objects.create(
        user=run.user,
        prompt=prompt_text,
        provider="replicate",
        model=TEXT_TO_VIDEO_MODEL,
        status=GeneratedVideo.Status.OK,
        cost_usd=Decimal(str(result.cost_usd)),
        credits_charged=actual_credits,
        mocked=result.mocked,
        completed_at=timezone.now(),
    )
    video_record.video.save(
        f"{video_record.id}.{extension}",
        ContentFile(result.video_bytes),
        save=True,
    )
    video_url = video_record.video.url

    return _StepOutcome(
        status="ok",
        text=f"[video generated: {video_url}]",
        credits_charged=actual_credits,
        extra_fields={"video_url": video_url},
    )


def run_agent(run_id: int) -> None:
    """Runs every workflow step of an Agent in order. Text steps are their
    own run_chat() call — reused completely unmodified, so moderation,
    provider fallback, and credit charging all happen exactly as they do
    for /api/chat/. Two sentinel task values (code_execution/
    video_generation) instead run real Python via Piston or generate a
    real video via Replicate — see _run_code_execution_step/
    _run_video_generation_step. Checkpoints `steps` into the DB after each
    call so polling clients see real progress, not just a final result."""
    run = claim_pending_record(AgentRun, run_id)
    if run is None:
        return

    try:
        _run_agent_steps(run)
    except SoftTimeLimitExceeded:
        # Best-effort only: if this fires between a step's charge_credits()
        # call and its adapter call returning, that hold isn't refunded
        # here — same class of accepted gap as the streaming feature's
        # crashed-worker case (see memory). The hard time_limit below is
        # the real backstop if this handler itself hangs.
        run.status = AgentRun.Status.ERROR
        run.error_message = "Превышено время выполнения агента"
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "error_message", "completed_at"])


def _run_agent_steps(run: AgentRun) -> None:
    agent = run.agent
    context: dict[str, str] = {}
    last_video_url: str | None = None
    last_code_stdout: str | None = None
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

    previous_step_key: str | None = None
    for step in agent.workflow_steps:
        _update_step(
            run,
            step["key"],
            status="running",
            started_at=timezone.now().isoformat(),
        )
        run.save(update_fields=["steps"])

        if step["task"] == CODE_EXECUTION_TASK:
            step_outcome = _run_code_execution_step(
                run, context.get(previous_step_key, "")
            )
        elif step["task"] == VIDEO_GENERATION_TASK:
            step_outcome = _run_video_generation_step(
                run, context.get(previous_step_key, "")
            )
        else:
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
                model == preferred_model
                for _provider, model in TASK_ROUTES[step["task"]]
            ):
                preferred_model = None
            outcome = run_chat(
                run.user,
                prompt,
                task=step["task"],
                model=preferred_model,
            )
            step_outcome = _StepOutcome(
                status=outcome.status,
                text=outcome.text or "",
                credits_charged=outcome.credits_charged or Decimal("0"),
                extra_fields={
                    "provider": outcome.provider,
                    "model": outcome.model,
                    "used_fallback": outcome.used_fallback,
                },
            )

        if step_outcome.status != "ok":
            _update_step(
                run,
                step["key"],
                status="error",
                error_message=_STEP_ERROR_MESSAGES.get(
                    step_outcome.status, step_outcome.status
                ),
                completed_at=timezone.now().isoformat(),
            )
            run.status = _STATUS_FOR_CHAT_OUTCOME.get(
                step_outcome.status, AgentRun.Status.ERROR
            )
            run.error_message = (
                f"Шаг «{step['label']}» не выполнен: "
                f"{_STEP_ERROR_MESSAGES.get(step_outcome.status, step_outcome.status)}"
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

        context[step["key"]] = step_outcome.text
        run.credits_charged += step_outcome.credits_charged
        if "video_url" in step_outcome.extra_fields:
            last_video_url = step_outcome.extra_fields["video_url"]
        if "stdout" in step_outcome.extra_fields:
            last_code_stdout = step_outcome.extra_fields["stdout"]
        _update_step(
            run,
            step["key"],
            status="ok",
            credits_charged=str(step_outcome.credits_charged),
            completed_at=timezone.now().isoformat(),
            **step_outcome.extra_fields,
        )
        run.save(update_fields=["steps", "credits_charged"])
        previous_step_key = step["key"]

    final_step_key = agent.workflow_steps[-1]["key"]
    parsed, error = parse_final_result(
        context[final_step_key], agent.output_schema
    )
    if error:
        run.status = AgentRun.Status.ERROR
        run.error_message = error
    else:
        run.status = AgentRun.Status.OK
        if agent.slug in _FIXED_DISCLAIMERS:
            parsed["disclaimer"] = _FIXED_DISCLAIMERS[agent.slug]
        # Same "don't trust the model for a value it can't know" principle
        # as the disclaimer above, generalized by output_schema property
        # name instead of by slug — these two values are always correct
        # regardless of which agent produced them.
        output_properties = agent.output_schema.get("properties", {})
        if "video_url" in output_properties and last_video_url is not None:
            parsed["video_url"] = last_video_url
        if "code_stdout" in output_properties and last_code_stdout is not None:
            parsed["code_stdout"] = last_code_stdout
        run.result = parsed
    run.completed_at = timezone.now()
    run.save(
        update_fields=["status", "result", "error_message", "completed_at"]
    )


run_agent_task = shared_task(
    name="agents.run_agent", soft_time_limit=240, time_limit=300
)(run_agent)
