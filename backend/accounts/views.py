from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.serializers import RegisterSerializer, UserSerializer
from accounts.throttling import AuthRateThrottle
from referrals.services import record_referral


def _set_auth_cookie(response, token_key: str) -> None:
    response.set_cookie(
        settings.AUTH_TOKEN_COOKIE_NAME,
        token_key,
        max_age=settings.AUTH_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="Lax",
    )


def _token_response(request, user, http_status=status.HTTP_200_OK):
    token, _ = Token.objects.get_or_create(user=user)
    # Заставляет Django выставить cookie csrftoken на этом ответе —
    # нужно, поскольку здесь ничего не рендерит шаблон с {% csrf_token
    # %}, обычным триггером. Фронтенд читает значение этой cookie в
    # заголовок X-CSRFToken на каждом небезопасном запросе (см.
    # accounts.authentication.CookieTokenAuthentication._enforce_csrf).
    get_token(request)
    response = Response(UserSerializer(user).data, status=http_status)
    _set_auth_cookie(response, token.key)
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        user = serializer.save()
        referral_code = serializer.validated_data.get("referral_code", "")
        if referral_code:
            record_referral(user, referral_code)
    return _token_response(request, user, status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login_view(request):
    user = authenticate(
        request,
        username=request.data.get("username"),
        password=request.data.get("password"),
    )
    if user is None:
        return Response(
            {"detail": "Invalid credentials"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return _token_response(request, user)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    request.user.auth_token.delete()
    response = Response(status=status.HTTP_204_NO_CONTENT)
    # samesite должен совпадать с тем, что в _set_auth_cookie —
    # delete_cookie() не выводит его из исходной cookie, а несовпадающий
    # SameSite может оставить исходную cookie не истёкшей в браузере.
    response.delete_cookie(settings.AUTH_TOKEN_COOKIE_NAME, samesite="Lax")
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    get_token(request)
    return Response(UserSerializer(request.user).data)
