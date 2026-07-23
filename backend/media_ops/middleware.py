from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _user_from_token(token_key: str):
    from rest_framework.authtoken.models import Token

    try:
        return Token.objects.select_related("user").get(key=token_key).user
    except Token.DoesNotExist:
        return AnonymousUser()


def _cookie_value(scope, name: str) -> str | None:
    raw = dict(scope.get("headers") or []).get(b"cookie", b"").decode()
    for part in raw.split(";"):
        part = part.strip()
        if part.startswith(f"{name}="):
            return part[len(name) + 1 :]
    return None


class TokenAuthMiddleware:
    """Тот же httpOnly-cookie токен, что уже использует REST API
    (accounts.authentication.CookieTokenAuthentication) — переиспользован
    здесь, а не отдельная WS-специфичная схема авторизации, чтобы у
    браузера была ровно одна сессия на оба протокола."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        token_key = _cookie_value(scope, settings.AUTH_TOKEN_COOKIE_NAME)
        scope["user"] = (
            await _user_from_token(token_key) if token_key else AnonymousUser()
        )
        return await self.app(scope, receive, send)
