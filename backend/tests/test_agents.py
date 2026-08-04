import json
from decimal import Decimal

import pytest

import agents.tasks as agents_tasks
from accounts.models import User as UserModel
from accounts.models import UserContext
from agents.models import AgentRun
from agents.services import render_step_prompt
from billing.models import CreditAccount
from billing.services import usd_to_credits
from code_interpreter.piston_adapter import CodeExecutionResult
from code_interpreter.pricing import estimate_code_execution_cost_usd
from docgen.pricing import (
    estimate_excel_generation_cost_usd,
    estimate_pptx_generation_cost_usd,
)
from media_ops.base import SpeechResult
from media_ops.nvidia_tts_adapter import DEFAULT_MODEL as NVIDIA_TTS_MODEL
from media_ops.pricing import estimate_speech_cost_usd
from providers.registry import REGISTRY
from providers.services import ChatOutcome
from tests.helpers import authed_client as _shared_authed_client
from videogen.base import VideoResult
from videogen.pricing import estimate_video_cost_usd
from videogen.replicate_video_adapter import TEXT_TO_VIDEO_MODEL

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


# --- Round 2: 15 more agents mined from the Abacus.ai catalog ---

LINKEDIN_OUTREACH_INPUT = {
    "target": "Head of Marketing, Acme Corp",
    "context": "Общий интерес к контент-маркетингу",
    "tone": "дружелюбный",
}

VALID_LINKEDIN_OUTREACH_RESULT_JSON = json.dumps(
    {
        "opening_lines": ["Заметил ваш пост про контент-стратегию —"],
        "message": "Добрый день! Хотел бы обсудить...",
        "follow_up": "Через неделю: короткое напоминание с ценным материалом.",
    }
)


def test_linkedin_outreach_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["outline text", "opener variants text", VALID_LINKEDIN_OUTREACH_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/linkedin-outreach/runs/",
        {"input": LINKEDIN_OUTREACH_INPUT, "idempotency_key": "linkedin-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["follow_up"] == (
        "Через неделю: короткое напоминание с ценным материалом."
    )
    assert run.credits_charged == Decimal("4.5")


def test_linkedin_outreach_missing_context_returns_400():
    client, _ = _authed_client()
    incomplete_input = {"target": LINKEDIN_OUTREACH_INPUT["target"], "tone": "дружелюбный"}

    response = client.post(
        "/api/agents/linkedin-outreach/runs/",
        {"input": incomplete_input, "idempotency_key": "linkedin-missing"},
        format="json",
    )
    assert response.status_code == 400


TWITTER_CONTENT_ENGINE_INPUT = {"niche": "продуктивность для фрилансеров"}

VALID_TWITTER_CONTENT_ENGINE_RESULT_JSON = json.dumps(
    {
        "trending_topics": ["Тайм-блокинг снова в тренде"],
        "tweets": ["Секрет продуктивности — не больше часов, а меньше решений."],
        "thread_idea": "5 привычек фрилансеров, которые реально работают.",
    }
)


def test_twitter_content_engine_run_returns_structured_result(monkeypatch):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["cited synthesis text", VALID_TWITTER_CONTENT_ENGINE_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/twitter-content-engine/runs/",
        {"input": TWITTER_CONTENT_ENGINE_INPUT, "idempotency_key": "twitter-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["thread_idea"] == (
        "5 привычек фрилансеров, которые реально работают."
    )
    assert run.credits_charged == Decimal("3.0")


def test_twitter_content_engine_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_TWITTER_CONTENT_ENGINE_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="search", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    client, _ = _authed_client()
    response = client.post(
        "/api/agents/twitter-content-engine/runs/",
        {"input": TWITTER_CONTENT_ENGINE_INPUT, "idempotency_key": "twitter-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


BLOG_POST_GENERATOR_INPUT = {
    "topic": "удалённая работа",
    "audience": "менеджеры команд",
    "tone": "экспертный",
}

VALID_BLOG_POST_GENERATOR_RESULT_JSON = json.dumps(
    {
        "title": "Как управлять удалённой командой",
        "sections": [{"heading": "Введение", "body": "Удалённая работа изменила..."}],
        "summary": "Ключевые практики управления удалёнными командами.",
    }
)


def test_blog_post_generator_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["draft article text", VALID_BLOG_POST_GENERATOR_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/blog-post-generator/runs/",
        {"input": BLOG_POST_GENERATOR_INPUT, "idempotency_key": "blog-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["title"] == "Как управлять удалённой командой"
    assert run.credits_charged == Decimal("3.0")


def test_blog_post_generator_missing_audience_returns_400():
    client, _ = _authed_client()
    incomplete_input = {
        "topic": BLOG_POST_GENERATOR_INPUT["topic"],
        "tone": BLOG_POST_GENERATOR_INPUT["tone"],
    }

    response = client.post(
        "/api/agents/blog-post-generator/runs/",
        {"input": incomplete_input, "idempotency_key": "blog-missing"},
        format="json",
    )
    assert response.status_code == 400


OFFER_LETTER_DRAFTER_INPUT = {
    "candidate_name": "Иван Петров",
    "role": "Senior Backend Engineer",
    "key_terms": "Оклад 250000, старт 1 сентября, гибридный формат",
}

VALID_OFFER_LETTER_DRAFTER_RESULT_JSON = json.dumps(
    {
        "offer_letter_text": "Уважаемый Иван! Рады предложить вам позицию...",
        "key_terms": ["Оклад 250000", "Старт 1 сентября", "Гибридный формат"],
    }
)


def test_offer_letter_drafter_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["outline text", VALID_OFFER_LETTER_DRAFTER_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/offer-letter-drafter/runs/",
        {"input": OFFER_LETTER_DRAFTER_INPUT, "idempotency_key": "offer-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["key_terms"] == [
        "Оклад 250000", "Старт 1 сентября", "Гибридный формат",
    ]
    assert run.credits_charged == Decimal("3.0")


def test_offer_letter_drafter_missing_role_returns_400():
    client, _ = _authed_client()
    incomplete_input = {
        "candidate_name": OFFER_LETTER_DRAFTER_INPUT["candidate_name"],
        "key_terms": OFFER_LETTER_DRAFTER_INPUT["key_terms"],
    }

    response = client.post(
        "/api/agents/offer-letter-drafter/runs/",
        {"input": incomplete_input, "idempotency_key": "offer-missing"},
        format="json",
    )
    assert response.status_code == 400


RECIPE_CREATOR_INPUT = {"theme_or_ingredients": "лёгкий летний ужин с курицей"}

VALID_RECIPE_CREATOR_RESULT_JSON = json.dumps(
    {
        "title": "Летний салат с курицей гриль",
        "ingredients": ["Куриное филе", "Салатный микс"],
        "steps": ["Обжарить курицу", "Собрать салат"],
        "intro_text": "Идеальный лёгкий ужин на летний вечер.",
    }
)


def test_recipe_creator_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["outline text", VALID_RECIPE_CREATOR_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/recipe-creator/runs/",
        {"input": RECIPE_CREATOR_INPUT, "idempotency_key": "recipe-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["title"] == "Летний салат с курицей гриль"
    assert run.credits_charged == Decimal("3.0")


def test_recipe_creator_missing_input_returns_400():
    client, _ = _authed_client()
    response = client.post(
        "/api/agents/recipe-creator/runs/",
        {"input": {}, "idempotency_key": "recipe-missing"},
        format="json",
    )
    assert response.status_code == 400


SUPPORT_REPLY_DRAFTER_INPUT = {
    "customer_message": "Мой заказ до сих пор не пришёл, прошло 2 недели.",
    "context": "Заказ задержан на таможне, ожидаем ещё 3-5 дней.",
}

VALID_SUPPORT_REPLY_DRAFTER_RESULT_JSON = json.dumps(
    {
        "reply_text": "Приносим извинения за задержку — ваш заказ на таможне...",
        "tone_note": "Извиняющийся, но конкретный тон с чёткими сроками.",
    }
)


def test_support_reply_drafter_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["outline text", VALID_SUPPORT_REPLY_DRAFTER_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/support-reply-drafter/runs/",
        {"input": SUPPORT_REPLY_DRAFTER_INPUT, "idempotency_key": "support-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["reply_text"].startswith("Приносим извинения")
    assert run.credits_charged == Decimal("3.0")


def test_support_reply_drafter_context_is_optional():
    client, _ = _authed_client()
    incomplete_input = {
        "customer_message": SUPPORT_REPLY_DRAFTER_INPUT["customer_message"],
    }

    response = client.post(
        "/api/agents/support-reply-drafter/runs/",
        {"input": incomplete_input, "idempotency_key": "support-no-context"},
        format="json",
    )
    assert response.status_code in (202, 200)


AUDIENCE_SENTIMENT_INPUT = {"topic_or_brand": "новый релиз iPhone"}

VALID_AUDIENCE_SENTIMENT_RESULT_JSON = json.dumps(
    {
        "overall_sentiment": "Преимущественно позитивный",
        "themes": ["Камера хвалят", "Цена критикуют"],
        "notable_mentions": ["Обзор на популярном YouTube-канале"],
        "sources_note": "По данным открытых источников.",
    }
)


def test_audience_sentiment_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["cited synthesis text", VALID_AUDIENCE_SENTIMENT_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/audience-sentiment/runs/",
        {"input": AUDIENCE_SENTIMENT_INPUT, "idempotency_key": "sentiment-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["overall_sentiment"] == "Преимущественно позитивный"
    assert run.credits_charged == Decimal("3.0")


def test_audience_sentiment_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_AUDIENCE_SENTIMENT_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="search", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    client, _ = _authed_client()
    response = client.post(
        "/api/agents/audience-sentiment/runs/",
        {"input": AUDIENCE_SENTIMENT_INPUT, "idempotency_key": "sentiment-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


RESEARCH_REPORT_INPUT = {"topic": "будущее удалённой работы", "audience": "HR-директора"}

VALID_RESEARCH_REPORT_RESULT_JSON = json.dumps(
    {
        "title": "Будущее удалённой работы",
        "sections": [{"heading": "Текущее состояние", "body": "Рынок труда меняется..."}],
        "key_takeaways": ["Гибридный формат становится нормой"],
    }
)


def test_research_report_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["cited synthesis text", "draft report text", VALID_RESEARCH_REPORT_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/research-report/runs/",
        {"input": RESEARCH_REPORT_INPUT, "idempotency_key": "report-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["key_takeaways"] == ["Гибридный формат становится нормой"]
    assert run.credits_charged == Decimal("4.5")


def test_research_report_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        if len(seen_tasks) == 1:
            text = "cited synthesis text"
        elif len(seen_tasks) == 2:
            text = "draft report text"
        else:
            text = VALID_RESEARCH_REPORT_RESULT_JSON
        return ChatOutcome(
            status="ok", text=text, provider="search", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    client, _ = _authed_client()
    response = client.post(
        "/api/agents/research-report/runs/",
        {"input": RESEARCH_REPORT_INPUT, "idempotency_key": "report-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "longform"
    assert seen_tasks[2] == "content_plan"


INVOICE_DATA_EXTRACTOR_INPUT = {
    "document_text": "Счёт №123 от ООО Ромашка на сумму 15000 руб., срок оплаты 10.09.2026.",
}

VALID_INVOICE_DATA_EXTRACTOR_RESULT_JSON = json.dumps(
    {
        "vendor": "ООО Ромашка",
        "amount": "15000 руб.",
        "due_date": "10.09.2026",
        "line_items": ["Консультационные услуги"],
    }
)


def test_invoice_data_extractor_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["extracted text", VALID_INVOICE_DATA_EXTRACTOR_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/invoice-data-extractor/runs/",
        {"input": INVOICE_DATA_EXTRACTOR_INPUT, "idempotency_key": "invoice-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["vendor"] == "ООО Ромашка"
    assert run.credits_charged == Decimal("3.0")


def test_invoice_data_extractor_missing_document_returns_400():
    client, _ = _authed_client()
    response = client.post(
        "/api/agents/invoice-data-extractor/runs/",
        {"input": {}, "idempotency_key": "invoice-missing"},
        format="json",
    )
    assert response.status_code == 400


RFP_RESPONSE_DRAFTER_INPUT = {
    "document_text": "1. Опишите ваш опыт. 2. Укажите сроки внедрения.",
    "company_context": "Мы — команда из 10 разработчиков с 5-летним опытом.",
}

VALID_RFP_RESPONSE_DRAFTER_RESULT_JSON = json.dumps(
    {
        "responses": [
            {"question": "Опишите ваш опыт.", "answer": "У нас 5-летний опыт..."},
        ],
        "summary": "Готовая заявка на основе предоставленного контекста.",
    }
)


def test_rfp_response_drafter_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["draft responses text", VALID_RFP_RESPONSE_DRAFTER_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/rfp-response-drafter/runs/",
        {"input": RFP_RESPONSE_DRAFTER_INPUT, "idempotency_key": "rfp-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["summary"] == "Готовая заявка на основе предоставленного контекста."
    assert run.credits_charged == Decimal("3.0")


def test_rfp_response_drafter_missing_company_context_returns_400():
    client, _ = _authed_client()
    incomplete_input = {"document_text": RFP_RESPONSE_DRAFTER_INPUT["document_text"]}

    response = client.post(
        "/api/agents/rfp-response-drafter/runs/",
        {"input": incomplete_input, "idempotency_key": "rfp-missing"},
        format="json",
    )
    assert response.status_code == 400


RESUME_JOB_MATCHER_INPUT = {
    "resume_text": "5 лет опыта в Python, Django, PostgreSQL.",
}

VALID_RESUME_JOB_MATCHER_RESULT_JSON = json.dumps(
    {
        "strengths": ["Сильный опыт в Python/Django"],
        "gaps": ["Нет опыта с Kubernetes"],
        "tailored_summary": "Опытный backend-разработчик широкого профиля.",
    }
)


def test_resume_job_matcher_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["analysis text", VALID_RESUME_JOB_MATCHER_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/resume-job-matcher/runs/",
        {"input": RESUME_JOB_MATCHER_INPUT, "idempotency_key": "resume-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["gaps"] == ["Нет опыта с Kubernetes"]
    assert run.credits_charged == Decimal("3.0")


def test_resume_job_matcher_job_description_is_optional():
    client, _ = _authed_client()

    response = client.post(
        "/api/agents/resume-job-matcher/runs/",
        {"input": RESUME_JOB_MATCHER_INPUT, "idempotency_key": "resume-no-jd"},
        format="json",
    )
    assert response.status_code in (202, 200)


CONTRACT_ANALYZER_INPUT = {
    "document_text": "Договор оказания услуг между ООО А и ООО Б сроком на 1 год.",
}

VALID_CONTRACT_ANALYZER_RESULT_JSON = json.dumps(
    {
        "summary": "Договор оказания услуг сроком на 1 год.",
        "key_terms": ["Срок 1 год"],
        "risks": ["Нет пункта о досрочном расторжении"],
        "recommendations": ["Добавить пункт о досрочном расторжении"],
    }
)


def test_contract_analyzer_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["analysis text", VALID_CONTRACT_ANALYZER_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/contract-analyzer/runs/",
        {"input": CONTRACT_ANALYZER_INPUT, "idempotency_key": "contract-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["risks"] == ["Нет пункта о досрочном расторжении"]
    assert run.credits_charged == Decimal("3.0")


def test_contract_analyzer_missing_document_returns_400():
    client, _ = _authed_client()
    response = client.post(
        "/api/agents/contract-analyzer/runs/",
        {"input": {}, "idempotency_key": "contract-missing"},
        format="json",
    )
    assert response.status_code == 400


MARKET_RESEARCH_INPUT = {"sector_or_theme": "рынок электромобилей"}

VALID_MARKET_RESEARCH_RESULT_JSON = json.dumps(
    {
        "theme": "рынок электромобилей",
        "trends": ["Рост спроса на бюджетные модели"],
        "key_players": ["Tesla", "BYD"],
        "disclaimer": "",
        "sources_note": "По данным открытых источников.",
    }
)


def test_market_research_run_overrides_disclaimer_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["cited synthesis text", VALID_MARKET_RESEARCH_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/market-research/runs/",
        {"input": MARKET_RESEARCH_INPUT, "idempotency_key": "market-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["key_players"] == ["Tesla", "BYD"]
    assert run.result["disclaimer"] == (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    )
    assert run.credits_charged == Decimal("3.0")


def test_market_research_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_MARKET_RESEARCH_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="search", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    client, _ = _authed_client()
    response = client.post(
        "/api/agents/market-research/runs/",
        {"input": MARKET_RESEARCH_INPUT, "idempotency_key": "market-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


FINANCIAL_REPORT_ANALYZER_INPUT = {
    "document_text": "Выручка выросла на 12%, чистая прибыль снизилась на 3%.",
}

VALID_FINANCIAL_REPORT_ANALYZER_RESULT_JSON = json.dumps(
    {
        "summary": "Выручка растёт, но маржинальность под давлением.",
        "key_metrics": ["Выручка +12%", "Чистая прибыль -3%"],
        "red_flags": ["Снижение чистой прибыли при росте выручки"],
        "disclaimer": "",
    }
)


def test_financial_report_analyzer_run_overrides_disclaimer_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["analysis text", VALID_FINANCIAL_REPORT_ANALYZER_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/financial-report-analyzer/runs/",
        {"input": FINANCIAL_REPORT_ANALYZER_INPUT, "idempotency_key": "finreport-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["red_flags"] == [
        "Снижение чистой прибыли при росте выручки",
    ]
    assert run.result["disclaimer"] == (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    )
    assert run.credits_charged == Decimal("3.0")


def test_financial_report_analyzer_missing_document_returns_400():
    client, _ = _authed_client()
    response = client.post(
        "/api/agents/financial-report-analyzer/runs/",
        {"input": {}, "idempotency_key": "finreport-missing"},
        format="json",
    )
    assert response.status_code == 400


INVESTMENT_RESEARCH_INPUT = {"asset": "индекс S&P 500"}

VALID_INVESTMENT_RESEARCH_RESULT_JSON = json.dumps(
    {
        "asset": "индекс S&P 500",
        "thesis": "Долгосрочный рост, обусловленный технологическим сектором.",
        "risks": ["Волатильность на фоне ставок ФРС"],
        "disclaimer": "",
        "sources_note": "По данным открытых источников.",
    }
)


def test_investment_research_run_overrides_disclaimer_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["cited synthesis text", VALID_INVESTMENT_RESEARCH_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/investment-research/runs/",
        {"input": INVESTMENT_RESEARCH_INPUT, "idempotency_key": "investresearch-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["risks"] == ["Волатильность на фоне ставок ФРС"]
    assert run.result["disclaimer"] == (
        "Материал носит информационный характер и не является "
        "индивидуальной инвестиционной рекомендацией."
    )
    assert run.credits_charged == Decimal("3.0")


def test_investment_research_first_step_uses_search_task(monkeypatch):
    seen_tasks = []

    def fake_run_chat(user, prompt, task=None, model=None):
        seen_tasks.append(task)
        text = (
            "cited synthesis text"
            if len(seen_tasks) == 1
            else VALID_INVESTMENT_RESEARCH_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="search", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    client, _ = _authed_client()
    response = client.post(
        "/api/agents/investment-research/runs/",
        {"input": INVESTMENT_RESEARCH_INPUT, "idempotency_key": "investresearch-2"},
        format="json",
    )
    assert response.status_code == 202
    assert seen_tasks[0] == "search"
    assert seen_tasks[1] == "content_plan"


# --- Engine extension: code_execution / video_generation sentinel steps ---


def test_run_agent_task_has_a_time_limit():
    # The first (and, as of this test, only) Celery time limit anywhere in
    # this codebase — a video-containing agent run has no other backstop
    # against an unbounded Replicate wait.
    assert agents_tasks.run_agent_task.soft_time_limit == 240
    assert agents_tasks.run_agent_task.time_limit == 300


DATA_QUICK_CHECK_INPUT = {
    "question": "Какое среднее у чисел 4, 8, 15, 16, 23, 42?",
    "data": "4, 8, 15, 16, 23, 42",
}

VALID_DATA_QUICK_CHECK_RESULT_JSON = json.dumps(
    {
        "question": "Какое среднее у чисел 4, 8, 15, 16, 23, 42?",
        "code_stdout": "",
        "explanation": "Среднее значение вычислено скриптом.",
    }
)


def test_data_quick_check_run_injects_real_code_stdout(monkeypatch):
    client, _ = _authed_client()

    def fake_run_chat(user, prompt, task=None, model=None):
        text = (
            "print(sum([4,8,15,16,23,42])/6)"
            if task == "longform"
            else VALID_DATA_QUICK_CHECK_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    monkeypatch.setattr(
        agents_tasks.PistonAdapter,
        "execute",
        lambda self, code: CodeExecutionResult(
            stdout="18.0\n", stderr="", exit_code=0,
            language="python", version="3.12.0", cost_usd=0.001,
        ),
    )

    response = client.post(
        "/api/agents/data-quick-check/runs/",
        {"input": DATA_QUICK_CHECK_INPUT, "idempotency_key": "quickcheck-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    # The model's own (empty) code_stdout must never survive — the real
    # Piston stdout always wins.
    assert run.result["code_stdout"] == "18.0\n"
    assert run.steps[1]["stdout"] == "18.0\n"
    assert run.steps[1]["exit_code"] == 0
    expected_code_credits = usd_to_credits(estimate_code_execution_cost_usd())
    assert run.credits_charged == Decimal("1.5") + expected_code_credits + Decimal("1.5")


def test_data_quick_check_code_step_blocked_by_moderation_refunds_hold(
    monkeypatch,
):
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)

    def fake_run_chat(user, prompt, task=None, model=None):
        return ChatOutcome(
            status="ok", text="print('child sexual content')", provider="openai",
            model="gpt-4o-mini", task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    response = client.post(
        "/api/agents/data-quick-check/runs/",
        {"input": DATA_QUICK_CHECK_INPUT, "idempotency_key": "quickcheck-2"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.BLOCKED
    account.refresh_from_db()
    # Only the first (chat) step's hold was ever charged and never refunded
    # (run_chat's own internal reconcile already settled it) — the
    # moderation-blocked code step's own hold must be fully refunded, not
    # left charged.
    assert run.steps[1]["status"] == "error"


def test_data_quick_check_code_step_provider_error_refunds_hold(monkeypatch):
    client, _ = _authed_client()

    def fake_run_chat(user, prompt, task=None, model=None):
        return ChatOutcome(
            status="ok", text="print(1)", provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    def boom(self, code):
        raise RuntimeError("piston unavailable")

    monkeypatch.setattr(agents_tasks.PistonAdapter, "execute", boom)

    response = client.post(
        "/api/agents/data-quick-check/runs/",
        {"input": DATA_QUICK_CHECK_INPUT, "idempotency_key": "quickcheck-3"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.ERROR
    assert run.steps[1]["status"] == "error"


VIDEO_TEASER_INPUT = {"brief": "30-секундный энергичный тизер для нового кофейного бренда"}

VALID_VIDEO_TEASER_RESULT_JSON = json.dumps(
    {"caption": "Просыпайся с новым вкусом.", "video_url": ""}
)


def test_video_teaser_generator_run_injects_real_video_url(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat_ordered(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "energetic coffee brand teaser, warm morning light"
            if call_count["n"] == 1
            else VALID_VIDEO_TEASER_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat_ordered)

    class FakeVideoAdapter:
        def generate(self, prompt, model=None, **kwargs):
            return VideoResult(
                video_bytes=b"fake video bytes",
                cost_usd=0.25,
                model=TEXT_TO_VIDEO_MODEL,
                mocked=True,
            )

    monkeypatch.setattr(
        agents_tasks, "get_video_adapter", lambda name: FakeVideoAdapter()
    )

    response = client.post(
        "/api/agents/video-teaser-generator/runs/",
        {"input": VIDEO_TEASER_INPUT, "idempotency_key": "teaser-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["caption"] == "Просыпайся с новым вкусом."
    # The model's own (empty) video_url must never survive — the real
    # GeneratedVideo file URL always wins.
    assert run.result["video_url"]
    assert run.result["video_url"].endswith(".gif")  # mocked=True -> gif
    assert run.steps[1]["video_url"] == run.result["video_url"]
    expected_video_credits = usd_to_credits(
        estimate_video_cost_usd(TEXT_TO_VIDEO_MODEL)
    )
    assert (
        run.credits_charged
        == Decimal("1.5") + expected_video_credits + Decimal("1.5")
    )

    from videogen.models import GeneratedVideo

    assert GeneratedVideo.objects.filter(user_id=run.user_id).exists()


def test_video_teaser_generator_video_step_blocked_by_moderation(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "child sexual content"
            if call_count["n"] == 1
            else VALID_VIDEO_TEASER_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    response = client.post(
        "/api/agents/video-teaser-generator/runs/",
        {"input": VIDEO_TEASER_INPUT, "idempotency_key": "teaser-2"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.BLOCKED
    assert run.steps[1]["status"] == "error"


# --- Round 4: code-review-agent, python-test-writer, product-demo-video ---

CODE_REVIEW_INPUT = {
    "code": "def add(a, b):\n    return a+b",
    "language": "Python",
}

VALID_CODE_REVIEW_RESULT_JSON = json.dumps(
    {
        "issues": [{"severity": "low", "description": "Нет аннотаций типов."}],
        "suggestions": ["Добавить type hints и докстринг."],
        "summary": "Код рабочий, но можно улучшить читаемость.",
    }
)


def test_code_review_agent_run_charges_credits_and_returns_structured_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch, ["review draft text", VALID_CODE_REVIEW_RESULT_JSON]
    )

    response = client.post(
        "/api/agents/code-review-agent/runs/",
        {"input": CODE_REVIEW_INPUT, "idempotency_key": "codereview-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert (
        run.result["summary"]
        == "Код рабочий, но можно улучшить читаемость."
    )
    assert run.credits_charged == Decimal("3.0")


def test_code_review_agent_missing_language_returns_400():
    client, _ = _authed_client()
    incomplete_input = {"code": CODE_REVIEW_INPUT["code"]}

    response = client.post(
        "/api/agents/code-review-agent/runs/",
        {"input": incomplete_input, "idempotency_key": "codereview-missing"},
        format="json",
    )
    assert response.status_code == 400


PYTHON_TEST_WRITER_INPUT = {"code": "def add(a, b):\n    return a + b"}

VALID_PYTHON_TEST_WRITER_RESULT_JSON = json.dumps(
    {
        "test_code": (
            "def add(a, b):\n    return a + b\n\nimport unittest\n..."
        ),
        "code_stdout": "",
        "summary": "Все тесты прошли успешно.",
    }
)


def test_python_test_writer_run_injects_real_code_stdout(monkeypatch):
    client, _ = _authed_client()

    def fake_run_chat(user, prompt, task=None, model=None):
        text = (
            "def add(a, b):\n    return a + b\nimport unittest\n"
            "class T(unittest.TestCase):\n    def test_add(self): "
            "self.assertEqual(add(1,2),3)\n"
            "unittest.main(exit=False)"
            if task == "longform"
            else VALID_PYTHON_TEST_WRITER_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    monkeypatch.setattr(
        agents_tasks.PistonAdapter,
        "execute",
        lambda self, code: CodeExecutionResult(
            stdout="Ran 1 test in 0.000s\n\nOK\n", stderr="", exit_code=0,
            language="python", version="3.12.0", cost_usd=0.001,
        ),
    )

    response = client.post(
        "/api/agents/python-test-writer/runs/",
        {"input": PYTHON_TEST_WRITER_INPUT, "idempotency_key": "testwriter-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    # The model's own (empty) code_stdout must never survive.
    assert run.result["code_stdout"] == "Ran 1 test in 0.000s\n\nOK\n"
    assert run.steps[1]["exit_code"] == 0
    expected_code_credits = usd_to_credits(estimate_code_execution_cost_usd())
    assert run.credits_charged == (
        Decimal("1.5") + expected_code_credits + Decimal("1.5")
    )


def test_python_test_writer_provider_error_refunds_hold(monkeypatch):
    client, _ = _authed_client()

    def fake_run_chat(user, prompt, task=None, model=None):
        return ChatOutcome(
            status="ok", text="print(1)", provider="openai",
            model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    def boom(self, code):
        raise RuntimeError("piston unavailable")

    monkeypatch.setattr(agents_tasks.PistonAdapter, "execute", boom)

    response = client.post(
        "/api/agents/python-test-writer/runs/",
        {"input": PYTHON_TEST_WRITER_INPUT, "idempotency_key": "testwriter-2"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.ERROR
    assert run.steps[1]["status"] == "error"


PRODUCT_DEMO_VIDEO_INPUT = {
    "product_description": (
        "Мобильное приложение для трекинга привычек с напоминаниями"
    ),
}

VALID_PRODUCT_DEMO_VIDEO_RESULT_JSON = json.dumps(
    {"caption": "Постройте полезные привычки шаг за шагом.", "video_url": ""}
)


def test_product_demo_video_run_injects_real_video_url(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "calm product demo, showing app screens and features"
            if call_count["n"] == 1
            else VALID_PRODUCT_DEMO_VIDEO_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    class FakeVideoAdapter:
        def generate(self, prompt, model=None, **kwargs):
            return VideoResult(
                video_bytes=b"fake video bytes",
                cost_usd=0.25,
                model=TEXT_TO_VIDEO_MODEL,
                mocked=True,
            )

    monkeypatch.setattr(
        agents_tasks, "get_video_adapter", lambda name: FakeVideoAdapter()
    )

    response = client.post(
        "/api/agents/product-demo-video/runs/",
        {"input": PRODUCT_DEMO_VIDEO_INPUT, "idempotency_key": "demo-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["caption"] == "Постройте полезные привычки шаг за шагом."
    assert run.result["video_url"]
    assert run.result["video_url"].endswith(".gif")


# --- Round 6: audio_generation sentinel step + Аудио category ---

PODCAST_SUMMARY_INPUT = {
    "article_text": (
        "Учёные обнаружили новый способ переработки пластика с помощью "
        "ферментов."
    ),
}

VALID_PODCAST_SUMMARY_RESULT_JSON = json.dumps(
    {
        "title": "Пластик и ферменты",
        "audio_url": "",
        "description": "Короткий разбор новой технологии переработки.",
    }
)


def test_podcast_summary_run_injects_real_audio_url(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "Привет! Сегодня поговорим о переработке пластика ферментами."
            if call_count["n"] == 1
            else VALID_PODCAST_SUMMARY_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    monkeypatch.setattr(
        agents_tasks.NvidiaTtsAdapter,
        "synthesize",
        lambda self, text, model=None, **kwargs: SpeechResult(
            audio_bytes=b"fake mp3 bytes",
            cost_usd=0.015,
            model=NVIDIA_TTS_MODEL,
            mocked=True,
        ),
    )

    response = client.post(
        "/api/agents/podcast-summary/runs/",
        {"input": PODCAST_SUMMARY_INPUT, "idempotency_key": "podcast-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["title"] == "Пластик и ферменты"
    # The model's own (empty) audio_url must never survive — the real
    # SpeechClip file URL always wins.
    assert run.result["audio_url"]
    assert run.result["audio_url"].endswith(".mp3")
    assert run.steps[1]["audio_url"] == run.result["audio_url"]
    expected_audio_credits = usd_to_credits(
        estimate_speech_cost_usd(NVIDIA_TTS_MODEL)
    )
    assert (
        run.credits_charged
        == Decimal("1.5") + expected_audio_credits + Decimal("1.5")
    )

    from media_ops.models import SpeechClip

    assert SpeechClip.objects.filter(user_id=run.user_id).exists()


def test_podcast_summary_audio_step_blocked_by_moderation(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "child sexual content"
            if call_count["n"] == 1
            else VALID_PODCAST_SUMMARY_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    response = client.post(
        "/api/agents/podcast-summary/runs/",
        {"input": PODCAST_SUMMARY_INPUT, "idempotency_key": "podcast-2"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.BLOCKED
    assert run.steps[1]["status"] == "error"


def test_podcast_summary_audio_step_provider_error_refunds_hold(monkeypatch):
    client, _ = _authed_client()

    def fake_run_chat(user, prompt, task=None, model=None):
        return ChatOutcome(
            status="ok", text="Скрипт подкаста.", provider="openai",
            model="gpt-4o-mini", task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    def boom(self, text, model=None, **kwargs):
        raise RuntimeError("tts unavailable")

    monkeypatch.setattr(agents_tasks.NvidiaTtsAdapter, "synthesize", boom)

    response = client.post(
        "/api/agents/podcast-summary/runs/",
        {"input": PODCAST_SUMMARY_INPUT, "idempotency_key": "podcast-3"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.ERROR
    assert run.steps[1]["status"] == "error"


AUDIO_AD_CREATOR_INPUT = {
    "product_description": "Приложение для трекинга привычек с напоминаниями",
}

VALID_AUDIO_AD_CREATOR_RESULT_JSON = json.dumps(
    {
        "script": "Хочешь новых привычек? Скачай наше приложение!",
        "audio_url": "",
        "caption": "Реклама приложения-трекера привычек.",
    }
)


def test_audio_ad_creator_run_injects_real_audio_url(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "Хочешь новых привычек? Скачай наше приложение!"
            if call_count["n"] == 1
            else VALID_AUDIO_AD_CREATOR_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    monkeypatch.setattr(
        agents_tasks.NvidiaTtsAdapter,
        "synthesize",
        lambda self, text, model=None, **kwargs: SpeechResult(
            audio_bytes=b"fake mp3 bytes",
            cost_usd=0.015,
            model=NVIDIA_TTS_MODEL,
            mocked=True,
        ),
    )

    response = client.post(
        "/api/agents/audio-ad-creator/runs/",
        {"input": AUDIO_AD_CREATOR_INPUT, "idempotency_key": "audioad-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["caption"] == "Реклама приложения-трекера привычек."
    assert run.result["audio_url"]
    assert run.result["audio_url"].endswith(".mp3")


# --- Phase A: travel-itinerary-planner, review-sentiment-classifier ---

TRAVEL_ITINERARY_INPUT = {
    "destination": "Токио",
    "trip_details": "5 дней, средний бюджет, интересует еда и храмы",
}

VALID_TRAVEL_ITINERARY_RESULT_JSON = json.dumps(
    {
        "destination": "Токио",
        "itinerary": [
            {
                "day_label": "День 1",
                "activities": ["Сэнсодзи", "Асакуса"],
            },
        ],
        "budget_note": (
            "Средний бюджет позволяет 2-3 приёма пищи в день вне дома."
        ),
    }
)


def test_travel_itinerary_planner_run_returns_structured_itinerary(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(
        monkeypatch,
        ["заметки о Токио", VALID_TRAVEL_ITINERARY_RESULT_JSON],
    )

    response = client.post(
        "/api/agents/travel-itinerary-planner/runs/",
        {"input": TRAVEL_ITINERARY_INPUT, "idempotency_key": "travel-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["destination"] == "Токио"
    assert run.result["itinerary"][0]["day_label"] == "День 1"
    assert run.credits_charged == Decimal("3.0")


def test_travel_itinerary_planner_missing_trip_details_returns_400():
    client, _ = _authed_client()
    incomplete_input = {"destination": TRAVEL_ITINERARY_INPUT["destination"]}

    response = client.post(
        "/api/agents/travel-itinerary-planner/runs/",
        {"input": incomplete_input, "idempotency_key": "travel-missing"},
        format="json",
    )
    assert response.status_code == 400


REVIEW_SENTIMENT_INPUT = {
    "reviews_text": (
        "Отличный сервис, быстро доставили!\n"
        "Заказ пришёл сломанным, никто не отвечает на письма."
    ),
}

VALID_REVIEW_SENTIMENT_RESULT_JSON = json.dumps(
    {
        "classified_reviews": [
            {
                "review_snippet": "Отличный сервис, быстро доставили!",
                "sentiment": "позитивная",
                "urgency": "низкая",
                "reason": "Довольный клиент, без жалоб.",
            },
            {
                "review_snippet": "Заказ пришёл сломанным...",
                "sentiment": "негативная",
                "urgency": "высокая",
                "reason": "Сломанный товар и отсутствие ответа поддержки.",
            },
        ],
        "overall_summary": (
            "Один довольный отзыв, один требует срочной реакции."
        ),
    }
)


def test_review_sentiment_classifier_run_is_a_single_step_and_returns_result(
    monkeypatch,
):
    client, _ = _authed_client()
    _mock_run_chat_sequence(monkeypatch, [VALID_REVIEW_SENTIMENT_RESULT_JSON])

    response = client.post(
        "/api/agents/review-sentiment-classifier/runs/",
        {"input": REVIEW_SENTIMENT_INPUT, "idempotency_key": "reviews-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    # Single-step agent: exactly one workflow step, ran once.
    assert len(run.steps) == 1
    assert run.steps[0]["key"] == "assemble"
    assert len(run.result["classified_reviews"]) == 2
    assert run.result["classified_reviews"][1]["urgency"] == "высокая"
    assert run.credits_charged == Decimal("1.5")


def test_review_sentiment_classifier_missing_reviews_returns_400():
    client, _ = _authed_client()

    response = client.post(
        "/api/agents/review-sentiment-classifier/runs/",
        {"input": {}, "idempotency_key": "reviews-missing"},
        format="json",
    )
    assert response.status_code == 400


# --- Phase B: pptx_generation/excel_generation sentinels, 2 new agents ---

PITCH_DECK_INPUT = {
    "topic": "Продукт X",
    "key_points": "Растём на 20% в квартал, три ключевых клиента",
}

PITCH_DECK_STRUCTURE_JSON = json.dumps(
    {
        "title": "Продукт X",
        "slides": [
            {
                "heading": "Обзор",
                "bullets": ["Пункт 1", "Пункт 2"],
                "chart": None,
            },
        ],
    }
)

VALID_PITCH_DECK_RESULT_JSON = json.dumps(
    {
        "title": "Продукт X",
        "pptx_url": "",
        "summary": "Презентация готова.",
    }
)


def test_pitch_deck_builder_run_injects_real_pptx_url(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            PITCH_DECK_STRUCTURE_JSON
            if call_count["n"] == 1
            else VALID_PITCH_DECK_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    monkeypatch.setattr(
        agents_tasks,
        "build_presentation",
        lambda structure: b"fake pptx bytes",
    )

    response = client.post(
        "/api/agents/pitch-deck-builder/runs/",
        {"input": PITCH_DECK_INPUT, "idempotency_key": "deck-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["title"] == "Продукт X"
    # The model's own (empty) pptx_url must never survive — the real
    # GeneratedPresentation file URL always wins.
    assert run.result["pptx_url"]
    assert run.result["pptx_url"].endswith(".pptx")
    assert run.steps[1]["pptx_url"] == run.result["pptx_url"]
    expected_pptx_credits = usd_to_credits(estimate_pptx_generation_cost_usd())
    assert (
        run.credits_charged
        == Decimal("1.5") + expected_pptx_credits + Decimal("1.5")
    )

    from docgen.models import GeneratedPresentation

    assert GeneratedPresentation.objects.filter(user_id=run.user_id).exists()


def test_pitch_deck_builder_invalid_structure_json_refunds_hold(monkeypatch):
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)

    def fake_run_chat(user, prompt, task=None, model=None):
        return ChatOutcome(
            status="ok", text="this is not json", provider="openai",
            model="gpt-4o-mini", task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    balance_before = account.balance

    response = client.post(
        "/api/agents/pitch-deck-builder/runs/",
        {"input": PITCH_DECK_INPUT, "idempotency_key": "deck-2"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.ERROR
    assert run.steps[1]["status"] == "error"
    account.refresh_from_db()
    # fake_run_chat fully replaces run_chat (no real charge_credits call
    # for the first step), so only the pptx step's own charge+refund
    # touch the real balance — net zero, fully refunded.
    assert account.balance == balance_before


def test_pitch_deck_builder_pptx_step_blocked_by_moderation(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            "child sexual content"
            if call_count["n"] == 1
            else VALID_PITCH_DECK_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    response = client.post(
        "/api/agents/pitch-deck-builder/runs/",
        {"input": PITCH_DECK_INPUT, "idempotency_key": "deck-3"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.BLOCKED
    assert run.steps[1]["status"] == "error"


BUDGET_TRACKER_INPUT = {
    "budget_description": "Аренда 1500, еда 400, транспорт 100",
}

BUDGET_TRACKER_STRUCTURE_JSON = json.dumps(
    {
        "sheet_title": "Budget",
        "headers": ["Category", "Amount"],
        "rows": [["Аренда", "1500"], ["Еда", "400"]],
        "chart_title": "Расходы",
    }
)

VALID_BUDGET_TRACKER_RESULT_JSON = json.dumps(
    {
        "sheet_title": "Budget",
        "excel_url": "",
        "summary": "Таблица бюджета готова.",
    }
)


def test_budget_tracker_builder_run_injects_real_excel_url(monkeypatch):
    client, _ = _authed_client()
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None):
        call_count["n"] += 1
        text = (
            BUDGET_TRACKER_STRUCTURE_JSON
            if call_count["n"] == 1
            else VALID_BUDGET_TRACKER_RESULT_JSON
        )
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    monkeypatch.setattr(
        agents_tasks, "build_spreadsheet", lambda structure: b"fake xlsx bytes"
    )

    response = client.post(
        "/api/agents/budget-tracker-builder/runs/",
        {"input": BUDGET_TRACKER_INPUT, "idempotency_key": "budget-1"},
        format="json",
    )
    assert response.status_code == 202

    run = AgentRun.objects.get(id=response.data["id"])
    assert run.status == AgentRun.Status.OK
    assert run.result["sheet_title"] == "Budget"
    assert run.result["excel_url"]
    assert run.result["excel_url"].endswith(".xlsx")
    expected_excel_credits = usd_to_credits(
        estimate_excel_generation_cost_usd()
    )
    assert (
        run.credits_charged
        == Decimal("1.5") + expected_excel_credits + Decimal("1.5")
    )

    from docgen.models import GeneratedSpreadsheet

    assert GeneratedSpreadsheet.objects.filter(user_id=run.user_id).exists()


def test_pitch_deck_builder_missing_key_points_returns_400():
    client, _ = _authed_client()
    incomplete_input = {"topic": PITCH_DECK_INPUT["topic"]}

    response = client.post(
        "/api/agents/pitch-deck-builder/runs/",
        {"input": incomplete_input, "idempotency_key": "deck-missing"},
        format="json",
    )
    assert response.status_code == 400


# --- Phase D: Agent Swarms (SwarmRun, start_swarm_run, synthesize_swarm) ---

from agents.models import SwarmRun  # noqa: E402
from agents.services import start_swarm_run  # noqa: E402

SWARM_TRANSLATION_INPUTS = [
    {"document_text": "Hello", "target_language": "Français"},
    {"document_text": "Hello", "target_language": "Español"},
]


def _fake_run_chat_for_translation_swarm(monkeypatch):
    call_order = []

    def fake_run_chat(user, prompt, task=None, model=None, system=None,
                       temperature=None, workspace_id=None):
        call_order.append(prompt)
        index = len(call_order) - 1
        if index == 0:
            text = json.dumps(
                {"translated_text": "Bonjour", "summary": "Greeting"}
            )
        elif index == 1:
            text = json.dumps(
                {"translated_text": "Hola", "summary": "Greeting"}
            )
        else:
            text = "Both translations look correct and natural."
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)
    return call_order


def test_start_swarm_run_dispatches_in_parallel_and_synthesizes(monkeypatch):
    from agents.models import Agent

    _, user = _authed_client()
    agent = Agent.objects.get(slug="document-translation")
    call_order = _fake_run_chat_for_translation_swarm(monkeypatch)

    outcome = start_swarm_run(user, agent, SWARM_TRANSLATION_INPUTS)

    assert outcome.status == "accepted"
    swarm = outcome.swarm_run
    swarm.refresh_from_db()
    assert swarm.status == SwarmRun.Status.OK
    assert swarm.result["combined_summary"] == (
        "Both translations look correct and natural."
    )
    assert len(swarm.result["children"]) == 2
    # 2 children + 1 synthesis call, each mocked at 1.5 credits.
    assert swarm.credits_charged == Decimal("4.5")
    assert swarm.child_runs.count() == 2
    assert all(
        child.status == AgentRun.Status.OK for child in swarm.child_runs.all()
    )
    # Exactly 3 run_chat calls were made: 2 children, then synthesis.
    assert len(call_order) == 3


def test_start_swarm_run_rejects_too_few_inputs():
    from agents.models import Agent

    _, user = _authed_client()
    agent = Agent.objects.get(slug="document-translation")

    outcome = start_swarm_run(user, agent, SWARM_TRANSLATION_INPUTS[:1])

    assert outcome.status == "invalid_input"
    assert not SwarmRun.objects.filter(user=user).exists()


def test_start_swarm_run_rejects_too_many_inputs():
    from agents.models import Agent

    _, user = _authed_client()
    agent = Agent.objects.get(slug="document-translation")

    outcome = start_swarm_run(user, agent, SWARM_TRANSLATION_INPUTS * 3)

    assert outcome.status == "invalid_input"


def test_start_swarm_run_validates_each_input_against_schema():
    from agents.models import Agent

    _, user = _authed_client()
    agent = Agent.objects.get(slug="document-translation")

    outcome = start_swarm_run(
        user,
        agent,
        [
            {"document_text": "Hello", "target_language": "Français"},
            {"document_text": "Hello"},  # missing required target_language
        ],
    )

    assert outcome.status == "invalid_input"
    assert not SwarmRun.objects.filter(user=user).exists()


def test_start_swarm_run_insufficient_credits(monkeypatch):
    from agents.models import Agent
    from billing.services import get_or_create_account

    _, user = _authed_client()
    agent = Agent.objects.get(slug="document-translation")
    account = get_or_create_account(user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    outcome = start_swarm_run(user, agent, SWARM_TRANSLATION_INPUTS)

    assert outcome.status == "insufficient_credits"
    assert not SwarmRun.objects.filter(user=user).exists()


def test_synthesize_swarm_fails_if_any_child_failed(monkeypatch):
    from agents.models import Agent

    _, user = _authed_client()
    agent = Agent.objects.get(slug="document-translation")
    call_count = {"n": 0}

    def fake_run_chat(user, prompt, task=None, model=None, system=None,
                       temperature=None, workspace_id=None):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # First child gets valid JSON.
            text = json.dumps(
                {"translated_text": "Bonjour", "summary": "Greeting"}
            )
        else:
            # Second child returns unparseable text -> that child errors,
            # and the swarm must never reach the synthesis call.
            text = "not json at all"
        return ChatOutcome(
            status="ok", text=text, provider="openai", model="gpt-4o-mini",
            task=task, credits_charged=Decimal("1.5"),
        )

    monkeypatch.setattr(agents_tasks, "run_chat", fake_run_chat)

    outcome = start_swarm_run(user, agent, SWARM_TRANSLATION_INPUTS)

    assert outcome.status == "accepted"
    swarm = outcome.swarm_run
    swarm.refresh_from_db()
    assert swarm.status == SwarmRun.Status.ERROR
    assert swarm.result is None
    assert "1 из 2" in swarm.error_message
    # Only the 2 children ran — no third (synthesis) call.
    assert call_count["n"] == 2


def test_create_swarm_run_via_api(monkeypatch):
    client, user = _authed_client()
    _fake_run_chat_for_translation_swarm(monkeypatch)

    response = client.post(
        "/api/agents/swarms/",
        {
            "agent_slug": "document-translation",
            "inputs": SWARM_TRANSLATION_INPUTS,
        },
        format="json",
    )

    assert response.status_code == 202
    swarm_id = response.data["id"]
    assert response.data["status"] == "ok"
    assert len(response.data["children"]) == 2

    detail_response = client.get(f"/api/agents/swarms/{swarm_id}/")
    assert detail_response.status_code == 200
    assert detail_response.data["result"]["combined_summary"] == (
        "Both translations look correct and natural."
    )


def test_swarm_run_detail_scoped_to_owner(monkeypatch):
    client, owner = _authed_client(username="swarmowner")
    _fake_run_chat_for_translation_swarm(monkeypatch)
    response = client.post(
        "/api/agents/swarms/",
        {
            "agent_slug": "document-translation",
            "inputs": SWARM_TRANSLATION_INPUTS,
        },
        format="json",
    )
    swarm_id = response.data["id"]

    other_client, _ = _authed_client(username="swarmintruder")
    other_response = other_client.get(f"/api/agents/swarms/{swarm_id}/")
    assert other_response.status_code == 404


def test_create_swarm_run_unknown_agent_returns_404():
    client, _ = _authed_client()

    response = client.post(
        "/api/agents/swarms/",
        {"agent_slug": "does-not-exist", "inputs": SWARM_TRANSLATION_INPUTS},
        format="json",
    )

    assert response.status_code == 404
