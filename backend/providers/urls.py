from django.urls import path

from providers.views import (
    ChatHistoryView,
    PresetDetailView,
    PresetListCreateView,
    ThreadDetailView,
    ThreadListCreateView,
    chat,
    thread_message,
    thread_message_stream,
    thread_message_stream_events,
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
    path(
        "threads/<int:thread_id>/messages/stream/",
        thread_message_stream,
        name="thread-message-stream",
    ),
    path(
        "threads/<int:thread_id>/messages/stream/<str:generation_id>/",
        thread_message_stream_events,
        name="thread-message-stream-events",
    ),
    path("presets/", PresetListCreateView.as_view(), name="preset-list"),
    path(
        "presets/<int:pk>/",
        PresetDetailView.as_view(),
        name="preset-detail",
    ),
]
