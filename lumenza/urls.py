from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/billing/", include("billing.urls")),
    path("api/", include("providers.urls")),
    path("api/", include("imagegen.urls")),
]

if settings.DEBUG:
    # Generated images are served straight off disk in dev. In production
    # this must be a real object store / CDN in front of MEDIA_URL — Django
    # never serves media itself outside DEBUG.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
