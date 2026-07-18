from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client, override_settings

from imagegen.models import GeneratedImage
from providers.models import RequestLog
from core.services import margin_dashboard_data

User = get_user_model()

pytestmark = pytest.mark.django_db


@override_settings(CREDIT_USD_VALUE=0.001)
def test_margin_dashboard_aggregates_cost_and_revenue_by_user_and_day():
    user = User.objects.create_user(username="alice", password="strongpass123")
    RequestLog.objects.create(
        user=user,
        provider="openai",
        model="gpt-4o-mini",
        cost_usd=Decimal("0.01"),
        credits_charged=Decimal("13"),
        status=RequestLog.Status.OK,
    )
    RequestLog.objects.create(
        user=user,
        provider="openai",
        model="gpt-4o-mini",
        cost_usd=Decimal("0.02"),
        credits_charged=Decimal("26"),
        status=RequestLog.Status.OK,
    )
    GeneratedImage.objects.create(
        user=user,
        prompt="a cat",
        provider="openai",
        model="dall-e-3",
        cost_usd=Decimal("0.04"),
        credits_charged=Decimal("52"),
        status=GeneratedImage.Status.OK,
    )

    data = margin_dashboard_data()

    assert data.total_requests == 3
    assert data.total_cost_usd == Decimal("0.07")
    # revenue = sum(credits_charged) * CREDIT_USD_VALUE = 91 * 0.001
    assert data.total_revenue_usd == Decimal("0.091")
    assert len(data.by_user_day) == 1
    row = data.by_user_day[0]
    assert row.user == "alice"
    assert row.requests == 3
    assert row.margin_usd == data.total_revenue_usd - data.total_cost_usd


def test_margin_dashboard_ignores_requests_outside_the_window():
    from django.utils import timezone

    user = User.objects.create_user(username="old", password="strongpass123")
    old_log = RequestLog.objects.create(
        user=user, provider="openai", model="gpt-4o-mini", cost_usd=Decimal("1"), status=RequestLog.Status.OK
    )
    RequestLog.objects.filter(pk=old_log.pk).update(created_at=timezone.now() - timezone.timedelta(days=60))

    data = margin_dashboard_data(window_days=30)

    assert data.total_requests == 0
    assert data.by_user_day == []


def test_margin_dashboard_counts_top_error_sources():
    user = User.objects.create_user(username="bob", password="strongpass123")
    RequestLog.objects.create(
        user=user, provider="anthropic", model="claude-3-5-sonnet-latest", status=RequestLog.Status.ERROR
    )
    RequestLog.objects.create(
        user=user, provider="anthropic", model="claude-3-5-sonnet-latest", status=RequestLog.Status.ERROR
    )
    RequestLog.objects.create(user=user, provider="openai", model="gpt-4o-mini", status=RequestLog.Status.OK)
    GeneratedImage.objects.create(
        user=user, prompt="x", provider="replicate", model="flux-schnell", status=GeneratedImage.Status.BLOCKED
    )

    data = margin_dashboard_data()

    by_key = {(row.source, row.provider, row.model): row.count for row in data.top_errors}
    assert by_key[("chat", "anthropic", "claude-3-5-sonnet-latest")] == 2
    assert by_key[("image_blocked", "replicate", "flux-schnell")] == 1
    assert ("chat", "openai", "gpt-4o-mini") not in by_key


def test_margin_dashboard_admin_requires_staff_login():
    response = Client().get("/admin/core/margindashboard/")
    assert response.status_code == 302
    assert "/admin/login/" in response.url


def test_margin_dashboard_admin_renders_for_superuser():
    User.objects.create_superuser(username="root", email="root@example.com", password="strongpass123")
    client = Client()
    client.login(username="root", password="strongpass123")

    response = client.get("/admin/core/margindashboard/")

    assert response.status_code == 200
    assert b"Margin dashboard" in response.content
