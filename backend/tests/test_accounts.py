import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

pytestmark = pytest.mark.django_db


def test_register_creates_user_and_sets_auth_cookie():
    client = APIClient()
    response = client.post(
        "/api/auth/register/",
        {
            "username": "alice",
            "email": "alice@example.com",
            "password": "strongpass123",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["username"] == "alice"
    # Токен никогда не должен появляться в теле ответа — весь смысл
    # httpOnly cookie в том, что JS фронтенда (и всё, что читает ответ
    # fetch, включая XSS-пейлоад) вообще никогда не видит значение
    # токена.
    assert "token" not in response.data
    cookie = response.cookies[settings.AUTH_TOKEN_COOKIE_NAME]
    assert cookie.value
    assert cookie["httponly"]
    assert User.objects.filter(username="alice").exists()


def test_register_rejects_common_password():
    client = APIClient()
    response = client.post(
        "/api/auth/register/",
        {
            "username": "weakpass",
            "email": "weak@example.com",
            "password": "password123",
        },
        format="json",
    )
    assert response.status_code == 400
    assert not User.objects.filter(username="weakpass").exists()


def test_register_rejects_short_password():
    client = APIClient()
    response = client.post(
        "/api/auth/register/",
        {"username": "bob", "email": "bob@example.com", "password": "short"},
        format="json",
    )
    assert response.status_code == 400


def test_login_with_valid_credentials():
    User.objects.create_user(username="carol", password="strongpass123")
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"username": "carol", "password": "strongpass123"},
        format="json",
    )
    assert response.status_code == 200
    assert "token" not in response.data
    assert response.cookies[settings.AUTH_TOKEN_COOKIE_NAME].value


def test_login_with_invalid_credentials():
    User.objects.create_user(username="dave", password="strongpass123")
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"username": "dave", "password": "wrongpass"},
        format="json",
    )
    assert response.status_code == 401


def test_me_requires_authentication():
    client = APIClient()
    response = client.get("/api/auth/me/")
    assert response.status_code == 401


def test_me_returns_current_user():
    user = User.objects.create_user(username="erin", password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    assert response.data["username"] == "erin"


def test_context_requires_authentication():
    client = APIClient()
    response = client.get("/api/auth/context/")
    assert response.status_code == 401


def test_context_get_creates_empty_context_for_fresh_user():
    user = User.objects.create_user(username="gina", password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/auth/context/")

    assert response.status_code == 200
    assert response.data["data"] == {}


def test_context_put_persists_and_round_trips():
    user = User.objects.create_user(username="hank", password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)

    payload = {"data": {"general": {"tone": "экспертный"}}}
    put_response = client.put("/api/auth/context/", payload, format="json")
    assert put_response.status_code == 200
    assert put_response.data["data"] == payload["data"]

    get_response = client.get("/api/auth/context/")
    assert get_response.data["data"] == payload["data"]


def test_context_is_scoped_to_the_authenticated_user():
    owner = User.objects.create_user(username="ivan", password="strongpass123")
    other = User.objects.create_user(username="jack", password="strongpass123")

    owner_client = APIClient()
    owner_client.force_authenticate(user=owner)
    owner_client.put(
        "/api/auth/context/",
        {"data": {"general": {"tone": "секрет"}}},
        format="json",
    )

    other_client = APIClient()
    other_client.force_authenticate(user=other)
    response = other_client.get("/api/auth/context/")

    assert response.status_code == 200
    assert response.data["data"] == {}


def test_logout_deletes_token():
    client = APIClient()
    client.post(
        "/api/auth/register/",
        {
            "username": "frank",
            "email": "frank@example.com",
            "password": "strongpass123",
        },
        format="json",
    )
    # Вручную задавать credentials не нужно — cookie авторизации,
    # выставленная register() выше, автоматически передаётся в следующих
    # запросах этого клиента, точно так же, как это делал бы браузер.

    logout_response = client.post("/api/auth/logout/")
    assert logout_response.status_code == 204

    me_response = client.get("/api/auth/me/")
    assert me_response.status_code == 401
