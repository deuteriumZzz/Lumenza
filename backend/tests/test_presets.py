import pytest

from providers.models import Preset
from tests.helpers import authed_client

pytestmark = pytest.mark.django_db

VALID_PRESET = {
    "name": "Дерзкий копирайтер",
    "model": "gpt-4o-mini",
    "task": "hook",
    "system_prompt": "Отвечай дерзко и коротко.",
    "temperature": 0.9,
}


def test_create_preset():
    client, user = authed_client()

    response = client.post("/api/presets/", VALID_PRESET, format="json")

    assert response.status_code == 201
    preset = Preset.objects.get(pk=response.data["id"])
    assert preset.user == user
    assert preset.name == VALID_PRESET["name"]
    assert preset.system_prompt == VALID_PRESET["system_prompt"]
    assert preset.temperature == VALID_PRESET["temperature"]


def test_create_preset_invalid_task_returns_400():
    client, _ = authed_client()
    bad = {**VALID_PRESET, "task": "not-a-real-task"}

    response = client.post("/api/presets/", bad, format="json")

    assert response.status_code == 400
    assert not Preset.objects.filter(name=VALID_PRESET["name"]).exists()


def test_create_preset_duplicate_name_returns_400():
    client, user = authed_client()
    Preset.objects.create(
        user=user, name=VALID_PRESET["name"], model="gpt-4o-mini", task="hook"
    )

    response = client.post("/api/presets/", VALID_PRESET, format="json")

    assert response.status_code == 400
    assert Preset.objects.filter(user=user).count() == 1


def test_list_presets_only_shows_own():
    client, user = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    Preset.objects.create(
        user=user, name="Mine", model="gpt-4o-mini", task="hook"
    )
    Preset.objects.create(
        user=other_user, name="Not mine", model="gpt-4o-mini", task="hook"
    )

    response = client.get("/api/presets/")

    assert response.status_code == 200
    names = [item["name"] for item in response.data]
    assert names == ["Mine"]


def test_update_and_delete_preset_requires_ownership():
    client, _ = authed_client(username="owner")
    _, other_user = authed_client(username="other")
    preset = Preset.objects.create(
        user=other_user, name="Not mine", model="gpt-4o-mini", task="hook"
    )

    update_response = client.patch(
        f"/api/presets/{preset.id}/", {"name": "Hijacked"}, format="json"
    )
    delete_response = client.delete(f"/api/presets/{preset.id}/")

    assert update_response.status_code == 404
    assert delete_response.status_code == 404
    preset.refresh_from_db()
    assert preset.name == "Not mine"


def test_owner_can_update_and_delete_own_preset():
    client, user = authed_client()
    preset = Preset.objects.create(
        user=user, name="Mine", model="gpt-4o-mini", task="hook"
    )

    update_response = client.patch(
        f"/api/presets/{preset.id}/",
        {"system_prompt": "Новый промпт"},
        format="json",
    )
    assert update_response.status_code == 200
    preset.refresh_from_db()
    assert preset.system_prompt == "Новый промпт"

    delete_response = client.delete(f"/api/presets/{preset.id}/")
    assert delete_response.status_code == 204
    assert not Preset.objects.filter(pk=preset.id).exists()


def test_presets_require_authentication():
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.get("/api/presets/")
    assert response.status_code == 401
