import json
from decimal import Decimal

import pytest

import agents.tasks as agents_tasks
from accounts.models import User as UserModel
from agents.models import AgentRun
from billing.models import CreditAccount
from providers.registry import REGISTRY
from providers.services import ChatOutcome
from tests.helpers import authed_client as _shared_authed_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="creator", tier=UserModel.Tier.PAID):
    # PAID by default: these tests are about the agent's own run/charge
    # bookkeeping, not about standard/premium routing (already covered in
    # test_providers.py) — a dedicated FREE-tier test isn't needed here
    # since run_chat's own auto-routing already skips premium models for
    # FREE users regardless of caller.
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
    """Stands in for the 3 sequential run_chat() calls a workflow makes.
    The mocked provider adapters (no API keys in test settings) only ever
    echo back a slice of the prompt, which would never be valid JSON for
    the final step — so the happy-path tests need controlled per-call
    text instead of relying on the real (mocked) adapters."""

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


def test_agent_catalog_lists_published_agents():
    client, _ = _authed_client()
    response = client.get("/api/agents/")
    assert response.status_code == 200
    slugs = [item["slug"] for item in response.data]
    assert "threads-content-day" in slugs


def test_agent_detail_returns_input_schema():
    client, _ = _authed_client()
    response = client.get("/api/agents/threads-content-day/")
    assert response.status_code == 200
    fields = {f["key"] for f in response.data["input_schema"]["fields"]}
    assert fields == {"topic", "audience", "tone", "goal"}


def test_create_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, user = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["outline text", "hooks text", VALID_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "run-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["branches"][0]["title"] == "Запуск"
    assert all(step["status"] == "ok" for step in run.steps)
    assert run.credits_charged == Decimal("4.5")


def test_create_run_with_zero_balance_returns_402_without_calling_provider(
    monkeypatch,
):
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    called = {"count": 0}
    original_complete = REGISTRY["anthropic"].complete

    def spy_complete(*args, **kwargs):
        called["count"] += 1
        return original_complete(*args, **kwargs)

    monkeypatch.setattr(REGISTRY["anthropic"], "complete", spy_complete)

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "run-zero"},
        format="json",
    )

    assert response.status_code == 402
    assert called["count"] == 0
    # Creation itself is gated here (unlike a mid-flight chat request) —
    # nothing should have been persisted at all.
    assert not AgentRun.objects.filter(idempotency_key="run-zero").exists()


def test_create_run_missing_required_field_returns_400():
    client, _ = _authed_client()
    incomplete_input = dict(VALID_INPUT)
    del incomplete_input["topic"]

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": incomplete_input, "idempotency_key": "run-missing"},
        format="json",
    )
    assert response.status_code == 400
    assert not AgentRun.objects.filter(
        idempotency_key="run-missing"
    ).exists()


def test_rerun_with_same_idempotency_key_does_not_double_charge(
    monkeypatch,
):
    client, user = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["outline text", "hooks text", VALID_RESULT_JSON]
    )

    first = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "same-key"},
        format="json",
    )
    assert first.status_code == 202

    second = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "same-key"},
        format="json",
    )
    assert second.status_code == 200
    assert second.data["id"] == first.data["id"]
    assert (
        AgentRun.objects.filter(idempotency_key="same-key").count() == 1
    )


def test_step_failure_marks_run_error_and_stops_remaining_steps(
    monkeypatch,
):
    client, _ = _authed_client()
    calls = {"count": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        index = calls["count"]
        calls["count"] += 1
        if index == 1:
            return ChatOutcome(status="provider_error", task=task)
        return ChatOutcome(
            status="ok",
            text="outline text",
            provider="openai",
            model="gpt-4o-mini",
            task=task,
            credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "run-fail"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.ERROR
    assert run.steps[0]["status"] == "ok"
    assert run.steps[1]["status"] == "error"
    assert run.steps[2]["status"] == "pending"


def test_enqueue_failure_marks_run_error(monkeypatch):
    client, _ = _authed_client()

    def boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(agents_tasks.run_agent_task, "delay", boom)

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "run-enqueue-fail"},
        format="json",
    )

    # Deliberately different from imagegen's enqueue-failure test: nothing
    # was charged upfront here (see start_agent_run's docstring), so there
    # is no refund to assert — only that the run itself is marked failed.
    assert response.status_code == 503
    run = AgentRun.objects.get(idempotency_key="run-enqueue-fail")
    assert run.status == AgentRun.Status.ERROR


def test_agent_run_detail_scoped_to_owner(monkeypatch):
    client, _ = _authed_client("owner")
    _mock_run_chat_sequence(monkeypatch, ["a", "b", VALID_RESULT_JSON])
    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "owner-run"},
        format="json",
    )
    run_id = response.data["id"]

    other_client, _ = _authed_client("intruder")
    other_response = other_client.get(f"/api/agents/runs/{run_id}/")
    assert other_response.status_code == 404

    own_response = client.get(f"/api/agents/runs/{run_id}/")
    assert own_response.status_code == 200
