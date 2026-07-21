import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User as UserModel
from billing.models import CreditAccount
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)
from tests.helpers import authed_client as _shared_authed_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="media_user", tier=UserModel.Tier.PAID):
    # PAID по умолчанию: голос/речь/документ заблокированы для FREE по
    # умолчанию (миграция 0004 progression) — тест самой блокировки
    # передаёт tier=FREE явно.
    return _shared_authed_client(username, tier=tier)


def _audio_file():
    return SimpleUploadedFile(
        "clip.wav", b"RIFF....WAVEfmt ", content_type="audio/wav"
    )


def _document_file():
    return SimpleUploadedFile(
        "scan.png", b"\x89PNG\r\n\x1a\n", content_type="image/png"
    )


def _photo_file():
    # В отличие от _document_file() выше,
    # PhotoAnalysisRequestSerializer.image — настоящий ImageField
    # (проверяется через Pillow), а не простой FileField — заглушка из
    # одних лишь magic-байтов не пройдёт валидацию, так что здесь нужно
    # реальное декодируемое изображение.
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (20, 120, 200)).save(buffer, format="PNG")
    return SimpleUploadedFile(
        "photo.png", buffer.getvalue(), content_type="image/png"
    )


def test_create_transcription_success_charges_credits():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/transcriptions/", {"audio": _audio_file()}, format="multipart"
    )

    assert response.status_code == 202
    record = Transcription.objects.get(id=response.data["id"])
    assert record.status == Transcription.Status.OK
    assert record.mocked is True
    assert record.text == "[mock transcription]"
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_transcription_locked_for_free_tier():
    client, user = _authed_client("locked_voice", tier=UserModel.Tier.FREE)
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/transcriptions/", {"audio": _audio_file()}, format="multipart"
    )

    assert response.status_code == 403
    assert response.data["code"] == "task_locked"
    assert not Transcription.objects.filter(user=user).exists()
    account.refresh_from_db()
    assert account.balance == starting_balance


def test_create_speech_success_charges_credits():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/speech/", {"text": "hello world"}, format="json"
    )

    assert response.status_code == 202
    record = SpeechClip.objects.get(id=response.data["id"])
    assert record.status == SpeechClip.Status.OK
    assert record.mocked is True
    assert bool(record.audio) is True

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_speech_locked_for_free_tier():
    client, user = _authed_client("locked_speech", tier=UserModel.Tier.FREE)
    response = client.post(
        "/api/speech/", {"text": "hello world"}, format="json"
    )
    assert response.status_code == 403
    assert response.data["code"] == "task_locked"
    assert not SpeechClip.objects.filter(user=user).exists()


def test_create_document_extraction_success_charges_credits():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/documents/", {"document": _document_file()}, format="multipart"
    )

    assert response.status_code == 202
    record = DocumentExtraction.objects.get(id=response.data["id"])
    assert record.status == DocumentExtraction.Status.OK
    assert record.mocked is True
    assert record.text == "[mock extracted text]"

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_document_extraction_locked_for_free_tier():
    client, user = _authed_client("locked_doc", tier=UserModel.Tier.FREE)
    response = client.post(
        "/api/documents/", {"document": _document_file()}, format="multipart"
    )
    assert response.status_code == 403
    assert response.data["code"] == "task_locked"
    assert not DocumentExtraction.objects.filter(user=user).exists()


def test_create_photo_analysis_success_charges_credits():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/photos/analyze/", {"image": _photo_file()}, format="multipart"
    )

    assert response.status_code == 202
    record = PhotoAnalysis.objects.get(id=response.data["id"])
    assert record.status == PhotoAnalysis.Status.OK
    assert record.mocked is True
    assert record.text == "[mock] A vibrant scene, perfect for today's post."

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_create_photo_analysis_locked_for_free_tier():
    client, user = _authed_client("locked_photo", tier=UserModel.Tier.FREE)
    response = client.post(
        "/api/photos/analyze/", {"image": _photo_file()}, format="multipart"
    )
    assert response.status_code == 403
    assert response.data["code"] == "task_locked"
    assert not PhotoAnalysis.objects.filter(user=user).exists()


def test_photo_analysis_detail_is_scoped_to_owner():
    client, user = _authed_client("photo_owner")
    other_client, _ = _authed_client("photo_other")

    create_response = client.post(
        "/api/photos/analyze/", {"image": _photo_file()}, format="multipart"
    )
    photo_id = create_response.data["id"]

    own_response = client.get(f"/api/photos/analyze/{photo_id}/")
    assert own_response.status_code == 200

    other_response = other_client.get(f"/api/photos/analyze/{photo_id}/")
    assert other_response.status_code == 404


def test_create_photo_analysis_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/photos/analyze/", {"image": _photo_file()}, format="multipart"
    )
    assert response.status_code == 401


def test_transcription_detail_is_scoped_to_owner():
    client, user = _authed_client("owner")
    other_client, _ = _authed_client("other")

    create_response = client.post(
        "/api/transcriptions/", {"audio": _audio_file()}, format="multipart"
    )
    transcription_id = create_response.data["id"]

    own_response = client.get(f"/api/transcriptions/{transcription_id}/")
    assert own_response.status_code == 200

    other_response = other_client.get(
        f"/api/transcriptions/{transcription_id}/"
    )
    assert other_response.status_code == 404


def test_create_transcription_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/transcriptions/", {"audio": _audio_file()}, format="multipart"
    )
    assert response.status_code == 401
