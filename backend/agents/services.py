import json
import re
from dataclasses import dataclass
from typing import Literal, Optional

from django.db import IntegrityError, transaction
from django.utils import timezone

from agents.models import Agent, AgentRun
from billing.services import get_or_create_account
from providers.services import TASK_ROUTES, _route_hold_credits

# The pre-flight balance check needs a prompt length to size the hold
# against, but the real first-step prompt (system instructions + form
# input) isn't known until validation — building it twice (once for
# sizing, once for execution) isn't worth it for a short-lived estimate,
# so a fixed conservative length stands in instead.
_NOMINAL_PROMPT_LENGTH = 2000

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class InvalidAgentInputError(ValueError):
    pass


def validate_against_input_schema(
    input_schema: dict, input_payload: dict
) -> dict:
    """Validates input_payload against an Agent's input_schema. Raises
    InvalidAgentInputError with a human-readable message on the first
    failure. Returns the payload trimmed to only the declared fields —
    unknown keys are dropped rather than rejected, so a client sending
    stale extra fields doesn't break."""
    if not isinstance(input_payload, dict):
        raise InvalidAgentInputError("input must be an object")

    cleaned: dict[str, str] = {}
    for field in input_schema.get("fields", []):
        key = field["key"]
        value = input_payload.get(key)
        if field.get("required") and not value:
            raise InvalidAgentInputError(f"'{key}' is required")
        if value is None:
            continue
        if not isinstance(value, str):
            raise InvalidAgentInputError(f"'{key}' must be a string")
        max_length = field.get("max_length")
        if max_length and len(value) > max_length:
            raise InvalidAgentInputError(
                f"'{key}' must be at most {max_length} characters"
            )
        options = field.get("options")
        if options and value not in options:
            raise InvalidAgentInputError(f"'{key}' must be one of {options}")
        cleaned[key] = value
    return cleaned


def render_step_prompt(
    agent: Agent, step: dict, input_payload: dict, context: dict
) -> str:
    """Builds the prompt for one workflow step: the agent's system
    instructions, the user's form input, and the accumulated text from
    earlier steps (so step 2 can build on step 1's output, and so on)."""
    lines = [agent.system_instructions, "", "Вводные данные пользователя:"]
    for key, value in input_payload.items():
        lines.append(f"- {key}: {value}")

    if context:
        lines.append("")
        lines.append("Результаты предыдущих шагов:")
        for key, text in context.items():
            lines.append(f"### {key}")
            lines.append(text)

    lines.append("")
    lines.append(f"Текущий шаг: {step['label']}.")
    if step["key"] == "assemble":
        lines.append(
            "Верни ТОЛЬКО валидный JSON без пояснений и без "
            "markdown-обрамления, строго по следующей схеме: "
            '{"branches":[{"title":str,"angle":str}],'
            '"hooks":[{"branch":str,"variants":[str]}],'
            '"schedule":[{"time":str,"branch":str,"post_text":str}],'
            '"variants":[str]}.'
        )
    return "\n".join(lines)


def parse_final_result(
    raw_text: str, output_schema: dict
) -> tuple[Optional[dict], Optional[str]]:
    """Parses the final workflow step's raw text as JSON matching
    output_schema's required top-level keys. Returns (result, None) on
    success or (None, error_message) on failure. No auto-repair retry for
    v1 — a strict schema skeleton in the final step's prompt (see
    render_step_prompt) is the mitigation instead."""
    stripped = _JSON_FENCE_RE.sub("", raw_text or "").strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        return None, f"Final step did not return valid JSON: {exc}"
    if not isinstance(parsed, dict):
        return None, "Final step's JSON must be an object"
    missing = [
        key for key in output_schema.get("required", []) if key not in parsed
    ]
    if missing:
        return None, f"Final step's JSON is missing keys: {', '.join(missing)}"
    return parsed, None


@dataclass
class StartAgentRunOutcome:
    status: Literal[
        "accepted",
        "existing",
        "insufficient_credits",
        "invalid_input",
        "enqueue_failed",
    ]
    run: Optional[AgentRun] = None
    error_message: Optional[str] = None


def start_agent_run(
    user, agent: Agent, input_payload: dict, idempotency_key: str
) -> StartAgentRunOutcome:
    """Common entry point for POST /api/agents/<slug>/runs/. No credits are
    held upfront (unlike imagegen's start_image_generation) — each
    workflow step charges through run_chat individually as it executes,
    so this only does a read-only sufficiency check against the first
    step's route before creating anything."""
    existing = AgentRun.objects.filter(
        user=user, agent=agent, idempotency_key=idempotency_key
    ).first()
    if existing is not None:
        return StartAgentRunOutcome(status="existing", run=existing)

    try:
        cleaned_input = validate_against_input_schema(
            agent.input_schema, input_payload
        )
    except InvalidAgentInputError as exc:
        return StartAgentRunOutcome(
            status="invalid_input", error_message=str(exc)
        )

    first_task = agent.workflow_steps[0]["task"]
    account = get_or_create_account(user)
    required_credits = _route_hold_credits(
        TASK_ROUTES[first_task], "x" * _NOMINAL_PROMPT_LENGTH
    )
    if account.balance < required_credits:
        return StartAgentRunOutcome(status="insufficient_credits")

    try:
        with transaction.atomic():
            run = AgentRun.objects.create(
                agent=agent,
                agent_version=agent.version,
                user=user,
                input_payload=cleaned_input,
                idempotency_key=idempotency_key,
                steps=[
                    {
                        "key": step["key"],
                        "label": step["label"],
                        "status": "pending",
                    }
                    for step in agent.workflow_steps
                ],
            )
    except IntegrityError:
        # Lost a race against a concurrent request with the same
        # idempotency key — the other request's row is now the source of
        # truth, same as if we'd found it in the lookup above.
        existing = AgentRun.objects.get(
            user=user, agent=agent, idempotency_key=idempotency_key
        )
        return StartAgentRunOutcome(status="existing", run=existing)

    from agents.tasks import run_agent_task

    try:
        run_agent_task.delay(run.id)
    except Exception:
        run.status = AgentRun.Status.ERROR
        run.error_message = "Failed to enqueue agent run"
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "error_message", "completed_at"])
        return StartAgentRunOutcome(status="enqueue_failed", run=run)

    return StartAgentRunOutcome(status="accepted", run=run)
