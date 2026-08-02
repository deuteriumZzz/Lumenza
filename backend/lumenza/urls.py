from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.urls.resolvers import URLPattern, URLResolver
from django.views.static import serve

from core.views import public_config

urlpatterns: list[URLPattern | URLResolver] = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path("api/config/", public_config, name="public-config"),
    path("api/auth/", include("accounts.urls")),
    path("api/billing/", include("billing.urls")),
    path("api/", include("providers.urls")),
    path("api/", include("imagegen.urls")),
    path("api/", include("videogen.urls")),
    path("api/", include("agents.urls")),
    path("api/", include("progression.urls")),
    path("api/", include("media_ops.urls")),
    path("api/", include("referrals.urls")),
    path("api/", include("knowledge.urls")),
    path("api/", include("code_interpreter.urls")),
    path("api/", include("automations.urls")),
    path("bot/", include("bot.urls")),
]


def media_urlpatterns() -> list[URLPattern]:
    if not settings.SERVE_MEDIA_FILES:
        return []
    return [
        re_path(
            rf"^{settings.MEDIA_URL.lstrip('/')}(?P<path>.*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        )
    ]


# Продакшен по-прежнему должен использовать объектное хранилище/CDN.
# Этот opt-in нужен только для локального или временного публичного теста;
# отдельный MEDIA_ROOT не раскрывает файлы обычной dev-среды.
urlpatterns += media_urlpatterns()
