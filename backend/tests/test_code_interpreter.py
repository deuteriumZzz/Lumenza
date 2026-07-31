from unittest.mock import Mock

import pytest
from rest_framework.test import APIClient

from accounts.models import User as UserModel
from billing.models import CreditAccount
from code_interpreter.models import CodeExecution
from code_interpreter.piston_adapter import PistonAdapter
from tests.helpers import authed_client as _shared_authed_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _authed_client(username="code_user", tier=UserModel.Tier.PAID):
    return _shared_authed_client(username, tier=tier)


def test_create_code_execution_success_charges_credits():
    client, user = _authed_client()
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/code/executions/",
        {"code": "print(2 + 2)"},
        format="json",
    )

    assert response.status_code == 202
    record = CodeExecution.objects.get(id=response.data["id"])
    assert record.status == CodeExecution.Status.OK
    assert record.mocked is True
    assert record.language == "python"
    assert record.exit_code == 0
    assert record.credits_charged > 0

    account.refresh_from_db()
    assert account.balance == starting_balance - record.credits_charged


def test_base_user_can_run_code():
    client, user = _authed_client("locked_code", tier=UserModel.Tier.FREE)
    response = client.post(
        "/api/code/executions/", {"code": "print(1)"}, format="json"
    )
    assert response.status_code == 202
    assert CodeExecution.objects.filter(user=user).exists()


def test_create_code_execution_blocked_by_moderation_refunds_credits():
    client, user = _authed_client("moderated_code")
    account = CreditAccount.objects.get(user=user)
    starting_balance = account.balance

    response = client.post(
        "/api/code/executions/",
        {"code": "print('child sexual content')"},
        format="json",
    )

    assert response.status_code == 202
    record = CodeExecution.objects.get(id=response.data["id"])
    assert record.status == CodeExecution.Status.BLOCKED
    assert record.credits_charged == 0

    account.refresh_from_db()
    assert account.balance == starting_balance


def test_create_code_execution_with_zero_balance_returns_402():
    client, user = _authed_client("broke_code")
    account = CreditAccount.objects.get(user=user)
    account.balance = 0
    account.save(update_fields=["balance"])

    response = client.post(
        "/api/code/executions/", {"code": "print(1)"}, format="json"
    )

    assert response.status_code == 402
    assert not CodeExecution.objects.filter(user=user).exists()


def test_code_execution_detail_is_scoped_to_owner():
    client, _ = _authed_client("code_owner")
    other_client, _ = _authed_client("code_other")

    create_response = client.post(
        "/api/code/executions/", {"code": "print(1)"}, format="json"
    )
    execution_id = create_response.data["id"]

    own_response = client.get(f"/api/code/executions/{execution_id}/")
    assert own_response.status_code == 200

    other_response = other_client.get(
        f"/api/code/executions/{execution_id}/"
    )
    assert other_response.status_code == 404


def test_create_code_execution_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/code/executions/", {"code": "print(1)"}, format="json"
    )
    assert response.status_code == 401


def test_create_code_execution_rejects_blank_code():
    client, _ = _authed_client("blank_code")
    response = client.post(
        "/api/code/executions/", {"code": ""}, format="json"
    )
    assert response.status_code == 400


# --- PistonAdapter ---


def test_piston_adapter_mocked_without_url():
    result = PistonAdapter().execute("print(1)")
    assert result.mocked is True
    assert result.exit_code == 0
    assert result.language == "python"


def test_piston_adapter_calls_real_endpoint(monkeypatch, settings):
    settings.PISTON_API_URL = "http://piston.internal:2000"
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        response = Mock()
        response.raise_for_status = Mock()
        response.json.return_value = {
            "language": "python",
            "version": "3.12.0",
            "run": {"stdout": "4\n", "stderr": "", "code": 0},
        }
        return response

    import requests

    monkeypatch.setattr(requests, "post", fake_post)

    result = PistonAdapter().execute("print(2 + 2)")

    assert captured["url"] == "http://piston.internal:2000/api/v2/execute"
    assert captured["json"]["files"] == [{"content": "print(2 + 2)"}]
    assert result.stdout == "4\n"
    assert result.exit_code == 0
    assert result.mocked is False


def test_piston_adapter_propagates_non_zero_exit_code(monkeypatch, settings):
    settings.PISTON_API_URL = "http://piston.internal:2000"

    def fake_post(url, json=None, timeout=None):
        response = Mock()
        response.raise_for_status = Mock()
        response.json.return_value = {
            "language": "python",
            "version": "3.12.0",
            "run": {"stdout": "", "stderr": "Traceback...\n", "code": 1},
        }
        return response

    import requests

    monkeypatch.setattr(requests, "post", fake_post)

    result = PistonAdapter().execute("1/0")

    assert result.exit_code == 1
    assert "Traceback" in result.stderr


def test_piston_adapter_raises_on_network_failure(monkeypatch, settings):
    settings.PISTON_API_URL = "http://piston.internal:2000"

    def fake_post(url, json=None, timeout=None):
        raise ConnectionError("boom")

    import requests

    monkeypatch.setattr(requests, "post", fake_post)

    with pytest.raises(ConnectionError):
        PistonAdapter().execute("print(1)")
