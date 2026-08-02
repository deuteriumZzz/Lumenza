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

    calls = {"count": 0, "models": []}

    def fake_run_chat(user, prompt, task=None, model=None):
        index = calls["count"]
        calls["count"] += 1
        calls["models"].append(model)
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


def test_agent_model_preference_is_used_only_for_compatible_steps(monkeypatch):
    client, _ = _authed_client()
    calls = _mock_run_chat_sequence(
        monkeypatch, ["outline text", "hooks text", VALID_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {
            "input": VALID_INPUT,
            "idempotency_key": "run-preferred-model",
            "preferred_model": "gpt-4o-mini",
        },
        format="json",
    )

    assert response.status_code == 202
    run = AgentRun.objects.get(id=response.data["id"])
    assert run.preferred_model == "gpt-4o-mini"
    assert calls["models"] == [None, "gpt-4o-mini", None]


def test_agent_model_access_error_is_user_friendly(monkeypatch):
    client, _ = _authed_client()

    def reject_premium_model(user, prompt, task=None, model=None):
        return ChatOutcome(status="model_requires_pro", task=task)

    monkeypatch.setattr(agents_tasks, "run_chat", reject_premium_model)
    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {
            "input": VALID_INPUT,
            "idempotency_key": "run-locked-model",
            "preferred_model": "gpt-4o-mini",
        },
        format="json",
    )

    assert response.status_code == 202
    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.ERROR
    assert "только в тарифе Pro" in run.error_message
    assert run.steps[0]["error_message"] == (
        "Выбранная premium-модель доступна только в тарифе Pro"
    )


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


def test_render_step_prompt_unchanged_without_knowledge_context():
    agent = _threads_agent()
    step = agent.workflow_steps[0]
    without_arg = render_step_prompt(agent, step, VALID_INPUT, {}, None)
    with_none = render_step_prompt(agent, step, VALID_INPUT, {}, None, None)
    with_empty = render_step_prompt(agent, step, VALID_INPUT, {}, None, [])
    assert without_arg == with_none == with_empty
    assert "Контекст базы знаний" not in without_arg


def test_render_step_prompt_includes_knowledge_context():
    agent = _threads_agent()
    step = agent.workflow_steps[0]
    prompt = render_step_prompt(
        agent, step, VALID_INPUT, {}, None, ["Lumenza — агрегатор AI-моделей."]
    )
    assert "Контекст базы знаний" in prompt
    assert "Lumenza — агрегатор AI-моделей." in prompt


def test_agent_run_uses_workspace_search_results_in_prompt(monkeypatch):
    from knowledge.models import Workspace

    client, user = _authed_client()
    workspace = Workspace.objects.create(user=user, name="Notes")
    client.post(
        f"/api/knowledge/workspaces/{workspace.id}/sources/text/",
        {"text": "Lumenza объединяет чат, поиск и изображения. " * 30},
        format="json",
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
        {
            "input": VALID_INPUT,
            "idempotency_key": "workspace-run",
            "workspace_id": workspace.id,
        },
        format="json",
    )
    assert response.status_code == 202
    run = AgentRun.objects.get(pk=response.data["id"])
    assert run.workspace_id == workspace.id
    assert all("Lumenza объединяет чат" in prompt for prompt in seen_prompts)


def test_agent_run_with_foreign_workspace_returns_400():
    from knowledge.models import Workspace

    client, _ = _authed_client(username="creator2")
    _, other_user = _authed_client(username="other")
    workspace = Workspace.objects.create(user=other_user, name="Not mine")

    response = client.post(
        "/api/agents/threads-content-day/runs/",
        {
            "input": VALID_INPUT,
            "idempotency_key": "foreign-workspace-run",
            "workspace_id": workspace.id,
        },
        format="json",
    )
    assert response.status_code == 400
    assert not AgentRun.objects.filter(
        idempotency_key="foreign-workspace-run"
    ).exists()


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


# --- "Мои агенты" custom agent builder (item 10) -----------------------

CUSTOM_AGENT_INPUT = {
    **VALID_INPUT,
    **DOCUMENT_SUMMARY_INPUT,
}


def test_create_custom_agent_merges_schema_and_forces_final_assemble_key():
    from agents.services import create_custom_agent

    creator = _authed_client("builder")[1]
    agent = create_custom_agent(
        creator,
        "Контент + документы",
        "Собираем план и саммари вместе",
        ["threads-content-day", "document-summary"],
    )

    assert agent.category == "content"  # first source's category
    assert agent.source_agent_slugs == [
        "threads-content-day",
        "document-summary",
    ]
    field_keys = {f["key"] for f in agent.input_schema["fields"]}
    assert field_keys == {
        "topic",
        "audience",
        "tone",
        "goal",
        "document_text",
        "question",
    }
    assert agent.output_schema == {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "key_points": {"type": "array", "items": {"type": "string"}},
            "answer": {"type": "string"},
        },
        "required": ["summary", "key_points", "answer"],
    }
    step_keys = [step["key"] for step in agent.workflow_steps]
    assert len(step_keys) == 5
    assert len(set(step_keys)) == 5  # no cross-source collisions
    assert step_keys[-1] == "assemble"
    assert "document_summary__assemble" not in step_keys


def test_create_custom_agent_api_end_to_end_run(monkeypatch):
    client, _ = _authed_client("builder2")
    create_response = client.post(
        "/api/agents/custom/",
        {
            "name": "Контент + документы",
            "description": "Тестовая связка",
            "agent_slugs": ["threads-content-day", "document-summary"],
        },
        format="json",
    )
    assert create_response.status_code == 201
    slug = create_response.data["slug"]
    assert create_response.data["source_agent_slugs"] == [
        "threads-content-day",
        "document-summary",
    ]

    detail_response = client.get(f"/api/agents/{slug}/")
    assert detail_response.status_code == 200
    assert set(f["key"] for f in detail_response.data["input_schema"]["fields"]) == {
        "topic",
        "audience",
        "tone",
        "goal",
        "document_text",
        "question",
    }

    _mock_run_chat_sequence(
        monkeypatch,
        [
            "outline text",
            "hooks text",
            "assemble text",
            "draft summary text",
            VALID_DOCUMENT_SUMMARY_RESULT_JSON,
        ],
    )
    run_response = client.post(
        f"/api/agents/{slug}/runs/",
        {"input": CUSTOM_AGENT_INPUT, "idempotency_key": "custom-run-1"},
        format="json",
    )
    assert run_response.status_code == 202
    run = AgentRun.objects.get(id=run_response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert len(run.steps) == 5
    assert run.result["answer"] == "12 месяцев."


def test_create_custom_agent_rejects_too_few_or_too_many():
    client, _ = _authed_client("builder3")
    too_few = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day"],
        },
        format="json",
    )
    assert too_few.status_code == 400

    too_many = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": [
                "threads-content-day",
                "research-digest",
                "document-summary",
                "threads-content-day",
            ],
        },
        format="json",
    )
    assert too_many.status_code == 400


def test_create_custom_agent_rejects_duplicate_slugs():
    client, _ = _authed_client("builder4")
    response = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day", "threads-content-day"],
        },
        format="json",
    )
    assert response.status_code == 400


def test_create_custom_agent_rejects_unknown_slug():
    client, _ = _authed_client("builder5")
    response = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day", "no-such-agent"],
        },
        format="json",
    )
    assert response.status_code == 400


def test_create_custom_agent_rejects_another_users_custom_agent_as_source():
    owner_client, owner = _authed_client("builder6")
    owner_client.post(
        "/api/agents/custom/",
        {
            "name": "Приватный",
            "description": "x",
            "agent_slugs": ["threads-content-day", "document-summary"],
        },
        format="json",
    )
    private_slug = owner.custom_agents.get().slug

    other_client, _ = _authed_client("builder7")
    response = other_client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": [private_slug, "research-digest"],
        },
        format="json",
    )
    assert response.status_code == 400


def test_create_custom_agent_requires_at_least_two_categories():
    from agents.models import Agent
    from agents.services import InvalidAgentInputError, create_custom_agent

    # No two seeded agents share a category today, so a second content
    # agent is created here purely to exercise the category-span check.
    Agent.objects.create(
        slug="second-content-agent",
        name="Второй контентный агент",
        description="test fixture",
        category=Agent.Category.CONTENT,
        status=Agent.Status.PUBLISHED,
        input_schema={"fields": []},
        system_instructions="test",
        workflow_steps=[{"key": "assemble", "label": "Собрать", "task": "content_plan"}],
        output_schema={"type": "object", "properties": {}, "required": []},
    )
    creator = _authed_client("builder8")[1]
    with pytest.raises(InvalidAgentInputError):
        create_custom_agent(
            creator,
            "x",
            "x",
            ["threads-content-day", "second-content-agent"],
        )


def test_custom_agent_excluded_from_public_catalog():
    client, _ = _authed_client("builder9")
    client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day", "document-summary"],
        },
        format="json",
    )
    response = client.get("/api/agents/")
    assert response.status_code == 200
    slugs = [item["slug"] for item in response.data]
    assert not any(slug.startswith("custom-") for slug in slugs)


def test_custom_agent_run_and_detail_scoped_to_owner():
    client, _ = _authed_client("builder10")
    create_response = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day", "document-summary"],
        },
        format="json",
    )
    slug = create_response.data["slug"]

    other_client, _ = _authed_client("builder11")
    assert other_client.get(f"/api/agents/{slug}/").status_code == 404
    assert (
        other_client.post(
            f"/api/agents/{slug}/runs/",
            {"input": {}, "idempotency_key": "intruder-run"},
            format="json",
        ).status_code
        == 404
    )
    assert other_client.get(f"/api/agents/custom/{slug}/").status_code == 404
    assert (
        other_client.patch(
            f"/api/agents/custom/{slug}/",
            {"status": "archived"},
            format="json",
        ).status_code
        == 404
    )


def test_archive_custom_agent_hides_it_without_deleting_run_history(
    monkeypatch,
):
    client, _ = _authed_client("builder12")
    create_response = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day", "document-summary"],
        },
        format="json",
    )
    slug = create_response.data["slug"]

    _mock_run_chat_sequence(
        monkeypatch,
        [
            "outline text",
            "hooks text",
            "assemble text",
            "draft summary text",
            VALID_DOCUMENT_SUMMARY_RESULT_JSON,
        ],
    )
    client.post(
        f"/api/agents/{slug}/runs/",
        {"input": CUSTOM_AGENT_INPUT, "idempotency_key": "archive-run-1"},
        format="json",
    )

    archive_response = client.patch(
        f"/api/agents/custom/{slug}/",
        {"status": "archived"},
        format="json",
    )
    assert archive_response.status_code == 200
    assert archive_response.data["status"] == "archived"

    # Excluded from "my agents" list and no longer runnable, but the run
    # row (and its agent FK, on_delete=PROTECT) is untouched.
    assert slug not in [
        item["slug"] for item in client.get("/api/agents/custom/").data
    ]
    assert client.get(f"/api/agents/{slug}/").status_code == 404
    assert AgentRun.objects.filter(
        idempotency_key="archive-run-1"
    ).exists()


def test_archive_custom_agent_rejects_other_payloads():
    client, _ = _authed_client("builder13")
    create_response = client.post(
        "/api/agents/custom/",
        {
            "name": "x",
            "description": "x",
            "agent_slugs": ["threads-content-day", "document-summary"],
        },
        format="json",
    )
    slug = create_response.data["slug"]

    response = client.patch(
        f"/api/agents/custom/{slug}/",
        {"status": "draft"},
        format="json",
    )
    assert response.status_code == 400


FINANCE_DIGEST_INPUT = {"topic": "рынок облигаций РФ"}

VALID_FINANCE_DIGEST_RESULT_JSON = json.dumps(
    {
        "topic": "рынок облигаций РФ",
        "summary": "Доходности стабилизировались на фоне решения ЦБ.",
        "key_points": ["Ставка сохранена", "Спрос на ОФЗ вырос"],
        # Пустая строка нарочно: parse_final_result проверяет только
        # наличие ключа, а agents.tasks._FIXED_DISCLAIMERS должен
        # перезаписать это значение фиксированным текстом независимо от
        # того, что вернула модель.
        "disclaimer": "",
        "sources_note": "По данным открытых источников.",
    }
)


def test_finance_digest_run_overrides_disclaimer_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["cited synthesis text", VALID_FINANCE_DIGEST_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/finance-digest/runs/",
        {"input": FINANCE_DIGEST_INPUT, "idempotency_key": "finance-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["summary"] == "Доходности стабилизировались на фоне решения ЦБ."
    # The model's own (empty) disclaimer must never survive — the fixed
    # constant always wins, regardless of what the LLM returned.
    assert run.result["disclaimer"] == (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    )
    assert run.credits_charged == Decimal("3.0")


def test_finance_digest_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_FINANCE_DIGEST_RESULT_JSON
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
        "/api/agents/finance-digest/runs/",
        {"input": FINANCE_DIGEST_INPUT, "idempotency_key": "finance-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


CONTENT_OPTIMIZER_INPUT = {
    "post_text": "Сегодня мы запускаем новый продукт для малого бизнеса.",
    "platform": "Threads",
}

VALID_CONTENT_OPTIMIZER_RESULT_JSON = json.dumps(
    {
        "variants": ["Короткая версия для Threads."],
        "hooks": ["Мы наконец это сделали."],
        "feedback": "Сильное открытие, добавьте призыв к действию.",
    }
)


def test_content_optimizer_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        [
            "repurposed draft text",
            "alternative hook text",
            VALID_CONTENT_OPTIMIZER_RESULT_JSON,
        ],
    )

    response = client.post(
        "/api/agents/content-optimizer/runs/",
        {"input": CONTENT_OPTIMIZER_INPUT, "idempotency_key": "optimizer-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["feedback"] == (
        "Сильное открытие, добавьте призыв к действию."
    )
    assert run.credits_charged == Decimal("4.5")


def test_content_optimizer_missing_platform_returns_400():
    client, _ = _authed_client()
    incomplete_input = {"post_text": CONTENT_OPTIMIZER_INPUT["post_text"]}

    response = client.post(
        "/api/agents/content-optimizer/runs/",
        {"input": incomplete_input, "idempotency_key": "optimizer-missing"},
        format="json",
    )
    assert response.status_code == 400


WEEKLY_CONTENT_PLAN_INPUT = {
    "topic": "запуск нового продукта",
    "audience": "малый бизнес",
    "platforms": "Threads, Instagram",
}

VALID_WEEKLY_CONTENT_PLAN_RESULT_JSON = json.dumps(
    {
        "days": [
            {
                "day_label": "Понедельник",
                "platform": "Threads",
                "post_text": "Сегодня мы запускаемся.",
                "hashtags": ["#запуск"],
            }
        ]
    }
)


def test_weekly_content_plan_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        [
            "weekly outline text",
            "hashtag suggestions text",
            VALID_WEEKLY_CONTENT_PLAN_RESULT_JSON,
        ],
    )

    response = client.post(
        "/api/agents/weekly-content-plan/runs/",
        {"input": WEEKLY_CONTENT_PLAN_INPUT, "idempotency_key": "weekly-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["days"][0]["platform"] == "Threads"
    assert run.credits_charged == Decimal("4.5")


def test_weekly_content_plan_missing_audience_returns_400():
    client, _ = _authed_client()
    incomplete_input = {
        "topic": WEEKLY_CONTENT_PLAN_INPUT["topic"],
        "platforms": WEEKLY_CONTENT_PLAN_INPUT["platforms"],
    }

    response = client.post(
        "/api/agents/weekly-content-plan/runs/",
        {"input": incomplete_input, "idempotency_key": "weekly-missing"},
        format="json",
    )
    assert response.status_code == 400


COMPETITOR_ANALYSIS_INPUT = {
    "competitor": "Acme Corp",
    "niche": "SaaS для малого бизнеса",
}

VALID_COMPETITOR_ANALYSIS_RESULT_JSON = json.dumps(
    {
        "competitor": "Acme Corp",
        "strengths": ["Известный бренд"],
        "weaknesses": ["Высокая цена"],
        "opportunities": ["Более простой онбординг"],
        "sources_note": "По данным открытых источников.",
    }
)


def test_competitor_analysis_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["cited synthesis text", VALID_COMPETITOR_ANALYSIS_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/competitor-analysis/runs/",
        {"input": COMPETITOR_ANALYSIS_INPUT, "idempotency_key": "competitor-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["opportunities"] == ["Более простой онбординг"]
    assert run.credits_charged == Decimal("3.0")


def test_competitor_analysis_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_COMPETITOR_ANALYSIS_RESULT_JSON
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
        "/api/agents/competitor-analysis/runs/",
        {"input": COMPETITOR_ANALYSIS_INPUT, "idempotency_key": "competitor-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


DOCUMENT_TRANSLATION_INPUT = {
    "document_text": "Договор аренды офиса на 12 месяцев, оплата ежемесячно.",
    "target_language": "English",
}

VALID_DOCUMENT_TRANSLATION_RESULT_JSON = json.dumps(
    {
        "translated_text": "Office lease agreement for 12 months, paid monthly.",
        "summary": "A 12-month office lease with monthly payments.",
    }
)


def test_document_translation_run_is_a_single_step_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, [VALID_DOCUMENT_TRANSLATION_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/document-translation/runs/",
        {"input": DOCUMENT_TRANSLATION_INPUT, "idempotency_key": "translate-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    # Single-step agent: exactly one workflow step, ran once.
    assert len(run.steps) == 1
    assert run.steps[0]["key"] == "assemble"
    assert run.result["translated_text"] == (
        "Office lease agreement for 12 months, paid monthly."
    )
    assert run.credits_charged == Decimal("1.5")


def test_document_translation_missing_target_language_returns_400():
    client, _ = _authed_client()
    incomplete_input = {
        "document_text": DOCUMENT_TRANSLATION_INPUT["document_text"]
    }

    response = client.post(
        "/api/agents/document-translation/runs/",
        {"input": incomplete_input, "idempotency_key": "translate-missing"},
        format="json",
    )
    assert response.status_code == 400
