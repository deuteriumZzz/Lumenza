from django.urls import path

from automations.views import (
    PendingActionDetailView,
    PendingActionListCreateView,
    ScheduledAgentRunDetailView,
    ScheduledAgentRunListCreateView,
    TelegramChannelDetailView,
    TelegramChannelListCreateView,
    cancel_pending_action_view,
    confirm_pending_action_view,
)

urlpatterns = [
    path(
        "automations/telegram-channels/",
        TelegramChannelListCreateView.as_view(),
        name="telegram-channel-list",
    ),
    path(
        "automations/telegram-channels/<int:pk>/",
        TelegramChannelDetailView.as_view(),
        name="telegram-channel-detail",
    ),
    path(
        "automations/schedules/",
        ScheduledAgentRunListCreateView.as_view(),
        name="schedule-list",
    ),
    path(
        "automations/schedules/<int:pk>/",
        ScheduledAgentRunDetailView.as_view(),
        name="schedule-detail",
    ),
    path(
        "automations/pending-actions/",
        PendingActionListCreateView.as_view(),
        name="pending-action-list",
    ),
    path(
        "automations/pending-actions/<int:pk>/",
        PendingActionDetailView.as_view(),
        name="pending-action-detail",
    ),
    path(
        "automations/pending-actions/<int:pk>/confirm/",
        confirm_pending_action_view,
        name="pending-action-confirm",
    ),
    path(
        "automations/pending-actions/<int:pk>/cancel/",
        cancel_pending_action_view,
        name="pending-action-cancel",
    ),
]
