from django.urls import re_path

from media_ops.consumers import VoiceLiveConsumer

websocket_urlpatterns = [
    re_path(r"^ws/voice/$", VoiceLiveConsumer.as_asgi()),
]
