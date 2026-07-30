from decimal import Decimal

import pytest

from billing.models import CreditAccount
from providers.models import Message, RequestLog, Thread
from tests.helpers import authed_client

pytestmark = pytest.mark.django_db


def test_create_thread_creates_empty_thread():
    client, user = authed_client()

    response = client.post("/api/threads/", {}, format="json")

    assert response.status_code == 201
    assert response.data["title"] == ""
    thread = Thread.objects.get(pk=response.data["id"])
    assert thread.user == user
    assert thread.messages.count() == 0


def test_thread_message_persists_messages_and_sets_title_from_first_prompt():
    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "Hello, this is a test prompt", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["mocked"] is True

    thread.refresh_from_db()
    assert thread.title == "Hello, this is a test prompt"

    messages = list(thread.messages.all())
    assert len(messages) == 2
    assert messages[0].role == Message.Role.USER
    assert messages[0].text == "Hello, this is a test prompt"
    assert messages[1].role == Message.Role.ASSISTANT
    assert messages[1].text == response.data["text"]
    assert messages[1].credits_charged > 0

    account.refresh_from_db()
    assert account.balance < starting_balance
    assert messages[1].credits_charged == starting_balance - account.balance


def test_thread_message_without_task_gets_auto_classified(monkeypatch):
    import providers.intent

    monkeypatch.setattr(
        providers.intent, "classify_task", lambda prompt, valid_tasks: "repurpose"
    )
    client, user = authed_client()
    thread = Thread.objects.create(user=user)

    response = client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "просто помоги мне с текстом"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["task"] == "repurpose"


def test_thread_message_truncates_long_first_prompt_for_title():
    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    long_prompt = "x" * 200

    client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": long_prompt, "task": "repurpose"},
        format="json",
    )

    thread.refresh_from_db()
    assert thread.title == "x" * 60


def test_thread_message_does_not_overwrite_existing_title():
    client, user = authed_client()
    thread = Thread.objects.create(user=user, title="Existing title")

    client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "second message", "task": "repurpose"},
        format="json",
    )

    thread.refresh_from_db()
    assert thread.title == "Existing title"


def test_thread_message_bumps_updated_at():
    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    original_updated_at = thread.updated_at

    client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "hi", "task": "repurpose"},
        format="json",
    )

    thread.refresh_from_db()
    assert thread.updated_at > original_updated_at


def test_thread_message_insufficient_credits_creates_no_messages():
    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "should be blocked", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 402
    thread.refresh_from_db()
    assert thread.messages.count() == 0
    assert thread.title == ""

    log = RequestLog.objects.get(user=user)
    assert log.status == RequestLog.Status.INSUFFICIENT_CREDITS


def test_thread_message_requires_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    thread = Thread.objects.create(user=other_user)

    response = client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "hi", "task": "repurpose"},
        format="json",
    )

    assert response.status_code == 404


def test_list_threads_only_shows_own_threads():
    client, user = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    Thread.objects.create(user=user, title="Mine")
    Thread.objects.create(user=other_user, title="Not mine")

    response = client.get("/api/threads/")

    assert response.status_code == 200
    titles = [item["title"] for item in response.data["results"]]
    assert titles == ["Mine"]


def test_thread_detail_includes_messages_and_requires_ownership():
    client, user = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    thread = Thread.objects.create(user=user, title="Mine")
    Message.objects.create(thread=thread, role=Message.Role.USER, text="hi")
    other_thread = Thread.objects.create(user=other_user, title="Not mine")

    own_response = client.get(f"/api/threads/{thread.id}/")
    assert own_response.status_code == 200
    assert len(own_response.data["messages"]) == 1
    assert own_response.data["messages"][0]["text"] == "hi"

    other_response = client.get(f"/api/threads/{other_thread.id}/")
    assert other_response.status_code == 404


def test_delete_thread_cascades_messages():
    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    Message.objects.create(thread=thread, role=Message.Role.USER, text="hi")

    response = client.delete(f"/api/threads/{thread.id}/")

    assert response.status_code == 204
    assert not Thread.objects.filter(pk=thread.id).exists()
    assert not Message.objects.filter(thread_id=thread.id).exists()


def test_thread_message_passes_system_and_temperature_to_adapter(monkeypatch):
    from providers.registry import REGISTRY

    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    seen_kwargs = {}
    original_complete = REGISTRY["openai"].complete

    def spy_complete(prompt, **kwargs):
        seen_kwargs.update(kwargs)
        return original_complete(prompt, **kwargs)

    monkeypatch.setattr(REGISTRY["openai"], "complete", spy_complete)

    client.post(
        f"/api/threads/{thread.id}/messages/",
        {
            "prompt": "hi",
            "task": "repurpose",
            "system": "Answer in one word.",
            "temperature": 0.3,
        },
        format="json",
    )

    assert seen_kwargs["system"] == "Answer in one word."
    assert seen_kwargs["temperature"] == 0.3


def test_thread_message_without_system_or_temperature_omits_them(monkeypatch):
    # Regression guard: a plain send (no preset selected) must reach the
    # adapter with system=None/temperature=None — the exact same call
    # shape as before this feature existed.
    from providers.registry import REGISTRY

    client, user = authed_client()
    thread = Thread.objects.create(user=user)
    seen_kwargs = {}
    original_complete = REGISTRY["openai"].complete

    def spy_complete(prompt, **kwargs):
        seen_kwargs.update(kwargs)
        return original_complete(prompt, **kwargs)

    monkeypatch.setattr(REGISTRY["openai"], "complete", spy_complete)

    client.post(
        f"/api/threads/{thread.id}/messages/",
        {"prompt": "hi", "task": "repurpose"},
        format="json",
    )

    assert seen_kwargs["system"] is None
    assert seen_kwargs["temperature"] is None


def test_threads_require_authentication():
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.get("/api/threads/")
    assert response.status_code == 401
