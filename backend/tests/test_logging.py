import json
import logging
import re
import sys
from decimal import Decimal

from django.test import RequestFactory, override_settings
from django.urls import resolve

from core.logging import JsonFormatter, current_request_id
from core.middleware import RequestLoggingMiddleware


def _capture_request_logger(caplog):
    request_logger = logging.getLogger("lumenza.request")
    request_logger.addHandler(caplog.handler)
    return request_logger


def test_json_formatter_emits_allowlisted_structured_fields_only():
    record = logging.LogRecord(
        name="providers.services",
        level=logging.ERROR,
        pathname=__file__,
        lineno=12,
        msg="provider.failed",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-123"
    record.provider = "openai"
    record.model = "gpt-test"
    record.password = "must-not-leak"

    payload = json.loads(JsonFormatter().format(record))

    assert payload["level"] == "error"
    assert payload["logger"] == "providers.services"
    assert payload["event"] == "provider.failed"
    assert payload["request_id"] == "req-123"
    assert payload["provider"] == "openai"
    assert payload["model"] == "gpt-test"
    assert "password" not in payload
    assert payload["timestamp"].endswith("Z")


def test_json_formatter_redacts_secrets_and_omits_exception_payload():
    secret = "telegram-webhook-secret-must-not-leak"
    try:
        raise RuntimeError(f"broker URL contains {secret}\n" + "x" * 1_000)
    except RuntimeError:
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="django.request",
        level=logging.ERROR,
        pathname=__file__,
        lineno=12,
        msg=f"Not Found: /bot/webhook/{secret}/\n" + "y" * 1_000,
        args=(),
        exc_info=exc_info,
    )

    with override_settings(TELEGRAM_WEBHOOK_SECRET=secret):
        payload = json.loads(JsonFormatter().format(record))

    rendered = json.dumps(payload)
    assert secret not in rendered
    assert "broker URL contains" not in rendered
    assert payload["error_type"] == "RuntimeError"
    assert "\n" not in payload["event"]
    assert len(payload["event"]) <= 512


def test_json_formatter_redacts_credentials_from_service_urls():
    record = logging.LogRecord(
        name="celery.worker",
        level=logging.ERROR,
        pathname=__file__,
        lineno=12,
        msg=(
            "redis://worker:redis-password@redis:6379/0 "
            "amqp://broker:amqp-password@rabbitmq/vhost"
        ),
        args=(),
        exc_info=None,
    )

    payload = json.loads(JsonFormatter().format(record))

    assert "redis-password" not in payload["event"]
    assert "amqp-password" not in payload["event"]
    assert payload["event"].count("[REDACTED]") == 2


def test_request_middleware_logs_safe_completion_context(caplog):
    request = RequestFactory().get(
        "/health/?token=must-not-leak",
        HTTP_X_REQUEST_ID="client-request_123",
    )
    request.resolver_match = resolve(request.path)

    def get_response(inner_request):
        assert current_request_id() != "client-request_123"
        from django.http import JsonResponse

        return JsonResponse({"status": "ok"}, status=204)

    middleware = RequestLoggingMiddleware(get_response)
    request_logger = _capture_request_logger(caplog)
    try:
        response = middleware(request)
    finally:
        request_logger.removeHandler(caplog.handler)

    record = next(
        item
        for item in caplog.records
        if item.getMessage() == "http.request_completed"
    )
    assert record.request_id != "client-request_123"
    assert re.fullmatch(r"[0-9a-f-]{36}", record.request_id)
    assert record.method == "GET"
    assert record.path == "/health/"
    assert record.status_code == 204
    assert isinstance(record.duration_ms, float)
    assert response["X-Request-ID"] == record.request_id
    assert current_request_id() is None
    assert "must-not-leak" not in JsonFormatter().format(record)


def test_request_middleware_replaces_unsafe_request_id_and_warns_for_4xx(
    caplog,
):
    request = RequestFactory().get(
        "/missing/", HTTP_X_REQUEST_ID="bad\nrequest-id"
    )

    def get_response(_request):
        from django.http import HttpResponse

        return HttpResponse(status=404)

    middleware = RequestLoggingMiddleware(get_response)
    request_logger = _capture_request_logger(caplog)
    try:
        response = middleware(request)
    finally:
        request_logger.removeHandler(caplog.handler)

    record = next(
        item
        for item in caplog.records
        if item.getMessage() == "http.request_completed"
    )
    assert record.levelno == logging.WARNING
    assert record.request_id != "bad\nrequest-id"
    assert re.fullmatch(r"[0-9a-f-]{36}", record.request_id)
    assert response["X-Request-ID"] == record.request_id


def test_request_middleware_logs_route_template_instead_of_url_secret(caplog):
    secret = "telegram-webhook-secret-must-not-leak"
    request = RequestFactory().post(f"/bot/webhook/{secret}/")
    request.resolver_match = resolve(request.path)

    def get_response(_request):
        from django.http import HttpResponse

        return HttpResponse(status=200)

    middleware = RequestLoggingMiddleware(get_response)
    request_logger = _capture_request_logger(caplog)
    try:
        middleware(request)
    finally:
        request_logger.removeHandler(caplog.handler)

    record = next(
        item
        for item in caplog.records
        if item.getMessage() == "http.request_completed"
    )
    rendered = JsonFormatter().format(record)
    assert record.path == "/bot/webhook/<str:secret>/"
    assert secret not in rendered


def test_request_middleware_logs_exception_without_losing_context(caplog):
    request = RequestFactory().post("/api/chat/")
    request.resolver_match = resolve(request.path)

    def get_response(_request):
        assert current_request_id() is not None
        raise RuntimeError("provider unavailable")

    middleware = RequestLoggingMiddleware(get_response)
    request_logger = _capture_request_logger(caplog)
    try:
        try:
            middleware(request)
        except RuntimeError:
            pass
        else:
            raise AssertionError("middleware must re-raise request exceptions")
    finally:
        request_logger.removeHandler(caplog.handler)

    record = next(
        item
        for item in caplog.records
        if item.getMessage() == "http.request_failed"
    )
    assert record.method == "POST"
    assert record.path == "/api/chat/"
    assert record.exc_info is None
    assert record.error_type == "RuntimeError"
    assert current_request_id() is None


def test_enqueue_failure_emits_structured_operational_event(
    monkeypatch, caplog
):
    from core.enqueue import try_enqueue_or_refund

    class BrokenTask:
        name = "imagegen.generate_image"

        @staticmethod
        def delay(_record_id):
            raise ConnectionError("broker unavailable")

    class DummyRecord:
        class Status:
            ERROR = "error"

        id = 42
        status = "pending"
        credits_charged = Decimal("2")
        error_message = ""
        completed_at = None

        def save(self, **_kwargs):
            return None

    class DummyUser:
        pk = 7

    monkeypatch.setattr(
        "core.enqueue.grant_credits", lambda *_args, **_kwargs: None
    )
    operation_logger = logging.getLogger("core.enqueue")
    operation_logger.addHandler(caplog.handler)
    try:
        result = try_enqueue_or_refund(
            BrokenTask(),
            DummyRecord(),
            DummyUser(),
            Decimal("2"),
            "Failed to enqueue image generation",
        )
    finally:
        operation_logger.removeHandler(caplog.handler)

    assert result is False
    record = next(
        item
        for item in caplog.records
        if item.getMessage() == "queue.publish_failed"
    )
    assert record.task_name == "imagegen.generate_image"
    assert record.record_id == 42
    assert record.user_id == 7
    assert record.error_type == "ConnectionError"
