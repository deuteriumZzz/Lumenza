import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from django.conf import settings

# Telegram's own guidance for both Login Widget and WebApp initData: an
# auth payload older than this is rejected, so a captured/replayed payload
# has a bounded window of usefulness.
MAX_AUTH_AGE_SECONDS = 24 * 60 * 60


class TelegramAuthError(Exception):
    pass


@dataclass(frozen=True)
class TelegramIdentity:
    id: int
    username: str


def verify_login_widget_payload(data: dict) -> TelegramIdentity:
    """Проверяет payload виджета "Login with Telegram" — https://core.
    telegram.org/widgets/login#checking-authorization. Хэш считается по
    всем полям, кроме самого `hash`, отсортированным по имени ключа."""
    received_hash = data.get("hash")
    if not isinstance(received_hash, str) or not received_hash:
        raise TelegramAuthError("Missing hash")
    fields = {k: v for k, v in data.items() if k != "hash"}
    check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
    computed_hash = hmac.new(
        secret_key, check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(computed_hash, received_hash):
        raise TelegramAuthError("Invalid hash")
    _check_freshness(fields.get("auth_date"))
    return _identity_from_fields(fields)


def verify_webapp_init_data(init_data: str) -> TelegramIdentity:
    """Проверяет `initData` Telegram Mini App — https://core.telegram.org
    /bots/webapps#validating-data-received-via-the-mini-app. В отличие от
    Login Widget секретный ключ выводится через промежуточный HMAC с
    константой "WebAppData", а идентичность пользователя лежит не в
    отдельных полях, а в одном JSON-поле `user`."""
    try:
        pairs = parse_qsl(init_data, strict_parsing=True)
    except ValueError as exc:
        raise TelegramAuthError("Malformed init data") from exc
    fields = dict(pairs)
    received_hash = fields.pop("hash", None)
    if not received_hash:
        raise TelegramAuthError("Missing hash")
    check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hmac.new(
        b"WebAppData", settings.TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    computed_hash = hmac.new(
        secret_key, check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(computed_hash, received_hash):
        raise TelegramAuthError("Invalid hash")
    _check_freshness(fields.get("auth_date"))
    user_json = fields.get("user")
    if not user_json:
        raise TelegramAuthError("Missing user")
    try:
        user_fields = json.loads(user_json)
    except json.JSONDecodeError as exc:
        raise TelegramAuthError("Malformed user field") from exc
    if not isinstance(user_fields, dict):
        raise TelegramAuthError("Malformed user field")
    return _identity_from_fields(user_fields)


def _identity_from_fields(fields: dict) -> TelegramIdentity:
    telegram_id = fields.get("id")
    if not isinstance(telegram_id, int) and not (
        isinstance(telegram_id, str) and telegram_id.isdigit()
    ):
        raise TelegramAuthError("Missing or invalid id")
    return TelegramIdentity(
        id=int(telegram_id), username=str(fields.get("username", ""))
    )


def _check_freshness(auth_date) -> None:
    try:
        auth_timestamp = int(auth_date)
    except (TypeError, ValueError) as exc:
        raise TelegramAuthError("Missing auth_date") from exc
    if time.time() - auth_timestamp > MAX_AUTH_AGE_SECONDS:
        raise TelegramAuthError("Stale auth_date")
