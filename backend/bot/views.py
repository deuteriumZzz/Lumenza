import hmac
import json

from aiogram.types import Update
from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from bot.dispatcher import create_bot, create_dispatcher

# Синглтоны на уровне модуля: один Bot/Dispatcher на процесс. Создавать
# дёшево, но Bot держит aiohttp-сессию, которую стоит переиспользовать
# между запросами, а не открывать заново каждый раз.
_bot = None
_dispatcher = None


def _get_bot():
    global _bot
    if _bot is None:
        _bot = create_bot()
    return _bot


def _get_dispatcher():
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = create_dispatcher()
    return _dispatcher


@csrf_exempt
@require_POST
async def telegram_webhook(request, secret: str):
    # Две независимые проверки: URL-путь с секретом означает, что
    # эндпоинт вообще не угадываем без него, а проверка заголовка
    # (собственный механизм `secret_token` от Telegram, задаётся через
    # setWebhook) всё равно защищает, даже если сам URL где-то утёк
    # (логи, referrer). Без любой из них кто угодно мог бы отправлять
    # POST с произвольными поддельными Update — например, подделывая
    # новые значения telegram_id, чтобы фармить неограниченное число
    # аккаунтов с приветственным бонусом.
    if not settings.TELEGRAM_WEBHOOK_SECRET or not hmac.compare_digest(
        secret, settings.TELEGRAM_WEBHOOK_SECRET
    ):
        return HttpResponseForbidden()
    header_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token") or ""
    if not hmac.compare_digest(header_token, settings.TELEGRAM_WEBHOOK_SECRET):
        return HttpResponseForbidden()

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    update = Update.model_validate(payload)
    await _get_dispatcher().feed_update(_get_bot(), update)
    return HttpResponse(status=200)
