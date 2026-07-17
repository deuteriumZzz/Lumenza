from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("providers.urls")),
]
