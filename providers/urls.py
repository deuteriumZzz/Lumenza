from django.urls import path

from providers.views import ChatHistoryView, chat

urlpatterns = [
    path("chat/", chat, name="chat"),
    path("history/", ChatHistoryView.as_view(), name="chat-history"),
]
