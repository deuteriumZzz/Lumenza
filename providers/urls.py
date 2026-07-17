from django.urls import path

from providers.views import chat

urlpatterns = [
    path("chat/", chat, name="chat"),
]
