import io
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User as UserModel
from billing.models import CreditAccount
from tests.helpers import authed_client as _shared_authed_client
from videogen.models import GeneratedVideo
from videogen.tasks import (
    animate_video_task,
    generate_video,
    generate_video_task,
)
from videogen.throttling import VideoGenerationRateThrottle

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="director", tier=UserModel.Tier.PAID):
    return _shared_authed_client(username, tier=tier)


def _sample_upload(name="frame.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (10, 20, 30)).save(buffer, format="PNG")
    return SimpleUploadedFile(
        name, buffer.getvalue(), content_type="image/png"
    )


def test_create_video_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/videos/", {"prompt": "a fox running"}, format="json"
    )
    assert response.status_code == 401


def test_create_video_rejects_blank_prompt():
    client, _ = _authed_client()
    response = client.post("/api/videos/", {"prompt": "   "}, format="json")
    assert response.status_code == 400


def test_create_video_success_charges_credits_and_saves_file():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/videos/", {"prompt": "a fox running through a forest"}, format="json"
    )

    assert response.status_code == 202
    video_id = response.data["id"]

    record = GeneratedVideo.objects.get(id=video_id)
    assert record.status == GeneratedVideo.Status.OK
    assert record.mocked is True
    assert record.provider == "replicate"
    assert record.model == "wan-2.5-t2v-fast"
    assert bool(record.video) is True
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_video_insufficient_credits_returns_402_no_enqueue():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post(
        "/api/videos/", {"prompt": "a fox running"}, format="json"
    )

    assert response.status_code == 402
    assert not GeneratedVideo.objects.filter(user=user).exists()

    account.refresh_from_db()
    assert account.balance == Decimal("0")


def test_create_video_blocked_by_moderation_refunds_hold():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/videos/", {"prompt": "child sexual content"}, format="json"
    )

    assert response.status_code == 202
    record = GeneratedVideo.objects.get(id=response.data["id"])
    assert record.status == GeneratedVideo.Status.BLOCKED
    assert record.credits_charged == Decimal("0")
    assert bool(record.video) is False

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_base_user_can_create_video():
    client, user = _authed_client("locked_video_task", tier=UserModel.Tier.FREE)
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance
    response = client.post(
        "/api/videos/", {"prompt": "a fox running"}, format="json"
    )

    assert response.status_code == 202
    assert GeneratedVideo.objects.filter(user=user).exists()
    account.refresh_from_db()
    assert account.balance < starting_balance


def test_gallery_lists_only_the_requesting_users_videos():
    client, user = _authed_client("gallery_owner")
    other_client, _ = _authed_client("gallery_other")

    client.post("/api/videos/", {"prompt": "mine"}, format="json")
    other_client.post("/api/videos/", {"prompt": "not mine"}, format="json")

    response = client.get("/api/videos/")
    assert response.status_code == 200
    results = response.data["results"]
    assert len(results) == 1
    assert GeneratedVideo.objects.get(id=results[0]["id"]).user == user


def test_video_detail_view_is_scoped_to_owner():
    client, user = _authed_client("detail_owner")
    other_client, _ = _authed_client("detail_other")

    create_response = client.post(
        "/api/videos/", {"prompt": "a private clip"}, format="json"
    )
    video_id = create_response.data["id"]

    own_response = client.get(f"/api/videos/{video_id}/")
    assert own_response.status_code == 200
    assert own_response.data["status"] == "ok"

    other_response = other_client.get(f"/api/videos/{video_id}/")
    assert other_response.status_code == 404


def test_duplicate_task_delivery_does_not_double_refund():
    client, user = _authed_client("dup_delivery")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/videos/", {"prompt": "a single fox"}, format="json"
    )
    video_id = response.data["id"]
    record = GeneratedVideo.objects.get(id=video_id)
    assert record.status == GeneratedVideo.Status.OK
    credits_charged_once = record.credits_charged

    account.refresh_from_db()
    balance_after_first_run = account.balance
    assert balance_after_first_run == starting_balance - credits_charged_once

    generate_video(video_id)

    record.refresh_from_db()
    account.refresh_from_db()
    assert record.status == GeneratedVideo.Status.OK
    assert record.credits_charged == credits_charged_once
    assert account.balance == balance_after_first_run


def test_enqueue_failure_refunds_hold_and_returns_503(monkeypatch):
    client, user = _authed_client("enqueue_fails")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(generate_video_task, "delay", boom)

    response = client.post(
        "/api/videos/", {"prompt": "should fail to enqueue"}, format="json"
    )

    assert response.status_code == 503

    record = GeneratedVideo.objects.get(user=user)
    assert record.status == GeneratedVideo.Status.ERROR
    assert record.credits_charged == Decimal("0")

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_video_creation_is_rate_limited(monkeypatch):
    monkeypatch.setattr(
        VideoGenerationRateThrottle, "rate", "1/min", raising=False
    )
    client, user = _authed_client("video_rate_limited")

    first = client.post("/api/videos/", {"prompt": "a sunset"}, format="json")
    second = client.post("/api/videos/", {"prompt": "a sunrise"}, format="json")

    assert first.status_code == 202
    assert second.status_code == 429


def test_video_gallery_listing_is_not_rate_limited(monkeypatch):
    monkeypatch.setattr(
        VideoGenerationRateThrottle, "rate", "1/min", raising=False
    )
    client, user = _authed_client("video_listing_not_limited")
    client.post("/api/videos/", {"prompt": "a sunset"}, format="json")

    for _ in range(3):
        response = client.get("/api/videos/")
        assert response.status_code == 200


def test_create_animate_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/videos/animate/",
        {"prompt": "make it move", "image": _sample_upload()},
        format="multipart",
    )
    assert response.status_code == 401


def test_create_animate_success_charges_credits_and_saves_both_files():
    client, user = _authed_client("animator")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/videos/animate/",
        {"prompt": "make it move", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 202
    record = GeneratedVideo.objects.get(id=response.data["id"])
    assert record.provider == "replicate"
    assert record.model == "wan-2.5-i2v-fast"
    assert record.status == GeneratedVideo.Status.OK
    assert record.mocked is True
    assert bool(record.video) is True
    assert bool(record.source_image) is True
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_animate_insufficient_credits_returns_402_without_enqueuing_work():
    client, user = _authed_client("animate_no_credits")
    account = CreditAccount.objects.get(user=user)
    account.balance = Decimal("0")
    account.save(update_fields=["balance"])

    response = client.post(
        "/api/videos/animate/",
        {"prompt": "make it move", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 402
    assert not GeneratedVideo.objects.filter(user=user).exists()


def test_animate_enqueue_failure_refunds_hold_and_returns_503(monkeypatch):
    client, user = _authed_client("animate_enqueue_fails")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    def boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(animate_video_task, "delay", boom)

    response = client.post(
        "/api/videos/animate/",
        {"prompt": "make it move", "image": _sample_upload()},
        format="multipart",
    )

    assert response.status_code == 503
    record = GeneratedVideo.objects.get(user=user)
    assert record.status == GeneratedVideo.Status.ERROR
    assert record.credits_charged == Decimal("0")

    account.refresh_from_db()
    assert account.balance == starting_balance
