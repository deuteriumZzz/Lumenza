import io
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User as UserModel
from billing.models import CreditAccount
from imagegen.models import GeneratedImage
from imagegen.tasks import (
    edit_image_task,
    generate_image,
    generate_image_task,
)
from imagegen.throttling import ImageGenerationRateThrottle
from tests.helpers import authed_client as _shared_authed_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="artist", tier=UserModel.Tier.PAID):
    # PAID по умолчанию: тесты биллинга/модерации/Celery не зависят от
    # блокировки задач; сам тест блокировки передаёт tier=FREE явно.
    return _shared_authed_client(username, tier=tier)


def test_create_image_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/images/", {"prompt": "a fox", "task": "realistic"}, format="json"
    )
    assert response.status_code == 401


def test_create_image_rejects_blank_prompt():
    client, _ = _authed_client()
    response = client.post(
        "/api/images/", {"prompt": "   ", "task": "realistic"}, format="json"
    )
    assert response.status_code == 400


def test_create_image_success_charges_credits_and_saves_file():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/",
        {"prompt": "a fox reading a book", "task": "realistic"},
        format="json",
    )

    assert response.status_code == 202
    image_id = response.data["id"]

    record = GeneratedImage.objects.get(id=image_id)
    assert record.status == GeneratedImage.Status.OK
    assert record.mocked is True
    assert record.provider == "openai"
    assert record.model == "dall-e-3"
    assert bool(record.image) is True
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_image_with_illustration_task_routes_to_replicate():
    client, user = _authed_client()
    response = client.post(
        "/api/images/",
        {"prompt": "a neon skyline", "task": "illustration"},
        format="json",
    )
    assert response.status_code == 202

    record = GeneratedImage.objects.get(id=response.data["id"])
    assert record.provider == "replicate"
    assert record.model == "flux-schnell"
    assert record.status == GeneratedImage.Status.OK
    assert record.mocked is True


def test_create_image_with_premium_task_routes_to_nvidia():
    client, user = _authed_client()
    response = client.post(
        "/api/images/",
        {"prompt": "a neon skyline", "task": "premium"},
        format="json",
    )
    assert response.status_code == 202

    record = GeneratedImage.objects.get(id=response.data["id"])
    assert record.provider == "nvidia"
    assert record.model == "flux.1-dev"
    assert record.status == GeneratedImage.Status.OK
    assert record.mocked is True


def test_create_image_insufficient_credits_returns_402_no_enqueue():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post(
        "/api/images/", {"prompt": "a fox", "task": "realistic"}, format="json"
    )

    assert response.status_code == 402
    assert not GeneratedImage.objects.filter(user=user).exists()

    account.refresh_from_db()
    assert account.balance == Decimal("0")


def test_create_image_blocked_by_moderation_refunds_hold():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/",
        {"prompt": "child sexual content", "task": "realistic"},
        format="json",
    )

    assert response.status_code == 202
    record = GeneratedImage.objects.get(id=response.data["id"])
    assert record.status == GeneratedImage.Status.BLOCKED
    assert record.credits_charged == Decimal("0")
    assert bool(record.image) is False

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_gallery_lists_only_the_requesting_users_images():
    client, user = _authed_client("gallery_owner")
    other_client, other_user = _authed_client("gallery_other")

    client.post(
        "/api/images/", {"prompt": "mine", "task": "realistic"}, format="json"
    )
    other_client.post(
        "/api/images/",
        {"prompt": "not mine", "task": "realistic"},
        format="json",
    )

    response = client.get("/api/images/")
    assert response.status_code == 200
    results = response.data["results"]
    assert len(results) == 1
    assert GeneratedImage.objects.get(id=results[0]["id"]).user == user


def test_image_detail_view_is_scoped_to_owner():
    client, user = _authed_client("detail_owner")
    other_client, _ = _authed_client("detail_other")

    create_response = client.post(
        "/api/images/",
        {"prompt": "a private image", "task": "realistic"},
        format="json",
    )
    image_id = create_response.data["id"]

    own_response = client.get(f"/api/images/{image_id}/")
    assert own_response.status_code == 200
    assert own_response.data["status"] == "ok"

    other_response = other_client.get(f"/api/images/{image_id}/")
    assert other_response.status_code == 404


def test_duplicate_task_delivery_does_not_double_refund():
    # Регрессионный тест: повторно доставленная задача (например, после
    # падения воркера, или просто из-за собственного механизма повторов
    # Celery) раньше заново прогоняла весь поток генерации — включая
    # второе независимое начисление возврата — так как ничего не
    # проверяло, была ли запись уже обработана.
    client, user = _authed_client("dup_delivery")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/",
        {"prompt": "a single fox", "task": "realistic"},
        format="json",
    )
    image_id = response.data["id"]
    record = GeneratedImage.objects.get(id=image_id)
    assert record.status == GeneratedImage.Status.OK
    credits_charged_once = record.credits_charged

    account.refresh_from_db()
    balance_after_first_run = account.balance
    assert balance_after_first_run == starting_balance - credits_charged_once

    # Имитируем повторную доставку того же сообщения задачи.
    generate_image(image_id)

    record.refresh_from_db()
    account.refresh_from_db()
    assert record.status == GeneratedImage.Status.OK
    assert record.credits_charged == credits_charged_once
    assert account.balance == balance_after_first_run


def test_enqueue_failure_refunds_hold_and_returns_503(monkeypatch):
    client, user = _authed_client("enqueue_fails")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(generate_image_task, "delay", boom)

    response = client.post(
        "/api/images/",
        {"prompt": "should fail to enqueue", "task": "realistic"},
        format="json",
    )

    assert response.status_code == 503

    record = GeneratedImage.objects.get(user=user)
    assert record.status == GeneratedImage.Status.ERROR
    assert record.credits_charged == Decimal("0")

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_base_user_can_create_realistic_image():
    client, user = _authed_client(
        "locked_image_task", tier=UserModel.Tier.FREE
    )
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance
    response = client.post(
        "/api/images/", {"prompt": "a fox", "task": "realistic"}, format="json"
    )

    assert response.status_code == 202
    assert GeneratedImage.objects.filter(user=user).exists()
    account.refresh_from_db()
    assert account.balance < starting_balance


def test_image_creation_is_rate_limited(monkeypatch):
    monkeypatch.setattr(
        ImageGenerationRateThrottle, "rate", "1/min", raising=False
    )
    client, user = _authed_client("image_rate_limited")

    first = client.post(
        "/api/images/",
        {"prompt": "a sunset", "task": "realistic"},
        format="json",
    )
    second = client.post(
        "/api/images/",
        {"prompt": "a sunrise", "task": "realistic"},
        format="json",
    )

    assert first.status_code == 202
    assert second.status_code == 429


def _sample_upload(name="source.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (10, 20, 30)).save(buffer, format="PNG")
    return SimpleUploadedFile(
        name, buffer.getvalue(), content_type="image/png"
    )


def test_create_edit_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/images/edit/",
        {"prompt": "make it blue", "image": _sample_upload()},
        format="multipart",
    )
    assert response.status_code == 401


def test_create_edit_success_charges_credits_and_saves_both_files():
    client, user = _authed_client("editor")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/edit/",
        {"prompt": "make it blue", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 202
    record = GeneratedImage.objects.get(id=response.data["id"])
    assert record.provider == "nvidia"
    assert record.model == "flux.1-kontext-dev"
    assert record.status == GeneratedImage.Status.OK
    assert record.mocked is True
    assert bool(record.image) is True
    assert bool(record.source_image) is True
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_base_user_can_edit_image():
    client, user = _authed_client("locked_edit_task", tier=UserModel.Tier.FREE)
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance
    response = client.post(
        "/api/images/edit/",
        {"prompt": "make it blue", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 202
    assert GeneratedImage.objects.filter(user=user).exists()
    account.refresh_from_db()
    assert account.balance < starting_balance


def test_create_edit_insufficient_credits_returns_402_without_enqueuing_work():
    client, user = _authed_client("edit_no_credits")
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post(
        "/api/images/edit/",
        {"prompt": "make it blue", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 402
    assert not GeneratedImage.objects.filter(user=user).exists()


def test_edit_enqueue_failure_refunds_hold_and_returns_503(monkeypatch):
    client, user = _authed_client("edit_enqueue_fails")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(edit_image_task, "delay", boom)

    response = client.post(
        "/api/images/edit/",
        {"prompt": "make it blue", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 503
    record = GeneratedImage.objects.get(user=user)
    assert record.status == GeneratedImage.Status.ERROR
    assert record.credits_charged == Decimal("0")

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_image_gallery_listing_is_not_rate_limited(monkeypatch):
    # Только POST на генерацию должен расходовать лимит — просмотр
    # собственной галереи это чтение и не должен конкурировать за ту же
    # квоту.
    monkeypatch.setattr(
        ImageGenerationRateThrottle, "rate", "1/min", raising=False
    )
    client, user = _authed_client("image_listing_not_limited")
    client.post(
        "/api/images/",
        {"prompt": "a sunset", "task": "realistic"},
        format="json",
    )

    for _ in range(3):
        response = client.get("/api/images/")
        assert response.status_code == 200


def test_create_upscale_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/images/upscale/",
        {"image": _sample_upload(), "task": "upscale_2x"},
        format="multipart",
    )
    assert response.status_code == 401


def test_create_upscale_success_charges_credits_and_saves_file():
    client, user = _authed_client("upscaler")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/upscale/",
        {"image": _sample_upload(), "task": "upscale_4x_face"},
        format="multipart",
    )

    assert response.status_code == 202
    record = GeneratedImage.objects.get(id=response.data["id"])
    assert record.provider == "replicate"
    assert record.model == "real-esrgan"
    assert record.status == GeneratedImage.Status.OK
    assert record.mocked is True
    assert bool(record.image) is True
    assert bool(record.source_image) is True
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_upscale_insufficient_credits_returns_402():
    client, user = _authed_client("upscale_no_credits")
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post(
        "/api/images/upscale/",
        {"image": _sample_upload(), "task": "upscale_2x"},
        format="multipart",
    )

    assert response.status_code == 402
    assert not GeneratedImage.objects.filter(user=user).exists()


def test_upscale_enqueue_failure_refunds_hold_and_returns_503(monkeypatch):
    from imagegen.tasks import upscale_image_2x_task

    client, user = _authed_client("upscale_enqueue_fails")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(upscale_image_2x_task, "delay", boom)

    response = client.post(
        "/api/images/upscale/",
        {"image": _sample_upload(), "task": "upscale_2x"},
        format="multipart",
    )

    assert response.status_code == 503
    record = GeneratedImage.objects.get(user=user)
    assert record.status == GeneratedImage.Status.ERROR
    assert record.credits_charged == Decimal("0")

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_upscale_rejects_invalid_task():
    client, _ = _authed_client("upscale_bad_task")
    response = client.post(
        "/api/images/upscale/",
        {"image": _sample_upload(), "task": "not_a_real_task"},
        format="multipart",
    )
    assert response.status_code == 400
