import json
import urllib.error
import urllib.request

from django.conf import settings


class TelegramApiError(Exception):
    """Raised whenever Telegram's own response says the call failed —
    unlike media_ops/imagegen's telegram_notify.py (best-effort
    notifications that swallow failures), callers here need to know
    whether a channel connection is real or a message actually sent, since
    that IS the audit trail this feature exists to provide."""


def _call(method: str, payload: dict) -> dict:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise TelegramApiError("TELEGRAM_BOT_TOKEN is not configured")

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    data = json.dumps(payload).encode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read())
        except (ValueError, json.JSONDecodeError):
            body = {}
        raise TelegramApiError(
            body.get("description", f"HTTP {exc.code}")
        ) from exc
    except urllib.error.URLError as exc:
        raise TelegramApiError(str(exc.reason)) from exc

    if not body.get("ok"):
        raise TelegramApiError(body.get("description", "Unknown Telegram error"))
    return body["result"]


def get_chat(chat_id: int) -> dict:
    """Confirms the bot can see chat_id at all (valid id + token). Does
    NOT confirm the bot can post there — that only fails visibly at
    send_message time."""
    return _call("getChat", {"chat_id": chat_id})


def send_message(chat_id: int, text: str) -> dict:
    return _call("sendMessage", {"chat_id": chat_id, "text": text})
