import json
import re
import secrets
from dataclasses import dataclass
from typing import Literal, Optional

from django.db import IntegrityError, transaction
from django.utils import timezone

from agents.models import Agent, AgentRun
from billing.services import get_or_create_account, usd_to_credits
from code_interpreter.pricing import estimate_code_execution_cost_usd
from docgen.pricing import (
    estimate_excel_generation_cost_usd,
    estimate_pptx_generation_cost_usd,
)
from media_ops.nvidia_tts_adapter import DEFAULT_MODEL as NVIDIA_TTS_MODEL
from media_ops.pricing import estimate_speech_cost_usd
from providers.services import TASK_ROUTES, _route_hold_credits
from videogen.pricing import estimate_video_cost_usd
from videogen.replicate_video_adapter import TEXT_TO_VIDEO_MODEL

# Sentinel step "task" values usable in Agent.workflow_steps, alongside
# real providers.services.TASK_ROUTES keys — a step with one of these
# tasks runs code/generates a video/synthesizes audio/builds a real
# office document instead of calling run_chat (see
# agents.tasks._run_code_execution_step/_run_video_generation_step/
# _run_audio_generation_step/_run_pptx_generation_step/
# _run_excel_generation_step). Never valid as TASK_ROUTES keys, so every
# direct TASK_ROUTES[...] lookup site needs a guard before it, starting
# with the pre-flight check below.
CODE_EXECUTION_TASK = "code_execution"
VIDEO_GENERATION_TASK = "video_generation"
AUDIO_GENERATION_TASK = "audio_generation"
PPTX_GENERATION_TASK = "pptx_generation"
EXCEL_GENERATION_TASK = "excel_generation"

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


def _json_schema_placeholder(schema: dict) -> str:
    """Renders a compact literal example (e.g. {"title":str,"tags":[str]})
    from a JSON-schema-shaped dict, for embedding in a "return exactly this
    shape" prompt instruction. Generic over any Agent.output_schema instead
    of one hardcoded per agent, so every agent's assemble step gets a
    correct hint from its own schema."""
    schema_type = schema.get("type")
    if schema_type == "object":
        parts = [
            f'"{key}":{_json_schema_placeholder(value)}'
            for key, value in schema.get("properties", {}).items()
        ]
        return "{" + ",".join(parts) + "}"
    if schema_type == "array":
        return "[" + _json_schema_placeholder(schema.get("items", {})) + "]"
    if schema_type == "number":
        return "number"
    if schema_type == "boolean":
        return "bool"
    return "str"


def _non_empty_context_lines(block: dict) -> list[str]:
    return [
        f"- {key}: {value.strip()}"
        for key, value in (block or {}).items()
        if isinstance(value, str) and value.strip()
    ]


def render_step_prompt(
    agent: Agent,
    step: dict,
    input_payload: dict,
    context: dict,
    user_context: dict | None = None,
    knowledge_context: list[str] | None = None,
) -> str:
    """Builds the prompt for one workflow step: the agent's system
    instructions, the user's saved profile (if any), retrieved knowledge
    chunks (if a workspace is attached), the user's form input, and the
    accumulated text from earlier steps (so step 2 can build on step 1's
    output, and so on)."""
    lines = [agent.system_instructions]

    profile_lines: list[str] = []
    if user_context:
        profile_lines.extend(
            _non_empty_context_lines(user_context.get("general", {}))
        )
        profile_lines.extend(
            _non_empty_context_lines(user_context.get(agent.category, {}))
        )
    if profile_lines:
        lines.append("")
        lines.append(
            "Профиль пользователя (используй как фон, не как прямой вопрос):"
        )
        lines.extend(profile_lines)

    if knowledge_context:
        lines.append("")
        lines.append("Контекст базы знаний:")
        lines.extend(f"- {text}" for text in knowledge_context)

    lines.append("")
    lines.append("Вводные данные пользователя:")
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
            f"{_json_schema_placeholder(agent.output_schema)}."
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
    user,
    agent: Agent,
    input_payload: dict,
    idempotency_key: str,
    workspace_id: Optional[int] = None,
    preferred_model: str = "",
) -> StartAgentRunOutcome:
    """Common entry point for POST /api/agents/<slug>/runs/. No credits are
    held upfront (unlike imagegen's start_image_generation) — each
    workflow step charges through run_chat individually as it executes,
    so this only does a read-only sufficiency check against the first
    step's route before creating anything.

    workspace_id — optional RAG attachment. Ownership is checked once
    here, at creation time, so agents.tasks.run_agent can trust
    run.workspace_id is always owned by run.user during execution."""
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

    workspace = None
    if workspace_id is not None:
        from knowledge.models import Workspace

        workspace = Workspace.objects.filter(
            id=workspace_id, user=user
        ).first()
        if workspace is None:
            return StartAgentRunOutcome(
                status="invalid_input",
                error_message="База знаний не найдена",
            )

    first_task = agent.workflow_steps[0]["task"]
    account = get_or_create_account(user)
    if first_task == CODE_EXECUTION_TASK:
        required_credits = usd_to_credits(estimate_code_execution_cost_usd())
    elif first_task == VIDEO_GENERATION_TASK:
        required_credits = usd_to_credits(
            estimate_video_cost_usd(TEXT_TO_VIDEO_MODEL)
        )
    elif first_task == AUDIO_GENERATION_TASK:
        required_credits = usd_to_credits(
            estimate_speech_cost_usd(NVIDIA_TTS_MODEL)
        )
    elif first_task == PPTX_GENERATION_TASK:
        required_credits = usd_to_credits(estimate_pptx_generation_cost_usd())
    elif first_task == EXCEL_GENERATION_TASK:
        required_credits = usd_to_credits(estimate_excel_generation_cost_usd())
    else:
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
                workspace=workspace,
                idempotency_key=idempotency_key,
                preferred_model=preferred_model,
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


def create_custom_agent(
    user, name: str, description: str, agent_slugs: list[str]
) -> Agent:
    """"Мои агенты" builder: chains 2-3 existing published catalog agents
    into one synthetic Agent row, executed by the same unmodified engine
    every seeded agent already runs through — no changes to
    render_step_prompt/run_agent needed. Raises InvalidAgentInputError on
    any validation failure."""
    if len(agent_slugs) != len(set(agent_slugs)):
        raise InvalidAgentInputError("agent_slugs must not contain duplicates")
    if not 2 <= len(agent_slugs) <= 3:
        raise InvalidAgentInputError("Choose 2 or 3 agents to combine")

    sources_by_slug = {
        agent.slug: agent
        for agent in Agent.objects.filter(
            slug__in=agent_slugs,
            status=Agent.Status.PUBLISHED,
            user__isnull=True,
        )
    }
    missing = [slug for slug in agent_slugs if slug not in sources_by_slug]
    if missing:
        raise InvalidAgentInputError(
            f"Unknown or unavailable agents: {', '.join(missing)}"
        )
    sources = [sources_by_slug[slug] for slug in agent_slugs]

    if len({agent.category for agent in sources}) < 2:
        raise InvalidAgentInputError(
            "Selected agents must span at least 2 different categories"
        )

    system_instructions = "\n\n".join(
        f"### Роль «{agent.name}»\n{agent.system_instructions}"
        for agent in sources
    )

    combined_steps = []
    for agent in sources:
        prefix = agent.slug.replace("-", "_")
        for step in agent.workflow_steps:
            combined_steps.append(
                {
                    "key": f"{prefix}__{step['key']}",
                    "label": f"[{agent.name}] {step['label']}",
                    "task": step["task"],
                }
            )
    # Every seeded source agent's own last step is already named
    # "assemble" by convention, colliding across sources and re-triggering
    # render_step_prompt's JSON-forcing branch on non-final steps — force
    # the true final step's key explicitly rather than relying on that
    # convention holding.
    combined_steps[-1]["key"] = "assemble"

    seen_field_keys: set[str] = set()
    combined_fields = []
    for agent in sources:
        for field in agent.input_schema.get("fields", []):
            if field["key"] not in seen_field_keys:
                seen_field_keys.add(field["key"])
                combined_fields.append(field)

    slug = None
    for _ in range(5):
        candidate = f"custom-{secrets.token_urlsafe(6)}"
        if not Agent.objects.filter(slug=candidate).exists():
            slug = candidate
            break
    if slug is None:
        raise InvalidAgentInputError("Could not allocate a unique agent slug")

    return Agent.objects.create(
        slug=slug,
        name=name,
        description=description,
        category=sources[0].category,
        user=user,
        source_agent_slugs=agent_slugs,
        status=Agent.Status.PUBLISHED,
        version=1,
        input_schema={"fields": combined_fields},
        system_instructions=system_instructions,
        workflow_steps=combined_steps,
        output_schema=sources[-1].output_schema,
    )
