import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

pytestmark = pytest.mark.django_db


def test_register_creates_user_and_returns_token():
    client = APIClient()
    response = client.post(
        "/api/auth/register/",
        {"username": "alice", "email": "alice@example.com", "password": "strongpass123"},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["username"] == "alice"
    assert "token" in response.data
    assert User.objects.filter(username="alice").exists()


def test_register_rejects_common_password():
    client = APIClient()
    response = client.post(
        "/api/auth/register/",
        {"username": "weakpass", "email": "weak@example.com", "password": "password123"},
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
        "/api/auth/login/", {"username": "carol", "password": "strongpass123"}, format="json"
    )
    assert response.status_code == 200
    assert "token" in response.data


def test_login_with_invalid_credentials():
    User.objects.create_user(username="dave", password="strongpass123")
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"username": "dave", "password": "wrongpass"}, format="json"
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


def test_logout_deletes_token():
    client = APIClient()
    register_response = client.post(
        "/api/auth/register/",
        {"username": "frank", "email": "frank@example.com", "password": "strongpass123"},
        format="json",
    )
    token = register_response.data["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

    logout_response = client.post("/api/auth/logout/")
    assert logout_response.status_code == 204

    me_response = client.get("/api/auth/me/")
    assert me_response.status_code == 401
