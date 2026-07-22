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
    # Значение публично по своей природе (это просто @username бота,
    # видимый в любом t.me/<username>-URL) — секретом является только
    # TELEGRAM_BOT_TOKEN, который сюда не попадает. Фронтенд использует
    # это, чтобы не хардкодить и не дублировать имя бота отдельной
    # переменной окружения на своей стороне.
    return Response({"telegram_bot_username": settings.TELEGRAM_BOT_USERNAME})
