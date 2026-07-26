from django.urls import path

from providers.views import (
    ChatHistoryView,
    ThreadDetailView,
    ThreadListCreateView,
    chat,
    thread_message,
    usage_summary,
)

urlpatterns = [
    path("chat/", chat, name="chat"),
    path("history/", ChatHistoryView.as_view(), name="chat-history"),
    path(
        "providers/usage-summary/",
        usage_summary,
        name="usage-summary",
    ),
    path("threads/", ThreadListCreateView.as_view(), name="thread-list"),
    path("threads/<int:pk>/", ThreadDetailView.as_view(), name="thread-detail"),
    path(
        "threads/<int:thread_id>/messages/",
        thread_message,
        name="thread-message",
    ),
]
