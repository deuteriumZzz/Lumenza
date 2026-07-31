import json
from datetime import timedelta
from typing import Optional

from django.utils import timezone

from agents.models import Agent
from agents.services import validate_against_input_schema
from automations.models import PendingAction, ScheduledAgentRun, TelegramChannel
from automations.telegram_client import get_chat


def connect_telegram_channel(user, chat_id: int) -> TelegramChannel:
    """Raises automations.telegram_client.TelegramApiError if the bot
    can't see this chat_id at all (bad id, or bot never added to it) —
    does not confirm posting rights, only that the id/token are real."""
    chat = get_chat(chat_id)
    title = (
        chat.get("title")
        or chat.get("username")
        or chat.get("first_name")
        or str(chat_id)
    )
    channel, _ = TelegramChannel.objects.update_or_create(
        user=user, chat_id=chat_id, defaults={"title": title}
    )
    return channel


def _next_occurrence(hour: int, minute: int):
    now = timezone.now()
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


def create_schedule(
    user,
    agent: Agent,
    input_payload: dict,
    hour: int,
    minute: int,
    publish_channel: Optional[TelegramChannel] = None,
) -> ScheduledAgentRun:
    """Reuses agents.services.validate_against_input_schema unmodified —
    same validation a manual run through /api/agents/<slug>/runs/ would
    get, so a schedule can never be created with input the agent itself
    would reject. Raises agents.services.InvalidAgentInputError."""
    cleaned_input = validate_against_input_schema(agent.input_schema, input_payload)
    return ScheduledAgentRun.objects.create(
        user=user,
        agent=agent,
        input_payload=cleaned_input,
        hour=hour,
        minute=minute,
        publish_channel=publish_channel,
        next_run_at=_next_occurrence(hour, minute),
    )


def request_publish(user, agent_run, channel: TelegramChannel, text: str) -> PendingAction:
    """Manual entry point — the "Опубликовать в Telegram" button on any
    completed agent run, not just scheduled ones. Ownership of agent_run/
    channel is the caller's (view's) responsibility, same convention as
    every other cross-model ownership check in this codebase."""
    return PendingAction.objects.create(
        user=user, agent_run=agent_run, channel=channel, text=text
    )


def confirm_pending_action(pending_action: PendingAction) -> None:
    from automations.tasks import send_pending_action_task

    pending_action.status = PendingAction.Status.CONFIRMED
    pending_action.confirmed_at = timezone.now()
    pending_action.save(update_fields=["status", "confirmed_at"])

    try:
        send_pending_action_task.delay(pending_action.id)
    except Exception:
        pending_action.status = PendingAction.Status.FAILED
        pending_action.error_message = "Failed to enqueue send"
        pending_action.save(update_fields=["status", "error_message"])


def cancel_pending_action(pending_action: PendingAction) -> None:
    pending_action.status = PendingAction.Status.CANCELED
    pending_action.save(update_fields=["status"])


def default_publish_text(agent_slug: str, result: dict) -> str:
    """Server-side fallback draft text for schedule-triggered previews (no
    user present to fill anything in) — the manual "Опубликовать" button
    fills a client-side default instead and lets the user edit either way,
    so this only needs to be a reasonable starting point, not perfect."""
    if not isinstance(result, dict):
        return str(result)[:4000]

    if agent_slug in ("research-digest", "document-summary"):
        summary = result.get("summary")
        if summary:
            return summary

    if agent_slug == "threads-content-day":
        schedule = result.get("schedule") or []
        texts = [
            item.get("post_text", "")
            for item in schedule
            if isinstance(item, dict) and item.get("post_text")
        ]
        if texts:
            return "\n\n".join(texts)

    return json.dumps(result, ensure_ascii=False)[:4000]
