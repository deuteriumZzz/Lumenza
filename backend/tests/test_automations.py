import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

import agents.tasks as agents_tasks
import automations.services as automations_services
import automations.tasks as automations_tasks
from accounts.models import User as UserModel
from agents.models import Agent, AgentRun
from automations.models import PendingAction, ScheduledAgentRun, TelegramChannel
from automations.telegram_client import TelegramApiError
from providers.services import ChatOutcome
from tests.helpers import authed_client as _shared_authed_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="auto_user", tier=UserModel.Tier.PAID):
    return _shared_authed_client(username, tier=tier)


VALID_INPUT = {
    "topic": "запуск нового продукта",
    "audience": "малый бизнес",
    "tone": "экспертный",
    "goal": "рост подписчиков",
}

VALID_RESULT_JSON = json.dumps(
    {
        "branches": [{"title": "Запуск", "angle": "почему сейчас"}],
        "hooks": [{"branch": "Запуск", "variants": ["Мы это сделали."]}],
        "schedule": [
            {
                "time": "09:00",
                "branch": "Запуск",
                "post_text": "Сегодня мы запускаемся.",
            }
        ],
        "variants": ["Короче: мы запустились."],
    }
)


def _mock_run_chat_sequence(monkeypatch, texts):
    calls = {"count": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        index = calls["count"]
        calls["count"] += 1
        return ChatOutcome(
            status="ok",
            text=texts[index],
            provider="openai",
            model="gpt-4o-mini",
            task=task,
            mocked=True,
            used_fallback=False,
            credits_charged=Decimal("1.5"),
            balance=Decimal("100"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    return calls


def _completed_agent_run(user, idempotency_key):
    agent = Agent.objects.get(slug="threads-content-day")
    return AgentRun.objects.create(
        agent=agent,
        agent_version=agent.version,
        user=user,
        input_payload=VALID_INPUT,
        idempotency_key=idempotency_key,
        status=AgentRun.Status.OK,
    )


# --- Telegram channels ---


def test_connect_telegram_channel_success(monkeypatch):
    client, user = _authed_client("tg_connect")
    monkeypatch.setattr(
        automations_services,
        "get_chat",
        lambda chat_id: {"id": chat_id, "title": "My Channel"},
    )

    response = client.post(
        "/api/automations/telegram-channels/",
        {"chat_id": -100123},
        format="json",
    )

    assert response.status_code == 201
    channel = TelegramChannel.objects.get(user=user)
    assert channel.chat_id == -100123
    assert channel.title == "My Channel"


def test_connect_telegram_channel_invalid_chat_returns_400(monkeypatch):
    client, user = _authed_client("tg_connect_bad")

    def raise_error(chat_id):
        raise TelegramApiError("chat not found")

    monkeypatch.setattr(automations_services, "get_chat", raise_error)

    response = client.post(
        "/api/automations/telegram-channels/", {"chat_id": -1}, format="json"
    )

    assert response.status_code == 400
    assert not TelegramChannel.objects.filter(user=user).exists()


def test_telegram_channel_list_scoped_to_owner():
    client, owner = _authed_client("tg_owner")
    _, other = _authed_client("tg_other")
    TelegramChannel.objects.create(user=owner, chat_id=-1, title="Mine")
    TelegramChannel.objects.create(user=other, chat_id=-2, title="Not mine")

    response = client.get("/api/automations/telegram-channels/")

    titles = [item["title"] for item in response.data]
    assert titles == ["Mine"]


def test_delete_telegram_channel_requires_ownership():
    client, _ = _authed_client("tg_del_owner")
    _, other = _authed_client("tg_del_other")
    channel = TelegramChannel.objects.create(user=other, chat_id=-3, title="Not mine")

    response = client.delete(f"/api/automations/telegram-channels/{channel.id}/")

    assert response.status_code == 404
    assert TelegramChannel.objects.filter(pk=channel.id).exists()


# --- Schedules ---


def test_create_schedule_rejects_invalid_input():
    client, user = _authed_client("sched_invalid")

    response = client.post(
        "/api/automations/schedules/",
        {"agent_slug": "threads-content-day", "input": {}, "hour": 9, "minute": 0},
        format="json",
    )

    assert response.status_code == 400
    assert not ScheduledAgentRun.objects.filter(user=user).exists()


def test_create_schedule_success_computes_next_run_at():
    client, user = _authed_client("sched_ok")

    response = client.post(
        "/api/automations/schedules/",
        {
            "agent_slug": "threads-content-day",
            "input": VALID_INPUT,
            "hour": 9,
            "minute": 30,
        },
        format="json",
    )

    assert response.status_code == 201
    schedule = ScheduledAgentRun.objects.get(user=user)
    assert schedule.hour == 9
    assert schedule.minute == 30
    assert schedule.is_active is True
    assert schedule.next_run_at > timezone.now()


def test_pause_schedule():
    client, user = _authed_client("sched_pause")
    agent = Agent.objects.get(slug="threads-content-day")
    schedule = ScheduledAgentRun.objects.create(
        user=user,
        agent=agent,
        input_payload=VALID_INPUT,
        hour=9,
        minute=0,
        next_run_at=timezone.now() + timedelta(days=1),
    )

    response = client.patch(
        f"/api/automations/schedules/{schedule.id}/",
        {"is_active": False},
        format="json",
    )

    assert response.status_code == 200
    schedule.refresh_from_db()
    assert schedule.is_active is False


def test_run_due_schedules_triggers_due_schedule_and_advances_next_run(monkeypatch):
    _mock_run_chat_sequence(monkeypatch, ["outline", "hooks", VALID_RESULT_JSON])
    _, user = _authed_client("sched_due")
    agent = Agent.objects.get(slug="threads-content-day")
    due_at = timezone.now() - timedelta(minutes=5)
    schedule = ScheduledAgentRun.objects.create(
        user=user,
        agent=agent,
        input_payload=VALID_INPUT,
        hour=due_at.hour,
        minute=due_at.minute,
        next_run_at=due_at,
    )
    not_due = ScheduledAgentRun.objects.create(
        user=user,
        agent=agent,
        input_payload=VALID_INPUT,
        hour=23,
        minute=59,
        next_run_at=timezone.now() + timedelta(hours=5),
    )

    triggered = automations_tasks.run_due_schedules()

    assert triggered >= 1
    schedule.refresh_from_db()
    assert schedule.last_agent_run is not None
    assert schedule.last_agent_run.status == AgentRun.Status.OK
    assert schedule.next_run_at > timezone.now() + timedelta(hours=23)
    not_due.refresh_from_db()
    assert not_due.last_agent_run is None


def test_run_due_schedules_creates_pending_action_when_publish_channel_set(
    monkeypatch,
):
    _mock_run_chat_sequence(monkeypatch, ["outline", "hooks", VALID_RESULT_JSON])
    _, user = _authed_client("sched_publish")
    agent = Agent.objects.get(slug="threads-content-day")
    channel = TelegramChannel.objects.create(user=user, chat_id=-100999, title="Chan")
    due_at = timezone.now() - timedelta(minutes=1)
    schedule = ScheduledAgentRun.objects.create(
        user=user,
        agent=agent,
        input_payload=VALID_INPUT,
        hour=due_at.hour,
        minute=due_at.minute,
        publish_channel=channel,
        next_run_at=due_at,
    )

    automations_tasks.run_due_schedules()

    schedule.refresh_from_db()
    pending = PendingAction.objects.get(agent_run=schedule.last_agent_run)
    assert pending.status == PendingAction.Status.PENDING_CONFIRMATION
    assert pending.channel == channel
    assert "Сегодня мы запускаемся." in pending.text

    # A later scan tick must not create a second draft for the same run.
    automations_tasks.run_due_schedules()
    assert (
        PendingAction.objects.filter(agent_run=schedule.last_agent_run).count() == 1
    )


# --- Publish flow ---


def test_request_publish_and_confirm_sends_message(monkeypatch):
    sent = {}

    def fake_send_message(chat_id, text):
        sent["chat_id"] = chat_id
        sent["text"] = text
        return {"message_id": 1}

    monkeypatch.setattr(automations_tasks, "send_message", fake_send_message)

    client, user = _authed_client("publish_flow")
    agent_run = _completed_agent_run(user, "publish-flow-run")
    channel = TelegramChannel.objects.create(user=user, chat_id=-100555, title="Chan")

    create_response = client.post(
        "/api/automations/pending-actions/",
        {
            "agent_run_id": agent_run.id,
            "channel_id": channel.id,
            "text": "Готовый пост",
        },
        format="json",
    )
    assert create_response.status_code == 201
    pending_id = create_response.data["id"]

    confirm_response = client.post(
        f"/api/automations/pending-actions/{pending_id}/confirm/"
    )

    assert confirm_response.status_code == 200
    assert confirm_response.data["status"] == "sent"
    assert sent == {"chat_id": -100555, "text": "Готовый пост"}


def test_send_failure_marks_pending_action_failed(monkeypatch):
    def raise_error(chat_id, text):
        raise TelegramApiError("bot is not a member of the channel chat")

    monkeypatch.setattr(automations_tasks, "send_message", raise_error)

    client, user = _authed_client("publish_fail")
    agent_run = _completed_agent_run(user, "publish-fail-run")
    channel = TelegramChannel.objects.create(user=user, chat_id=-1, title="Chan")
    pending = PendingAction.objects.create(
        user=user, agent_run=agent_run, channel=channel, text="text"
    )

    response = client.post(f"/api/automations/pending-actions/{pending.id}/confirm/")

    assert response.status_code == 200
    pending.refresh_from_db()
    assert pending.status == PendingAction.Status.FAILED
    assert "not a member" in pending.error_message


def test_edit_pending_action_text_while_still_pending():
    client, user = _authed_client("edit_flow")
    agent_run = _completed_agent_run(user, "edit-run")
    channel = TelegramChannel.objects.create(user=user, chat_id=-5, title="Chan")
    pending = PendingAction.objects.create(
        user=user, agent_run=agent_run, channel=channel, text="draft"
    )

    response = client.patch(
        f"/api/automations/pending-actions/{pending.id}/",
        {"text": "edited text"},
        format="json",
    )

    assert response.status_code == 200
    pending.refresh_from_db()
    assert pending.text == "edited text"


def test_cannot_edit_pending_action_after_it_was_sent(monkeypatch):
    monkeypatch.setattr(
        automations_tasks, "send_message", lambda chat_id, text: {"message_id": 1}
    )
    client, user = _authed_client("edit_after_send")
    agent_run = _completed_agent_run(user, "edit-after-send-run")
    channel = TelegramChannel.objects.create(user=user, chat_id=-6, title="Chan")
    pending = PendingAction.objects.create(
        user=user, agent_run=agent_run, channel=channel, text="draft"
    )
    client.post(f"/api/automations/pending-actions/{pending.id}/confirm/")

    response = client.patch(
        f"/api/automations/pending-actions/{pending.id}/",
        {"text": "too late"},
        format="json",
    )

    assert response.status_code == 400
    pending.refresh_from_db()
    assert pending.text == "draft"


def test_cancel_pending_action():
    client, user = _authed_client("cancel_flow")
    agent_run = _completed_agent_run(user, "cancel-run")
    channel = TelegramChannel.objects.create(user=user, chat_id=-2, title="Chan")
    pending = PendingAction.objects.create(
        user=user, agent_run=agent_run, channel=channel, text="text"
    )

    response = client.post(f"/api/automations/pending-actions/{pending.id}/cancel/")

    assert response.status_code == 200
    pending.refresh_from_db()
    assert pending.status == PendingAction.Status.CANCELED


def test_pending_action_endpoints_require_ownership():
    _, owner = _authed_client("po_owner")
    other_client, _ = _authed_client("po_other")
    agent_run = _completed_agent_run(owner, "owner-run")
    channel = TelegramChannel.objects.create(user=owner, chat_id=-3, title="Chan")
    pending = PendingAction.objects.create(
        user=owner, agent_run=agent_run, channel=channel, text="text"
    )

    assert (
        other_client.post(
            f"/api/automations/pending-actions/{pending.id}/confirm/"
        ).status_code
        == 404
    )
    assert (
        other_client.post(
            f"/api/automations/pending-actions/{pending.id}/cancel/"
        ).status_code
        == 404
    )


def test_request_publish_requires_owned_agent_run_and_channel():
    _, owner = _authed_client("rp_owner")
    other_client, _ = _authed_client("rp_other")
    agent_run = _completed_agent_run(owner, "rp-run")
    channel = TelegramChannel.objects.create(user=owner, chat_id=-4, title="Chan")

    response = other_client.post(
        "/api/automations/pending-actions/",
        {"agent_run_id": agent_run.id, "channel_id": channel.id, "text": "hack"},
        format="json",
    )

    assert response.status_code == 404


def test_automations_requires_authentication():
    client = APIClient()
    response = client.get("/api/automations/telegram-channels/")
    assert response.status_code == 401


# --- default_publish_text ---


def test_default_publish_text_uses_summary_for_research_and_document_agents():
    assert (
        automations_services.default_publish_text(
            "research-digest", {"summary": "hello"}
        )
        == "hello"
    )
    assert (
        automations_services.default_publish_text(
            "document-summary", {"summary": "world"}
        )
        == "world"
    )


def test_default_publish_text_joins_threads_schedule_post_texts():
    result = {"schedule": [{"post_text": "A"}, {"post_text": "B"}]}
    assert (
        automations_services.default_publish_text("threads-content-day", result)
        == "A\n\nB"
    )


def test_default_publish_text_generic_fallback():
    text = automations_services.default_publish_text("unknown-agent", {"foo": "bar"})
    assert "foo" in text
