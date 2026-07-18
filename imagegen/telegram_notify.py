import json
import urllib.error
import urllib.request

from django.conf import settings

# Deliberately raw HTTP (no aiogram) — this fires from a Celery worker, not
# the bot process, and the Telegram Bot API is a plain HTTP API. Pulling in
# the bot app here would also be a backwards dependency (bot should depend
# on imagegen, not the other way around).


def _call(method: str, payload: dict) -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    data = json.dumps(payload).encode()
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except urllib.error.URLError:
        # Best-effort push — a failed notification shouldn't fail the
        # generation task itself. The result is still visible through the
        # API/web gallery even if the Telegram push didn't land (e.g. no
        # publicly reachable MEDIA_URL in local dev — Telegram's servers
        # fetch `photo` URLs themselves, so this is a no-op outside a real
        # deployment with a public domain).
        pass


def notify_image_ready(chat_id: int, image_url: str, caption: str) -> None:
    _call("sendPhoto", {"chat_id": chat_id, "photo": image_url, "caption": caption[:1024]})


def notify_image_failed(chat_id: int, message: str) -> None:
    _call("sendMessage", {"chat_id": chat_id, "text": message})
