import json

from aiogram.types import Update
from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from bot.dispatcher import create_bot, create_dispatcher

# Module-level singletons: one Bot/Dispatcher per process. Cheap to create,
# but the Bot holds an aiohttp session that should be reused across
# requests rather than opened fresh every time.
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
    # Two independent checks: the secret-bearing URL path means the
    # endpoint isn't guessable at all without it, and the header check
    # (Telegram's native `secret_token` mechanism, set via setWebhook)
    # still protects even if the URL itself leaked somewhere (logs,
    # referrers). Without either, anyone could POST arbitrary fake
    # Updates — e.g. spoofing new telegram_id values to farm unlimited
    # signup-bonus accounts.
    if not settings.TELEGRAM_WEBHOOK_SECRET or secret != settings.TELEGRAM_WEBHOOK_SECRET:
        return HttpResponseForbidden()
    if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != settings.TELEGRAM_WEBHOOK_SECRET:
        return HttpResponseForbidden()

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    update = Update.model_validate(payload)
    await _get_dispatcher().feed_update(_get_bot(), update)
    return HttpResponse(status=200)
