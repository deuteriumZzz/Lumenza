import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from bot.telegram_auth import (
    TelegramAuthError,
    verify_login_widget_payload,
    verify_webapp_init_data,
)

User = get_user_model()

pytestmark = pytest.mark.django_db

BOT_TOKEN = "123456:test-bot-token"


@pytest.fixture(autouse=True)
def _bot_token(settings):
    settings.TELEGRAM_BOT_TOKEN = BOT_TOKEN


def _sign_widget_payload(fields: dict) -> dict:
    check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
    digest = hmac.new(
        secret_key, check_string.encode(), hashlib.sha256
    ).hexdigest()
    return {**fields, "hash": digest}


def _sign_init_data(fields: dict) -> str:
    check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hmac.new(
        b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    digest = hmac.new(
        secret_key, check_string.encode(), hashlib.sha256
    ).hexdigest()
    return urlencode({**fields, "hash": digest})


def _widget_fields(**overrides):
    fields = {
        "id": "555",
        "username": "alice_tg",
        "auth_date": str(int(time.time())),
    }
    fields.update(overrides)
    return fields


def _webapp_fields(**overrides):
    fields = {
        "user": json.dumps({"id": 777, "username": "bob_tg"}),
        "auth_date": str(int(time.time())),
    }
    fields.update(overrides)
    return fields


def test_verify_login_widget_payload_accepts_valid_signature():
    payload = _sign_widget_payload(_widget_fields())
    identity = verify_login_widget_payload(payload)
    assert identity.id == 555
    assert identity.username == "alice_tg"


def test_verify_login_widget_payload_rejects_tampered_hash():
    payload = _sign_widget_payload(_widget_fields())
    payload["id"] = "999"
    with pytest.raises(TelegramAuthError):
        verify_login_widget_payload(payload)


def test_verify_login_widget_payload_rejects_missing_hash():
    with pytest.raises(TelegramAuthError):
        verify_login_widget_payload(_widget_fields())


def test_verify_login_widget_payload_rejects_stale_auth_date():
    stale = str(int(time.time()) - 25 * 60 * 60)
    payload = _sign_widget_payload(_widget_fields(auth_date=stale))
    with pytest.raises(TelegramAuthError):
        verify_login_widget_payload(payload)


def test_verify_webapp_init_data_accepts_valid_signature():
    init_data = _sign_init_data(_webapp_fields())
    identity = verify_webapp_init_data(init_data)
    assert identity.id == 777
    assert identity.username == "bob_tg"


def test_verify_webapp_init_data_rejects_tampered_hash():
    init_data = _sign_init_data(_webapp_fields())
    tampered = init_data.replace("bob_tg", "mallory")
    with pytest.raises(TelegramAuthError):
        verify_webapp_init_data(tampered)


def test_verify_webapp_init_data_rejects_stale_auth_date():
    stale = str(int(time.time()) - 25 * 60 * 60)
    init_data = _sign_init_data(_webapp_fields(auth_date=stale))
    with pytest.raises(TelegramAuthError):
        verify_webapp_init_data(init_data)


def test_telegram_auth_endpoint_creates_user_for_anonymous_widget_login():
    client = APIClient()
    payload = _sign_widget_payload(_widget_fields(id="111"))
    response = client.post(
        "/api/auth/telegram/",
        {"source": "widget", "payload": payload},
        format="json",
    )
    assert response.status_code == 200
    user = User.objects.get(telegram_id=111)
    assert response.data["id"] == user.id
    assert response.data["created"] is True


def test_telegram_auth_endpoint_reuses_existing_telegram_user():
    client = APIClient()
    payload = _sign_widget_payload(_widget_fields(id="222"))
    first = client.post(
        "/api/auth/telegram/",
        {"source": "widget", "payload": payload},
        format="json",
    )
    client.post("/api/auth/logout/")
    second = client.post(
        "/api/auth/telegram/",
        {"source": "widget", "payload": payload},
        format="json",
    )
    assert first.data["id"] == second.data["id"]
    assert User.objects.filter(telegram_id=222).count() == 1
    assert first.data["created"] is True
    assert second.data["created"] is False


def test_telegram_auth_endpoint_links_to_authenticated_user():
    user = User.objects.create_user(username="webuser", password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    payload = _sign_widget_payload(_widget_fields(id="333"))
    response = client.post(
        "/api/auth/telegram/",
        {"source": "widget", "payload": payload},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["created"] is False
    user.refresh_from_db()
    assert user.telegram_id == 333


def test_telegram_auth_endpoint_rejects_linking_already_claimed_telegram_id():
    User.objects.create_user(username="other", telegram_id=444)
    user = User.objects.create_user(username="webuser2", password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    payload = _sign_widget_payload(_widget_fields(id="444"))
    response = client.post(
        "/api/auth/telegram/",
        {"source": "widget", "payload": payload},
        format="json",
    )
    assert response.status_code == 409
    user.refresh_from_db()
    assert user.telegram_id is None


def test_telegram_auth_endpoint_rejects_invalid_signature():
    client = APIClient()
    payload = _widget_fields(id="555")
    payload["hash"] = "0" * 64
    response = client.post(
        "/api/auth/telegram/",
        {"source": "widget", "payload": payload},
        format="json",
    )
    assert response.status_code == 401


def test_telegram_auth_endpoint_rejects_unknown_source():
    client = APIClient()
    response = client.post(
        "/api/auth/telegram/",
        {"source": "carrier-pigeon", "payload": {}},
        format="json",
    )
    assert response.status_code == 400


def test_telegram_auth_endpoint_accepts_webapp_init_data():
    client = APIClient()
    init_data = _sign_init_data(_webapp_fields())
    response = client.post(
        "/api/auth/telegram/",
        {"source": "webapp", "payload": init_data},
        format="json",
    )
    assert response.status_code == 200
    assert User.objects.filter(telegram_id=777).exists()
