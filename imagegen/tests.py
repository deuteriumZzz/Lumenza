from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from billing.models import CreditAccount
from imagegen.models import GeneratedImage
from imagegen.tasks import generate_image, generate_image_task
from imagegen.throttling import ImageGenerationRateThrottle

User = get_user_model()

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="artist"):
    user = User.objects.create_user(username=username, password="strongpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def test_create_image_requires_authentication():
    client = APIClient()
    response = client.post("/api/images/", {"prompt": "a fox", "provider": "openai"}, format="json")
    assert response.status_code == 401


def test_create_image_rejects_blank_prompt():
    client, _ = _authed_client()
    response = client.post("/api/images/", {"prompt": "   ", "provider": "openai"}, format="json")
    assert response.status_code == 400


def test_create_image_success_charges_credits_and_saves_file():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/", {"prompt": "a fox reading a book", "provider": "openai"}, format="json"
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


def test_create_image_with_flux_provider_routes_to_replicate():
    client, user = _authed_client()
    response = client.post("/api/images/", {"prompt": "a neon skyline", "provider": "flux"}, format="json")
    assert response.status_code == 202

    record = GeneratedImage.objects.get(id=response.data["id"])
    assert record.provider == "replicate"
    assert record.model == "flux-schnell"
    assert record.status == GeneratedImage.Status.OK
    assert record.mocked is True


def test_create_image_insufficient_credits_returns_402_without_enqueuing_work():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post("/api/images/", {"prompt": "a fox", "provider": "openai"}, format="json")

    assert response.status_code == 402
    assert not GeneratedImage.objects.filter(user=user).exists()

    account.refresh_from_db()
    assert account.balance == Decimal("0")


def test_create_image_blocked_by_moderation_refunds_hold():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/", {"prompt": "child sexual content", "provider": "openai"}, format="json"
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

    client.post("/api/images/", {"prompt": "mine", "provider": "openai"}, format="json")
    other_client.post("/api/images/", {"prompt": "not mine", "provider": "openai"}, format="json")

    response = client.get("/api/images/")
    assert response.status_code == 200
    results = response.data["results"]
    assert len(results) == 1
    assert GeneratedImage.objects.get(id=results[0]["id"]).user == user


def test_image_detail_view_is_scoped_to_owner():
    client, user = _authed_client("detail_owner")
    other_client, _ = _authed_client("detail_other")

    create_response = client.post(
        "/api/images/", {"prompt": "a private image", "provider": "openai"}, format="json"
    )
    image_id = create_response.data["id"]

    own_response = client.get(f"/api/images/{image_id}/")
    assert own_response.status_code == 200
    assert own_response.data["status"] == "ok"

    other_response = other_client.get(f"/api/images/{image_id}/")
    assert other_response.status_code == 404


def test_duplicate_task_delivery_does_not_double_refund():
    # Regression test: a redelivered task (e.g. after a worker crash, or
    # simply Celery's own retry machinery) used to re-run the whole
    # generation flow — including a second independent refund grant — since
    # nothing checked whether the record had already been processed.
    client, user = _authed_client("dup_delivery")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/images/", {"prompt": "a single fox", "provider": "openai"}, format="json"
    )
    image_id = response.data["id"]
    record = GeneratedImage.objects.get(id=image_id)
    assert record.status == GeneratedImage.Status.OK
    credits_charged_once = record.credits_charged

    account.refresh_from_db()
    balance_after_first_run = account.balance
    assert balance_after_first_run == starting_balance - credits_charged_once

    # Simulate the same task message being delivered again.
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
        "/api/images/", {"prompt": "should fail to enqueue", "provider": "openai"}, format="json"
    )

    assert response.status_code == 503

    record = GeneratedImage.objects.get(user=user)
    assert record.status == GeneratedImage.Status.ERROR
    assert record.credits_charged == Decimal("0")

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_image_creation_is_rate_limited(monkeypatch):
    monkeypatch.setattr(ImageGenerationRateThrottle, "rate", "1/min", raising=False)
    client, user = _authed_client("image_rate_limited")

    first = client.post("/api/images/", {"prompt": "a sunset", "provider": "openai"}, format="json")
    second = client.post("/api/images/", {"prompt": "a sunrise", "provider": "openai"}, format="json")

    assert first.status_code == 202
    assert second.status_code == 429


def test_image_gallery_listing_is_not_rate_limited(monkeypatch):
    # Only the generation POST should count against the budget — browsing
    # your own gallery is a read and shouldn't compete for the same quota.
    monkeypatch.setattr(ImageGenerationRateThrottle, "rate", "1/min", raising=False)
    client, user = _authed_client("image_listing_not_limited")
    client.post("/api/images/", {"prompt": "a sunset", "provider": "openai"}, format="json")

    for _ in range(3):
        response = client.get("/api/images/")
        assert response.status_code == 200
