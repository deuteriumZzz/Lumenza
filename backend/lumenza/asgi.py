import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "lumenza.settings")

# get_asgi_application() должен вызываться ДО любого импорта, который
# трогает модели/приложения (см. предупреждение в документации Channels)
# — иначе AppRegistryNotReady, потому что реестр приложений Django ещё
# не заполнен на момент импорта media_ops.routing.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from media_ops.middleware import TokenAuthMiddleware  # noqa: E402
from media_ops.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": TokenAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
