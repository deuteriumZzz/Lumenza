import json
import urllib.error
import urllib.request

from django.conf import settings

# Тот же подход с голым HTTP из воркера Celery, что и в
# imagegen/telegram_notify.py — почему, см. докстринг того модуля.


def _call(method: str, payload: dict) -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    data = json.dumps(payload).encode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except urllib.error.URLError:
        pass


def notify_transcription_ready(chat_id: int, text: str) -> None:
    _call(
        "sendMessage",
        {"chat_id": chat_id, "text": f"Transcription:\n\n{text[:3800]}"},
    )


def notify_speech_ready(chat_id: int, audio_url: str) -> None:
    _call("sendAudio", {"chat_id": chat_id, "audio": audio_url})


def notify_document_ready(chat_id: int, text: str) -> None:
    _call(
        "sendMessage",
        {"chat_id": chat_id, "text": f"Extracted text:\n\n{text[:3800]}"},
    )


def notify_photo_analysis_ready(chat_id: int, text: str) -> None:
    _call(
        "sendMessage",
        {"chat_id": chat_id, "text": f"Caption idea:\n\n{text[:3800]}"},
    )


def notify_media_failed(chat_id: int, message: str) -> None:
    _call("sendMessage", {"chat_id": chat_id, "text": message})
