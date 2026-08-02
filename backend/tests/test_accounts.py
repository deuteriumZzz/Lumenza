import io

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

User = get_user_model()

pytestmark = pytest.mark.django_db


def _pet_image(
    *,
    name: str = "lumi.png",
    image_format: str = "PNG",
    content_type: str = "image/png",
) -> SimpleUploadedFile:
    output = io.BytesIO()
    Image.new("RGB", (32, 32), color=(84, 103, 255)).save(
        output, format=image_format
    )
    return SimpleUploadedFile(
        name,
        output.getvalue(),
        content_type=content_type,
    )


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
    assert response.data["pet_name"] == ""
    assert response.data["pet_image"] is None
    assert response.data["show_pet"] is False


def test_pet_update_requires_authentication():
    client = APIClient()

    response = client.patch(
        "/api/auth/me/pet/",
        {"pet_name": "Люми", "show_pet": True},
        format="multipart",
    )

    assert response.status_code == 401


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_pet_cookie_auth_rejects_missing_csrf(method):
    User.objects.create_user(username=f"pet_csrf_{method}", password="strongpass123")
    client = APIClient(enforce_csrf_checks=True)
    login_response = client.post(
        "/api/auth/login/",
        {"username": f"pet_csrf_{method}", "password": "strongpass123"},
        format="json",
    )
    assert login_response.status_code == 200

    response = getattr(client, method)(
        "/api/auth/me/pet/",
        {"pet_name": "Люми"} if method == "patch" else None,
        format="multipart" if method == "patch" else None,
    )

    assert response.status_code == 403


def test_pet_cookie_auth_accepts_valid_csrf_for_patch_and_delete():
    User.objects.create_user(username="pet_csrf_valid", password="strongpass123")
    client = APIClient(enforce_csrf_checks=True)
    login_response = client.post(
        "/api/auth/login/",
        {"username": "pet_csrf_valid", "password": "strongpass123"},
        format="json",
    )
    assert login_response.status_code == 200
    csrf_token = client.cookies["csrftoken"].value

    patch_response = client.patch(
        "/api/auth/me/pet/",
        {"pet_name": "Люми", "show_pet": False},
        format="multipart",
        HTTP_X_CSRFTOKEN=csrf_token,
    )
    delete_response = client.delete(
        "/api/auth/me/pet/",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert patch_response.status_code == 200
    assert delete_response.status_code == 200


@pytest.mark.parametrize(
    ("name", "image_format", "content_type"),
    [
        ("lumi.jpg", "JPEG", "image/jpeg"),
        ("lumi.png", "PNG", "image/png"),
        ("lumi.webp", "WEBP", "image/webp"),
    ],
)
def test_pet_patch_accepts_supported_images_and_round_trips(
    tmp_path,
    settings,
    name,
    image_format,
    content_type,
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username=f"pet_{image_format.lower()}", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_name": "Люми",
            "show_pet": True,
            "pet_image": _pet_image(
                name=name,
                image_format=image_format,
                content_type=content_type,
            ),
        },
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["pet_name"] == "Люми"
    assert response.data["show_pet"] is True
    assert response.data["pet_image"].startswith("/media/user-pets/")
    user.refresh_from_db()
    assert user.pet_name == "Люми"
    assert user.show_pet is True
    assert user.pet_image.storage.exists(user.pet_image.name)


def test_pet_patch_rejects_files_larger_than_five_megabytes(
    tmp_path, settings
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_large", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    valid_png = _pet_image()
    oversized = SimpleUploadedFile(
        "huge.png",
        valid_png.read() + b"0" * (5 * 1024 * 1024),
        content_type="image/png",
    )

    response = client.patch(
        "/api/auth/me/pet/",
        {"pet_image": oversized},
        format="multipart",
    )

    assert response.status_code == 400
    assert "pet_image" in response.data
    user.refresh_from_db()
    assert not user.pet_image


def test_pet_patch_rejects_excessive_request_before_multipart_parsing():
    user = User.objects.create_user(
        username="pet_request_large", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_image": SimpleUploadedFile(
                "too-large.png",
                b"0" * (5 * 1024 * 1024 + 128 * 1024),
                content_type="image/png",
            )
        },
        format="multipart",
    )

    assert response.status_code == 413


def test_pet_patch_rejects_undecodable_image(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_broken", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_image": SimpleUploadedFile(
                "broken.png", b"not-an-image", content_type="image/png"
            )
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "pet_image" in response.data


def test_pet_patch_rejects_decodable_but_unsupported_image(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_gif", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_image": _pet_image(
                name="lumi.gif",
                image_format="GIF",
                content_type="image/gif",
            )
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "pet_image" in response.data


def test_pet_patch_rejects_mime_type_that_does_not_match_decoded_image(
    tmp_path, settings
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_spoofed_mime", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_image": _pet_image(
                name="lumi.png",
                image_format="PNG",
                content_type="image/jpeg",
            )
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "pet_image" in response.data


def test_pet_patch_rejects_extension_that_does_not_match_decoded_image(
    tmp_path, settings
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_spoofed_extension", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_image": _pet_image(
                name="lumi.png",
                image_format="JPEG",
                content_type="image/jpeg",
            )
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "pet_image" in response.data


def test_pet_patch_rejects_images_larger_than_dimension_cap(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_dimensions", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    output = io.BytesIO()
    Image.new("RGB", (4097, 1), color=(84, 103, 255)).save(
        output, format="PNG"
    )

    response = client.patch(
        "/api/auth/me/pet/",
        {
            "pet_image": SimpleUploadedFile(
                "wide.png", output.getvalue(), content_type="image/png"
            )
        },
        format="multipart",
    )

    assert response.status_code == 400
    assert "pet_image" in response.data


def test_replacing_pet_image_removes_previous_file_after_commit(
    tmp_path, settings, django_capture_on_commit_callbacks
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_replace", password="strongpass123"
    )
    user.pet_image = _pet_image(name="first.png")
    user.save(update_fields=["pet_image"])
    old_name = user.pet_image.name
    storage = user.pet_image.storage
    client = APIClient()
    client.force_authenticate(user=user)

    with django_capture_on_commit_callbacks(execute=True):
        response = client.patch(
            "/api/auth/me/pet/",
            {"pet_image": _pet_image(name="second.png")},
            format="multipart",
        )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.pet_image.name != old_name
    assert storage.exists(user.pet_image.name)
    assert not storage.exists(old_name)


def test_delete_pet_clears_profile_and_removes_file_after_commit(
    tmp_path, settings, django_capture_on_commit_callbacks
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_delete",
        password="strongpass123",
        pet_name="Люми",
        show_pet=True,
    )
    user.pet_image = _pet_image()
    user.save(update_fields=["pet_image"])
    image_name = user.pet_image.name
    storage = user.pet_image.storage
    client = APIClient()
    client.force_authenticate(user=user)

    with django_capture_on_commit_callbacks(execute=True):
        response = client.delete("/api/auth/me/pet/")

    assert response.status_code == 200
    assert response.data["pet_name"] == ""
    assert response.data["pet_image"] is None
    assert response.data["show_pet"] is False
    user.refresh_from_db()
    assert user.pet_name == ""
    assert user.show_pet is False
    assert not user.pet_image
    assert not storage.exists(image_name)


def test_pet_preset_clears_previously_uploaded_image_after_commit(
    tmp_path, settings, django_capture_on_commit_callbacks
):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_user(
        username="pet_preset_clears", password="strongpass123"
    )
    user.pet_image = _pet_image()
    user.save(update_fields=["pet_image"])
    old_name = user.pet_image.name
    storage = user.pet_image.storage
    client = APIClient()
    client.force_authenticate(user=user)

    with django_capture_on_commit_callbacks(execute=True):
        response = client.patch(
            "/api/auth/me/pet/", {"pet_preset": "fox"}
        )

    assert response.status_code == 200
    assert response.data["pet_preset"] == "fox"
    assert response.data["pet_image"] is None
    user.refresh_from_db()
    assert user.pet_preset == "fox"
    assert not user.pet_image
    assert not storage.exists(old_name)


def test_uploading_pet_image_clears_previously_selected_preset():
    user = User.objects.create_user(
        username="pet_image_clears",
        password="strongpass123",
        pet_preset="cat",
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/",
        {"pet_image": _pet_image()},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["pet_preset"] == ""
    user.refresh_from_db()
    assert user.pet_preset == ""
    assert user.pet_image


def test_pet_preset_rejects_unknown_value():
    user = User.objects.create_user(
        username="pet_preset_invalid", password="strongpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/pet/", {"pet_preset": "not-a-real-preset"}
    )

    assert response.status_code == 400
    assert "pet_preset" in response.data


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
