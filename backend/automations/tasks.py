from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from agents.models import AgentRun
from agents.services import start_agent_run
from automations.models import PendingAction, ScheduledAgentRun
from automations.services import default_publish_text
from automations.telegram_client import TelegramApiError, send_message
from core.constants import ERROR_MESSAGE_MAX_LEN


def run_due_schedules() -> int:
    """Celery-Beat-driven periodic scan, mirroring
    billing.tasks.renew_due_subscriptions's shape exactly (plain function,
    wrapped in shared_task at module bottom so tests can call it directly):
    trigger every due schedule through the *unmodified* agent engine
    (agents.services.start_agent_run — same credit hold/moderation/
    fallback every other run goes through), then a second pass creates
    publish drafts for schedules whose triggered run has since completed.
    Returns the total number of schedules triggered + drafts created."""
    now = timezone.now()
    due = ScheduledAgentRun.objects.filter(
        is_active=True, next_run_at__lte=now
    ).select_related("agent")

    triggered = 0
    for schedule in due:
        idempotency_key = f"schedule-{schedule.id}-{schedule.next_run_at.isoformat()}"
        outcome = start_agent_run(
            schedule.user,
            schedule.agent,
            schedule.input_payload,
            idempotency_key,
        )
        if outcome.run is not None:
            schedule.last_agent_run = outcome.run
        schedule.last_run_at = now
        schedule.next_run_at = schedule.next_run_at + timedelta(days=1)
        schedule.save(
            update_fields=["last_agent_run", "last_run_at", "next_run_at"]
        )
        triggered += 1

    return triggered + _create_pending_drafts_for_completed_schedules()


def _create_pending_drafts_for_completed_schedules() -> int:
    # start_agent_run() enqueues a Celery task and returns immediately, so
    # this scan can't know a triggered run's outcome synchronously — this
    # second pass on the same tick catches it once agents.tasks.run_agent
    # (unmodified, untouched by this feature) has finished it.
    candidates = ScheduledAgentRun.objects.filter(
        publish_channel__isnull=False,
        last_agent_run__status=AgentRun.Status.OK,
    ).select_related("last_agent_run", "agent", "publish_channel", "user")

    created = 0
    for schedule in candidates:
        run = schedule.last_agent_run
        if PendingAction.objects.filter(agent_run=run).exists():
            continue
        text = default_publish_text(schedule.agent.slug, run.result or {})
        PendingAction.objects.create(
            user=schedule.user,
            agent_run=run,
            channel=schedule.publish_channel,
            text=text,
        )
        created += 1
        if schedule.user.telegram_id:
            try:
                send_message(
                    schedule.user.telegram_id,
                    "Черновик поста готов — подтвердите публикацию в приложении Lumenza.",
                )
            except TelegramApiError:
                # Best-effort nudge, not the audit trail itself — the
                # PendingAction row above is what actually matters and is
                # already saved regardless of whether this DM lands.
                pass
    return created


def send_pending_action(pending_action_id: int) -> None:
    try:
        pending_action = PendingAction.objects.select_related("channel").get(
            id=pending_action_id
        )
    except PendingAction.DoesNotExist:
        return

    # Defense in depth on top of confirm_pending_action() already being
    # the only caller that enqueues this — never send anything that
    # wasn't explicitly confirmed, per SPEC.md Phase 17's hard constraint.
    if pending_action.status != PendingAction.Status.CONFIRMED:
        return

    try:
        send_message(pending_action.channel.chat_id, pending_action.text)
    except TelegramApiError as exc:
        pending_action.status = PendingAction.Status.FAILED
        pending_action.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
        pending_action.save(update_fields=["status", "error_message"])
        return

    pending_action.status = PendingAction.Status.SENT
    pending_action.sent_at = timezone.now()
    pending_action.save(update_fields=["status", "sent_at"])


run_due_schedules_task = shared_task(name="automations.run_due_schedules")(
    run_due_schedules
)
send_pending_action_task = shared_task(name="automations.send_pending_action")(
    send_pending_action
)
