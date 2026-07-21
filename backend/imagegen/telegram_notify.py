import json
import urllib.error
import urllib.request

from django.conf import settings

# Намеренно голый HTTP (без aiogram) — вызывается из воркера Celery, а
# не из процесса бота, а Telegram Bot API — это обычный HTTP API.
# Подключение сюда приложения bot было бы ещё и обратной зависимостью
# (bot должен зависеть от imagegen, а не наоборот).


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
        # Отправка "по возможности" — неудачное уведомление не должно
        # проваливать саму задачу генерации. Результат всё равно виден
        # через API/веб-галерею, даже если push в Telegram не дошёл
        # (например, нет публично доступного MEDIA_URL в локальной
        # разработке — серверы Telegram сами загружают URL из `photo`,
        # так что вне реального деплоя с публичным доменом это просто
        # ничего не делает).
        pass


def notify_image_ready(chat_id: int, image_url: str, caption: str) -> None:
    _call(
        "sendPhoto",
        {"chat_id": chat_id, "photo": image_url, "caption": caption[:1024]},
    )


def notify_image_failed(chat_id: int, message: str) -> None:
    _call("sendMessage", {"chat_id": chat_id, "text": message})
