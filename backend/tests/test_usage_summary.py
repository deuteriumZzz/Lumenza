from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from billing.models import CreditAccount, LedgerEntry
from imagegen.models import GeneratedImage
from media_ops.constants import GEMINI_LIVE_MODEL, LIVE_VOICE_PROVIDER
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)
from providers.models import RequestLog
from tests.helpers import authed_client

pytestmark = pytest.mark.django_db


def _request_log(user, **overrides):
    values = {
        "user": user,
        "provider": "openai",
        "model": "gpt-4o-mini",
        "task": "repurpose",
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "credits_charged": Decimal("1.2500"),
        "status": RequestLog.Status.OK,
    }
    return RequestLog.objects.create(**{**values, **overrides})


def test_usage_summary_requires_authentication():
    response = APIClient().get("/api/providers/usage-summary/")

    assert response.status_code == 401


def test_usage_summary_aggregates_successful_requests_by_model():
    client, user = authed_client("usage_owner")
    _request_log(user)
    _request_log(
        user,
        prompt_tokens=40,
        completion_tokens=10,
        credits_charged=Decimal("0.5000"),
    )
    _request_log(
        user,
        provider="anthropic",
        model="claude-3-5-sonnet-latest",
        prompt_tokens=80,
        completion_tokens=120,
        credits_charged=Decimal("3.0000"),
    )
    _request_log(
        user,
        model="failed-model",
        status=RequestLog.Status.ERROR,
        prompt_tokens=999,
        completion_tokens=999,
        credits_charged=Decimal("99.0000"),
    )

    response = client.get("/api/providers/usage-summary/")

    assert response.status_code == 200
    assert response.data == {
        "total": {
            "prompt_tokens": 220,
            "completion_tokens": 180,
            "total_tokens": 400,
            "credits_charged": "4.7500",
            "requests": 3,
        },
        "by_model": [
            {
                "provider": "anthropic",
                "model": "claude-3-5-sonnet-latest",
                "prompt_tokens": 80,
                "completion_tokens": 120,
                "total_tokens": 200,
                "credits_charged": "3.0000",
                "requests": 1,
            },
            {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "prompt_tokens": 140,
                "completion_tokens": 60,
                "total_tokens": 200,
                "credits_charged": "1.7500",
                "requests": 2,
            },
        ],
    }


def test_usage_summary_never_includes_another_users_activity():
    client, user = authed_client("usage_private")
    _, other_user = authed_client("usage_other")
    _request_log(
        other_user,
        prompt_tokens=900,
        completion_tokens=100,
        credits_charged=Decimal("10.0000"),
    )
    _request_log(
        user,
        prompt_tokens=10,
        completion_tokens=5,
        credits_charged=Decimal("0.1000"),
    )

    response = client.get("/api/providers/usage-summary/")

    assert response.status_code == 200
    assert response.data["total"]["total_tokens"] == 15
    assert response.data["total"]["credits_charged"] == "0.1000"


def test_usage_summary_includes_successful_studio_operations():
    client, user = authed_client("usage_studio")
    common = {
        "user": user,
        "provider": "nvidia",
        "model": "studio-model",
        "status": "ok",
    }
    GeneratedImage.objects.create(
        **common,
        prompt="Create a landscape",
        credits_charged=Decimal("1.0000"),
    )
    Transcription.objects.create(
        **common,
        audio="voice_in/test.webm",
        credits_charged=Decimal("2.0000"),
    )
    SpeechClip.objects.create(
        **common,
        text="Read this",
        credits_charged=Decimal("3.0000"),
    )
    DocumentExtraction.objects.create(
        **common,
        document="documents/test.pdf",
        credits_charged=Decimal("4.0000"),
    )
    PhotoAnalysis.objects.create(
        **common,
        image="photos/test.png",
        credits_charged=Decimal("5.0000"),
    )
    GeneratedImage.objects.create(
        **{**common, "status": "error"},
        prompt="Failed image",
        credits_charged=Decimal("99.0000"),
    )

    response = client.get("/api/providers/usage-summary/")

    assert response.status_code == 200
    assert response.data == {
        "total": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "credits_charged": "15.0000",
            "requests": 5,
        },
        "by_model": [
            {
                "provider": "nvidia",
                "model": "studio-model",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "credits_charged": "15.0000",
                "requests": 5,
            }
        ],
    }


def test_usage_summary_includes_only_the_users_live_voice_charges():
    client, user = authed_client("usage_live_voice")
    _, other_user = authed_client("usage_live_voice_other")
    account = CreditAccount.objects.get(user=user)
    other_account = CreditAccount.objects.get(user=other_user)
    LedgerEntry.objects.create(
        account=account,
        amount=Decimal("-2.5000"),
        reason=LedgerEntry.Reason.LIVE_VOICE_SESSION,
        balance_after=Decimal("97.5000"),
    )
    LedgerEntry.objects.create(
        account=account,
        amount=Decimal("-7.0000"),
        reason=LedgerEntry.Reason.CHAT_REQUEST,
        balance_after=Decimal("90.5000"),
    )
    LedgerEntry.objects.create(
        account=other_account,
        amount=Decimal("-50.0000"),
        reason=LedgerEntry.Reason.LIVE_VOICE_SESSION,
        balance_after=Decimal("50.0000"),
    )

    response = client.get("/api/providers/usage-summary/")

    assert response.status_code == 200
    assert response.data == {
        "total": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "credits_charged": "2.5000",
            "requests": 1,
        },
        "by_model": [
            {
                "provider": LIVE_VOICE_PROVIDER,
                "model": GEMINI_LIVE_MODEL,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "credits_charged": "2.5000",
                "requests": 1,
            }
        ],
    }


def test_usage_summary_returns_a_stable_empty_shape():
    client, _ = authed_client("usage_empty")

    response = client.get("/api/providers/usage-summary/")

    assert response.status_code == 200
    assert response.data == {
        "total": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "credits_charged": "0.0000",
            "requests": 0,
        },
        "by_model": [],
    }
