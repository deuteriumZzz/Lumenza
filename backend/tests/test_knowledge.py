import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from knowledge.models import Chunk, Source, Workspace
from tests.helpers import authed_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (2, 2), color="red").save(output, format="PNG")
    return output.getvalue()


def test_create_workspace():
    client, user = authed_client()

    response = client.post(
        "/api/knowledge/workspaces/", {"name": "My notes"}, format="json"
    )

    assert response.status_code == 201
    workspace = Workspace.objects.get(pk=response.data["id"])
    assert workspace.user == user
    assert workspace.name == "My notes"


def test_list_workspaces_only_shows_own():
    client, user = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    Workspace.objects.create(user=user, name="Mine")
    Workspace.objects.create(user=other_user, name="Not mine")

    response = client.get("/api/knowledge/workspaces/")

    assert response.status_code == 200
    names = [item["name"] for item in response.data["results"]] if isinstance(
        response.data, dict
    ) else [item["name"] for item in response.data]
    assert names == ["Mine"]


def test_delete_workspace_requires_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    workspace = Workspace.objects.create(user=other_user, name="Not mine")

    response = client.delete(f"/api/knowledge/workspaces/{workspace.id}/")

    assert response.status_code == 404
    assert Workspace.objects.filter(pk=workspace.id).exists()


def test_add_text_source_ingests_and_creates_chunks():
    client, user = authed_client()
    workspace = Workspace.objects.create(user=user, name="Notes")
    long_text = "Lumenza is a multimodal AI aggregator. " * 40

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/sources/text/",
        {"text": long_text},
        format="json",
    )

    assert response.status_code == 202
    source = Source.objects.get(pk=response.data["id"])
    assert source.status == Source.Status.OK
    assert source.kind == Source.Kind.TEXT
    assert source.user == user
    chunks = list(source.chunks.all())
    assert len(chunks) > 1
    assert all(len(chunk.embedding) > 0 for chunk in chunks)


def test_add_text_source_requires_workspace_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    workspace = Workspace.objects.create(user=other_user, name="Not mine")

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/sources/text/",
        {"text": "hello"},
        format="json",
    )

    assert response.status_code == 404
    assert not Source.objects.filter(workspace=workspace).exists()


def test_add_image_source_extracts_ocr_text_then_chunks():
    client, user = authed_client()
    workspace = Workspace.objects.create(user=user, name="Scans")
    image = SimpleUploadedFile(
        "scan.png", _png_bytes(), content_type="image/png"
    )

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/sources/image/",
        {"image": image},
        format="multipart",
    )

    assert response.status_code == 202
    source = Source.objects.get(pk=response.data["id"])
    assert source.status == Source.Status.OK
    assert source.kind == Source.Kind.IMAGE
    # Мок-режим OCR (нет NVIDIA_API_KEY в тестовом окружении) детерминированно
    # возвращает "[mock extracted text]" — см. nvidia_ocr_adapter.py.
    assert "mock extracted text" in source.raw_text
    assert source.chunks.count() == 1


def test_empty_text_source_fails_instead_of_creating_chunkless_source():
    client, user = authed_client()
    workspace = Workspace.objects.create(user=user, name="Notes")

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/sources/text/",
        {"text": "   "},
        format="json",
    )

    # allow_blank=False на сериализаторе уже отклоняет чистый пробел как
    # пустую строку после trim_whitespace.
    assert response.status_code == 400


def test_search_returns_relevant_chunks_and_never_crosses_accounts():
    client, user = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    workspace = Workspace.objects.create(user=user, name="Notes")
    other_workspace = Workspace.objects.create(user=other_user, name="Theirs")

    client.post(
        f"/api/knowledge/workspaces/{workspace.id}/sources/text/",
        {"text": "Lumenza objединяет чат, поиск и изображения. " * 30},
        format="json",
    )
    other_client, _ = authed_client(username="other2")
    # Populate the other user's workspace directly (bypassing ownership
    # checks entirely) to prove search never crosses accounts even at
    # the query level, not just at the create-source level.
    other_source = Source.objects.create(
        workspace=other_workspace,
        user=other_user,
        kind=Source.Kind.TEXT,
        raw_text="Secret content belonging to someone else.",
        status=Source.Status.OK,
        provider="nvidia",
        model="nvidia/nemotron-3-embed-1b",
    )
    Chunk.objects.create(
        source=other_source,
        index=0,
        text="Secret content belonging to someone else.",
        embedding=[0.1, 0.2, 0.3],
    )

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/search/",
        {"query": "Что умеет Lumenza?"},
        format="json",
    )

    assert response.status_code == 200
    assert len(response.data) > 0
    texts = [item["text"] for item in response.data]
    assert all("Secret content" not in text for text in texts)


def test_search_requires_workspace_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    workspace = Workspace.objects.create(user=other_user, name="Not mine")

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/search/",
        {"query": "anything"},
        format="json",
    )

    assert response.status_code == 404


def test_knowledge_requires_authentication():
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.get("/api/knowledge/workspaces/")
    assert response.status_code == 401


# --- Phase C: EmbedWidget + public embed_ask_view ---

from decimal import Decimal  # noqa: E402

from knowledge.models import EmbedWidget  # noqa: E402
from providers.services import ChatOutcome  # noqa: E402


def test_create_embed_widget():
    client, user = authed_client()
    workspace = Workspace.objects.create(user=user, name="Notes")

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/embeds/",
        {"title": "Support bot"},
        format="json",
    )

    assert response.status_code == 201
    widget = EmbedWidget.objects.get(pk=response.data["id"])
    assert widget.workspace == workspace
    assert widget.title == "Support bot"
    assert widget.is_active is True
    assert response.data["public_key"] == widget.public_key
    assert len(widget.public_key) > 20


def test_create_embed_widget_requires_workspace_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    workspace = Workspace.objects.create(user=other_user, name="Not mine")

    response = client.post(
        f"/api/knowledge/workspaces/{workspace.id}/embeds/",
        {"title": "Support bot"},
        format="json",
    )

    assert response.status_code == 404


def test_list_embed_widgets_only_shows_own():
    client, user = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    workspace = Workspace.objects.create(user=user, name="Mine")
    other_workspace = Workspace.objects.create(user=other_user, name="Theirs")
    EmbedWidget.objects.create(workspace=workspace, title="Mine widget")
    EmbedWidget.objects.create(workspace=other_workspace, title="Their widget")

    response = client.get(f"/api/knowledge/workspaces/{workspace.id}/embeds/")

    assert response.status_code == 200
    titles = [item["title"] for item in response.data]
    assert titles == ["Mine widget"]


def test_deactivate_embed_widget():
    client, user = authed_client()
    workspace = Workspace.objects.create(user=user, name="Notes")
    widget = EmbedWidget.objects.create(workspace=workspace, title="Bot")

    response = client.patch(
        f"/api/knowledge/embeds/{widget.id}/",
        {"is_active": False},
        format="json",
    )

    assert response.status_code == 200
    widget.refresh_from_db()
    assert widget.is_active is False


def test_delete_embed_widget_requires_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    other_workspace = Workspace.objects.create(user=other_user, name="Theirs")
    widget = EmbedWidget.objects.create(workspace=other_workspace)

    response = client.delete(f"/api/knowledge/embeds/{widget.id}/")

    assert response.status_code == 404
    assert EmbedWidget.objects.filter(pk=widget.id).exists()


def test_embed_ask_view_happy_path(monkeypatch):
    owner = authed_client(username="widgetowner")[1]
    workspace = Workspace.objects.create(user=owner, name="Docs")
    widget = EmbedWidget.objects.create(workspace=workspace, title="Bot")

    def fake_run_chat(user, prompt, task=None, model=None, system=None,
                       temperature=None, workspace_id=None):
        assert user == owner
        assert workspace_id == workspace.id
        return ChatOutcome(
            status="ok", text="Lumenza is an AI aggregator.",
            provider="openai", model="gpt-4o-mini", task=task,
            credits_charged=Decimal("0.02"),
        )

    monkeypatch.setattr("providers.services.run_chat", fake_run_chat)

    from rest_framework.test import APIClient

    anon_client = APIClient()
    response = anon_client.get(
        f"/api/public/embed/{widget.public_key}/ask/",
        {"q": "What is Lumenza?"},
    )

    assert response.status_code == 200
    assert response.data == {"answer": "Lumenza is an AI aggregator."}
    assert response["Access-Control-Allow-Origin"] == "*"


def test_embed_ask_view_404_for_unknown_key():
    from rest_framework.test import APIClient

    anon_client = APIClient()
    response = anon_client.get(
        "/api/public/embed/does-not-exist/ask/", {"q": "hi"}
    )

    assert response.status_code == 404


def test_embed_ask_view_404_for_inactive_widget():
    owner = authed_client(username="widgetowner2")[1]
    workspace = Workspace.objects.create(user=owner, name="Docs")
    widget = EmbedWidget.objects.create(
        workspace=workspace, is_active=False
    )

    from rest_framework.test import APIClient

    anon_client = APIClient()
    response = anon_client.get(
        f"/api/public/embed/{widget.public_key}/ask/", {"q": "hi"}
    )

    assert response.status_code == 404


def test_embed_ask_view_blocked_returns_generic_message_no_billing_detail(
    monkeypatch,
):
    owner = authed_client(username="widgetowner3")[1]
    workspace = Workspace.objects.create(user=owner, name="Docs")
    widget = EmbedWidget.objects.create(workspace=workspace)

    def fake_run_chat(user, prompt, task=None, model=None, system=None,
                       temperature=None, workspace_id=None):
        return ChatOutcome(status="blocked", task=task)

    monkeypatch.setattr("providers.services.run_chat", fake_run_chat)

    from rest_framework.test import APIClient

    anon_client = APIClient()
    response = anon_client.get(
        f"/api/public/embed/{widget.public_key}/ask/",
        {"q": "something blocked"},
    )

    assert response.status_code == 422
    # No billing/account detail leaked to the anonymous visitor.
    assert "credit" not in response.data["detail"].lower()
    assert "кредит" not in response.data["detail"].lower()


def test_embed_ask_view_insufficient_credits_returns_generic_message(
    monkeypatch,
):
    owner = authed_client(username="widgetowner4")[1]
    workspace = Workspace.objects.create(user=owner, name="Docs")
    widget = EmbedWidget.objects.create(workspace=workspace)

    def fake_run_chat(user, prompt, task=None, model=None, system=None,
                       temperature=None, workspace_id=None):
        return ChatOutcome(status="insufficient_credits", task=task)

    monkeypatch.setattr("providers.services.run_chat", fake_run_chat)

    from rest_framework.test import APIClient

    anon_client = APIClient()
    response = anon_client.get(
        f"/api/public/embed/{widget.public_key}/ask/", {"q": "hi"}
    )

    assert response.status_code == 503
    assert "кредит" not in response.data["detail"].lower()
    assert "credit" not in response.data["detail"].lower()


def test_embed_ask_view_missing_query_returns_400():
    owner = authed_client(username="widgetowner5")[1]
    workspace = Workspace.objects.create(user=owner, name="Docs")
    widget = EmbedWidget.objects.create(workspace=workspace)

    from rest_framework.test import APIClient

    anon_client = APIClient()
    response = anon_client.get(f"/api/public/embed/{widget.public_key}/ask/")

    assert response.status_code == 400


def test_embed_ask_throttle_scope():
    from knowledge.throttling import EmbedAskThrottle

    assert EmbedAskThrottle.scope == "embed_ask"
