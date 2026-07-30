import json
from decimal import Decimal

import pytest

import agents.tasks as agents_tasks
from accounts.models import User as UserModel
from accounts.models import UserContext
from agents.models import AgentRun
from agents.services import render_step_prompt
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


def test_agent_catalog_spans_at_least_three_categories():
    # Guards the Phase 16 repositioning decision: the agent catalog must
    # not read as a single-domain (content/SMM) tool with agents bolted
    # on — see SPEC.md Phase 16 and the "Контекст пользователя"/multi-
    # domain catalog discussion.
    client, _ = _authed_client()
    response = client.get("/api/agents/")
    assert response.status_code == 200
    by_slug = {item["slug"]: item["category"] for item in response.data}
    assert by_slug["threads-content-day"] == "content"
    assert by_slug["research-digest"] == "research"
    assert by_slug["document-summary"] == "documents"
    assert len(set(by_slug.values())) >= 3


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


RESEARCH_DIGEST_INPUT = {"topic": "тренды контент-маркетинга"}

VALID_RESEARCH_DIGEST_RESULT_JSON = json.dumps(
    {
        "topic": "тренды контент-маркетинга",
        "summary": "Короткие форматы продолжают расти.",
        "key_points": ["Видео растёт", "Текст остаётся для экспертизы"],
        "sources_note": "Источник: example.com (2026)",
    }
)


def test_research_digest_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["cited synthesis text", VALID_RESEARCH_DIGEST_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/research-digest/runs/",
        {"input": RESEARCH_DIGEST_INPUT, "idempotency_key": "digest-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["summary"] == "Короткие форматы продолжают расти."
    assert run.result["key_points"] == [
        "Видео растёт",
        "Текст остаётся для экспертизы",
    ]
    assert all(step["status"] == "ok" for step in run.steps)
    assert run.credits_charged == Decimal("3.0")


def test_research_digest_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_RESEARCH_DIGEST_RESULT_JSON
        )
        return ChatOutcome(
            status="ok",
            text=text,
            provider="search",
            model="gpt-4o-mini",
            task=task,
            credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    client, _ = _authed_client()
    response = client.post(
        "/api/agents/research-digest/runs/",
        {"input": RESEARCH_DIGEST_INPUT, "idempotency_key": "digest-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


DOCUMENT_SUMMARY_INPUT = {
    "document_text": "Договор аренды офиса на 12 месяцев, оплата ежемесячно.",
    "question": "Какой срок аренды?",
}

VALID_DOCUMENT_SUMMARY_RESULT_JSON = json.dumps(
    {
        "summary": "Договор аренды офиса сроком на 12 месяцев.",
        "key_points": ["Срок 12 месяцев", "Оплата ежемесячная"],
        "answer": "12 месяцев.",
    }
)


def test_document_summary_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["draft summary text", VALID_DOCUMENT_SUMMARY_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/document-summary/runs/",
        {"input": DOCUMENT_SUMMARY_INPUT, "idempotency_key": "doc-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["answer"] == "12 месяцев."
    assert run.credits_charged == Decimal("3.0")


def test_document_summary_question_is_optional():
    client, _ = _authed_client()
    incomplete_input = {
        "document_text": DOCUMENT_SUMMARY_INPUT["document_text"]
    }

    response = client.post(
        "/api/agents/document-summary/runs/",
        {"input": incomplete_input, "idempotency_key": "doc-no-question"},
        format="json",
    )
    # Missing 'question' must not 400 — only 'document_text' is required.
    assert response.status_code in (202, 200)


def _threads_agent():
    from agents.models import Agent

    return Agent.objects.get(slug="threads-content-day")


def test_render_step_prompt_unchanged_without_user_context():
    agent = _threads_agent()
    step = agent.workflow_steps[0]
    without_arg = render_step_prompt(agent, step, VALID_INPUT, {})
    with_none = render_step_prompt(agent, step, VALID_INPUT, {}, None)
    with_empty = render_step_prompt(agent, step, VALID_INPUT, {}, {})
    assert without_arg == with_none == with_empty
    assert "Профиль пользователя" not in without_arg


def test_render_step_prompt_includes_matching_profile_blocks():
    agent = _threads_agent()
    step = agent.workflow_steps[0]
    user_context = {
        "general": {"tone": "дерзкий"},
        "content": {"niche": "фитнес"},
        # Другой домен не должен попасть в промпт агента категории content.
        "research": {"topics": "нейросети"},
    }
    prompt = render_step_prompt(agent, step, VALID_INPUT, {}, user_context)
    assert "Профиль пользователя" in prompt
    assert "tone: дерзкий" in prompt
    assert "niche: фитнес" in prompt
    assert "topics: нейросети" not in prompt


def test_agent_run_uses_saved_user_context_in_prompt(monkeypatch):
    client, user = _authed_client()
    UserContext.objects.create(
        user=user, data={"general": {"tone": "экспертный"}}
    )
    seen_prompts = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_prompts.append(prompt)
        index = len(seen_prompts)
        text = "outline text" if index == 1 else (
            "hooks text" if index == 2 else VALID_RESULT_JSON
        )
        return ChatOutcome(
            status="ok",
            text=text,
            provider="openai",
            model="gpt-4o-mini",
            task=task,
            credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {"input": VALID_INPUT, "idempotency_key": "context-run"},
        format="json",
    )
    assert response.status_code == 202
    assert all("tone: экспертный" in prompt for prompt in seen_prompts)


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
