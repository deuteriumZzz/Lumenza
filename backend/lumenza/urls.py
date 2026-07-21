from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.urls.resolvers import URLPattern, URLResolver

urlpatterns: list[URLPattern | URLResolver] = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/billing/", include("billing.urls")),
    path("api/", include("providers.urls")),
    path("api/", include("imagegen.urls")),
    path("api/", include("progression.urls")),
    path("api/", include("media_ops.urls")),
    path("api/", include("referrals.urls")),
    path("bot/", include("bot.urls")),
]

if settings.DEBUG:
    # В разработке сгенерированные изображения отдаются прямо с диска. В
    # продакшене здесь должно быть настоящее объектное хранилище / CDN
    # перед MEDIA_URL — Django никогда не отдаёт медиа сам вне DEBUG.
    urlpatterns += static(
        settings.MEDIA_URL, document_root=settings.MEDIA_ROOT
    )
