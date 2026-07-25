from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def public_config(request):
    # Значения публичны по своей природе: @username виден в любом
    # t.me/<username>-URL, а bot_id — это просто числовой префикс токена
    # до двоеточия, который Telegram сам показывает как часть подписи
    # бота в API-ответах. Фронтенду он нужен для кастомной кнопки входа
    # через Telegram.Login.auth() (см. telegram-login-button.tsx) вместо
    # авто-рендерящегося iframe-виджета. Секретом является только сам
    # TELEGRAM_BOT_TOKEN целиком — он сюда не попадает.
    bot_id = settings.TELEGRAM_BOT_TOKEN.split(":", 1)[0]
    return Response(
        {
            "telegram_bot_username": settings.TELEGRAM_BOT_USERNAME,
            "telegram_bot_id": bot_id if bot_id.isdigit() else "",
        }
    )
