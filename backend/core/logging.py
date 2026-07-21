import json
import logging
import re
from contextvars import ContextVar, Token
from datetime import datetime, timezone
from typing import Any

from django.conf import settings

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
MAX_TEXT_FIELD_LENGTH = 512
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]+")
BEARER_TOKEN = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+")
URL_CREDENTIALS = re.compile(r"(?i)([a-z][a-z0-9+.-]*://[^:/\s]+:)[^@\s]+@")
QUERY_SECRET = re.compile(
    r"(?i)([?&](?:api[_-]?key|key|password|secret|token)=)[^&#\s]+"
)

SAFE_LOG_FIELDS = (
    "request_id",
    "method",
    "path",
    "status_code",
    "duration_ms",
    "user_id",
    "task_id",
    "task_name",
    "provider",
    "model",
    "record_id",
    "error_type",
)


def bind_request_id(request_id: str) -> Token[str | None]:
    return _request_id.set(request_id)


def reset_request_id(token: Token[str | None]) -> None:
    _request_id.reset(token)


def current_request_id() -> str | None:
    return _request_id.get()


def _configured_secret_values() -> tuple[str, ...]:
    if not settings.configured:
        return ()

    secret_names = (
        "SECRET_KEY",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_WEBHOOK_SECRET",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_API_KEY",
        "REPLICATE_API_TOKEN",
        "NVIDIA_API_KEY",
        "YOOKASSA_SECRET_KEY",
        "CELERY_BROKER_URL",
        "CELERY_RESULT_BACKEND",
        "DATABASE_URL",
    )
    values = [
        value
        for name in secret_names
        if isinstance(value := getattr(settings, name, None), str)
        and len(value) >= 8
    ]
    database_password = settings.DATABASES.get("default", {}).get(
        "PASSWORD", ""
    )
    if isinstance(database_password, str) and len(database_password) >= 8:
        values.append(database_password)
    cache_location = settings.CACHES.get("default", {}).get("LOCATION", "")
    if isinstance(cache_location, str) and len(cache_location) >= 8:
        values.append(cache_location)
    return tuple(values)


def _clean_text(value: str) -> str:
    text = CONTROL_CHARACTERS.sub(" ", value)
    for secret in _configured_secret_values():
        text = text.replace(secret, "[REDACTED]")
    text = BEARER_TOKEN.sub(r"\1[REDACTED]", text)
    text = URL_CREDENTIALS.sub(r"\1[REDACTED]@", text)
    text = QUERY_SECRET.sub(r"\1[REDACTED]", text)
    if len(text) <= MAX_TEXT_FIELD_LENGTH:
        return text
    return f"{text[: MAX_TEXT_FIELD_LENGTH - 3]}..."


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", None):
            request_id = current_request_id()
            if request_id is not None:
                record.request_id = request_id
        return True


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, str):
        return _clean_text(value)
    return _clean_text(str(value))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        timestamp = (
            datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        payload: dict[str, Any] = {
            "timestamp": timestamp,
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": _clean_text(record.getMessage()),
        }
        for field in SAFE_LOG_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = _json_value(value)
        if record.exc_info:
            exception_type = record.exc_info[0]
            if exception_type is not None:
                payload.setdefault("error_type", exception_type.__name__)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
